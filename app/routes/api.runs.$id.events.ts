import { getRun } from "../../server/core/agent/runs.server";
import { subscribe, traceHistory } from "../../server/core/agent/trace.server";
import type { TraceEvent } from "../../server/core/shared/types";
import type { Route } from "./+types/api.runs.$id.events";

const UUID = /^[0-9a-f-]{36}$/i;
const HEARTBEAT_MS = 15_000;

// SSE: replay stored events after Last-Event-ID, then stream live ones.
export async function loader({ params, request }: Route.LoaderArgs) {
  if (!UUID.test(params.id)) throw new Response("Not found", { status: 404 });
  const run = await getRun(params.id);
  if (!run) throw new Response("Not found", { status: 404 });

  // EventSource sends Last-Event-ID on reconnect; `?after=` covers the first connect.
  const resume = request.headers.get("Last-Event-ID") ?? new URL(request.url).searchParams.get("after");
  const after = Number(resume ?? 0) || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let last = after;
      let closed = false;
      const send = (event: TraceEvent) => {
        if (closed || event.seq <= last) return;
        last = event.seq;
        controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
        if (event.data?.done) close();
      };
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
        controller.close();
      };

      // Subscribe before replaying so nothing emitted in between is lost.
      const buffered: TraceEvent[] = [];
      let replaying = true;
      const unsubscribe = subscribe(run.id, (event) => (replaying ? buffered.push(event) : send(event)));
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, HEARTBEAT_MS);
      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
      });

      for (const event of await traceHistory(run.id, after)) send(event);
      replaying = false;
      for (const event of buffered) send(event);

      if (!closed && run.status !== "running" && run.status !== "pending") {
        if (run.status === "interrupted") {
          controller.enqueue(encoder.encode(`event: interrupted\ndata: {}\n\n`));
        }
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
