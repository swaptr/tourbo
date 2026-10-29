import { Form, Link, useNavigation } from "react-router";

import { RunTabs } from "~/components/run-tabs";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getRun } from "../../server/core/agent/runs.server";
import { outreachMode } from "../../server/core/outreach/email.server";
import {
  confirm,
  draftAll,
  listOutreach,
  sendAll,
  sendDraft,
  simulateReply,
  updateDraft,
} from "../../server/core/outreach/outreach.server";
import type { Outreach, OutreachStatus } from "../../server/core/shared/types";
import type { Route } from "./+types/plan.$id.pipeline";

const UUID = /^[0-9a-f-]{36}$/i;

const COLUMNS: { status: OutreachStatus; label: string }[] = [
  { status: "drafted", label: "Drafted" },
  { status: "sent", label: "Sent" },
  { status: "interested", label: "Interested" },
  { status: "hold", label: "Hold" },
  { status: "passed", label: "Passed" },
  { status: "confirmed", label: "Confirmed" },
];

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName}: outreach — Tourbo` : "Tourbo" }];
}

async function loadRun(id: string) {
  const run = UUID.test(id) ? await getRun(id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  return run;
}

export async function loader({ params }: Route.LoaderArgs) {
  const run = await loadRun(params.id);
  return {
    id: run.id,
    artistName: run.plan?.artist.name ?? run.artistName,
    hasPlan: Boolean(run.plan),
    outreach: await listOutreach(run.id),
    mode: outreachMode(),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const run = await loadRun(params.id);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") ?? "");
  // Row-level intents must target this run's outreach.
  if (id && !(await listOutreach(run.id)).some((o) => o.id === id)) throw new Response("Not found", { status: 404 });
  try {
    switch (intent) {
      case "draft-all":
        await draftAll(run.id);
        break;
      case "send-all":
        await sendAll(run.id);
        break;
      case "save":
        await updateDraft(id, String(form.get("subject")), String(form.get("body")));
        break;
      case "send":
        await updateDraft(id, String(form.get("subject")), String(form.get("body")));
        await sendDraft(id);
        break;
      case "simulate": {
        const kind = String(form.get("kind"));
        if (kind === "interested" || kind === "hold" || kind === "pass") await simulateReply(id, kind);
        break;
      }
      case "confirm":
        await confirm(id);
        break;
    }
  } catch (error) {
    return { error: (error as Error).message };
  }
  return null;
}

export default function Pipeline({ loaderData, actionData }: Route.ComponentProps) {
  const { outreach, mode } = loaderData;
  const busy = useNavigation().state !== "idle";
  const drafted = outreach.filter((o) => o.status === "drafted").length;

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{loaderData.artistName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Venue outreach. Sandbox: every email goes to <span className="font-mono">{mode.inbox}</span>, never to a
          venue
          {mode.sending === "simulated" && " (no Resend key: sends are simulated)"}. Replies are classified by Claude;
          a pass promotes the backup venue and drafts a new inquiry.
        </p>
      </div>
      <RunTabs runId={loaderData.id} />

      {!loaderData.hasPlan ? (
        <p className="text-sm text-muted-foreground">
          Outreach starts once the plan is ready. <Link to={`/plan/${loaderData.id}`} className="underline">Back to the plan</Link>
        </p>
      ) : (
        <>
          <Form method="post" className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="draft-all" variant="outline" disabled={busy}>
              {outreach.length ? "Draft missing inquiries" : "Draft venue inquiries"}
            </Button>
            {drafted > 0 && (
              <Button type="submit" name="intent" value="send-all" disabled={busy}>
                Approve & send all ({drafted})
              </Button>
            )}
            {busy && <span className="self-center text-sm text-muted-foreground">Working…</span>}
          </Form>
          {actionData?.error && <p className="text-sm text-destructive">{actionData.error}</p>}

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {COLUMNS.map((column) => {
              const items = outreach.filter((o) => o.status === column.status);
              return (
                <section key={column.status} className="space-y-2 rounded-xl bg-muted/50 p-2">
                  <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                    {column.label}
                    <Badge variant="outline">{items.length}</Badge>
                  </h2>
                  {items.map((o) => (
                    <OutreachCard key={o.id} item={o} busy={busy} />
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}

function OutreachCard({ item, busy }: { item: Outreach; busy: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">{item.venueName}</CardTitle>
        <CardDescription>{item.city}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {item.status === "drafted" ? (
          <details>
            <summary className="cursor-pointer text-muted-foreground">Review draft</summary>
            <Form method="post" className="mt-2 space-y-2">
              <input type="hidden" name="id" value={item.id} />
              <Input name="subject" defaultValue={item.subject} aria-label="Subject" />
              <Textarea name="body" defaultValue={item.draft} rows={10} aria-label="Body" className="text-xs" />
              <div className="flex gap-1">
                <Button type="submit" name="intent" value="send" size="xs" disabled={busy}>
                  Approve & send
                </Button>
                <Button type="submit" name="intent" value="save" size="xs" variant="ghost" disabled={busy}>
                  Save
                </Button>
              </div>
            </Form>
          </details>
        ) : (
          <p className="font-medium">{item.subject}</p>
        )}
        {item.replySummary && <p className="text-muted-foreground">“{item.replySummary}”</p>}
        {item.status === "sent" && (
          <Form method="post" className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="intent" value="simulate" />
            <span className="text-muted-foreground">Simulate reply:</span>
            {(["interested", "hold", "pass"] as const).map((kind) => (
              <Button key={kind} type="submit" name="kind" value={kind} size="xs" variant="outline" disabled={busy}>
                {kind}
              </Button>
            ))}
          </Form>
        )}
        {(item.status === "interested" || item.status === "hold") && (
          <Form method="post">
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" name="intent" value="confirm" size="xs" disabled={busy}>
              Mark confirmed
            </Button>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
