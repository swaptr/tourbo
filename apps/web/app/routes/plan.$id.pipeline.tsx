import { Form, Link, useNavigation } from "react-router";

import { RunTabs } from "~/components/run-tabs";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getRun } from "../../server/agent/runs.server";
import { outreachMode } from "../../server/outreach/email.server";
import {
  confirm,
  draftAll,
  listOutreach,
  sendAll,
  sendDraft,
  sendNegotiation,
  simulateReply,
  type OfferState,
  updateDraft,
} from "../../server/outreach/outreach.server";
import type { Outreach, OutreachStatus } from "@tourbo/core/shared/types.ts";
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
        if (kind === "interested" || kind === "hold" || kind === "pass" || kind === "offer") await simulateReply(id, kind);
        break;
      }
      case "confirm":
        await confirm(id);
        break;
      case "send-negotiation":
        await sendNegotiation(id);
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
        <h1 className="font-heading text-2xl tracking-tight">{loaderData.artistName}: venue emails</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Tourbo drafts one email per venue; you approve before anything is sent. When a venue replies with an offer, Tourbo
          checks it against your lowest fee and drafts an accept, a counter or a polite no.{" "}
          <span className="text-xs">
            Demo sandbox: emails go to <span className="font-medium">{mode.inbox}</span>
            {mode.sending === "simulated" && " (simulated, no email key)"}, never to a real venue.
          </span>
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
        <CardTitle className="text-base">{item.venueName}</CardTitle>
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
            {(["offer", "interested", "hold", "pass"] as const).map((kind) => (
              <Button key={kind} type="submit" name="kind" value={kind} size="xs" variant="outline" disabled={busy}>
                {kind}
              </Button>
            ))}
          </Form>
        )}
        {item.offer ? <OfferBlock id={item.id} offer={item.offer as OfferState} busy={busy} /> : null}
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

const DECISION: Record<string, string> = {
  accept: "bg-success/15 text-success",
  counter: "bg-warning/15 text-warning",
  walk_away: "bg-destructive/15 text-destructive",
};

const terms = (o: { deal: string; guarantee?: number | null; split?: number | null; price?: number | null; capacity?: number | null }) =>
  [
    o.deal.replace("_", " "),
    o.guarantee != null && `guarantee ${o.guarantee}`,
    o.split != null && `${Math.round(o.split * 100)}% door`,
    o.price != null && `tickets ${o.price}`,
    o.capacity != null && `cap ${o.capacity}`,
  ]
    .filter(Boolean)
    .join(" · ");

// Negotiation: venue terms → deterministic assessment (MCP tourbo_assess_offer) → drafted reply.
function OfferBlock({ id, offer, busy }: { id: string; offer: OfferState; busy: boolean }) {
  const a = offer.assessment;
  return (
    <div className="space-y-1.5 rounded-lg border p-2">
      <p>
        <span className="text-muted-foreground">Offer:</span> {terms(offer.terms)}
      </p>
      {a && (
        <>
          <p className="flex flex-wrap items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 font-medium ${DECISION[a.decision]}`}>{a.decision.replace("_", " ")}</span>
            <span>
              profit {a.offered.profit} {a.currency} vs planned {a.planned.profit}
            </span>
          </p>
          {a.counter && (
            <p>
              <span className="text-muted-foreground">Counter:</span> {terms(a.counter)} → profit {a.counter.profit}
            </p>
          )}
          <ul className="list-disc pl-4 text-muted-foreground">
            {a.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {offer.error && <p className="text-destructive">{offer.error}</p>}
      {offer.reply && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{offer.sent ? "Reply sent" : "Review reply"}</summary>
          <p className="mt-1 font-medium">{offer.reply.subject}</p>
          <p className="whitespace-pre-line">{offer.reply.body}</p>
          {!offer.sent && (
            <Form method="post" className="mt-1">
              <input type="hidden" name="id" value={id} />
              <Button type="submit" name="intent" value="send-negotiation" size="xs" disabled={busy}>
                Approve & send
              </Button>
            </Form>
          )}
        </details>
      )}
    </div>
  );
}
