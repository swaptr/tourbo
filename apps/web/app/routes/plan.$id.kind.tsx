import { redirect } from "react-router";

import { discipline, isKindTab, tabHasData, tabLabel, workspaceFor, type KindTabId } from "@tourbo/core/disciplines/index.ts";
import { KindTab } from "~/components/kind-tabs";
import { getRun } from "../../server/agent/runs.server";
import { nightKindIdeas, tabCounts } from "../../server/agent/nights.server";
import type { Route } from "./+types/plan.$id.kind";

// The tabs only some kinds get (Covers, Openers, Crowd, Tone, Sales, Sessions, Pitches): one module
// registered once per path in routes.ts. Which kind gets which is data (workspaceFor(kind)); a tab
// the kind doesn't have, or one with nothing in it yet, goes back to the plan instead of opening empty.

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.label} · ${loaderData.artistName}'s tour — Tourbo` : "Tourbo" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  // Client navigations fetch "/plan/:id/covers.data" (single fetch): drop the suffix.
  const tab = url.pathname.replace(/\.data$/, "").replace(/\/$/, "").split("/").pop() ?? "";
  const plan = run.plan;
  const base = `/plan/${run.id}${url.search}`;
  if (!plan || run.status !== "done" || !isKindTab(tab)) throw redirect(base);
  const kind = plan.artist.kind ?? "musician";
  const w = workspaceFor(kind);
  if (![...w.main, ...w.more].includes(tab)) throw redirect(base);
  const needsIdeas = tab === "covers" || tab === "crowd";
  const [counts, ideas] = await Promise.all([needsIdeas ? tabCounts(run).catch(() => undefined) : undefined, needsIdeas ? nightKindIdeas(run).catch(() => undefined) : undefined]);
  if (!tabHasData(tab, plan, counts)) throw redirect(base);
  return {
    id: run.id,
    tab: tab as KindTabId,
    label: tabLabel(w, tab),
    kind,
    artistName: plan.artist.name ?? run.artistName,
    plan,
    support: discipline(kind).support,
    shows: discipline(kind).shows ?? 1,
    stayDays: discipline(kind).stayDays,
    workshop: discipline(kind).workshop,
    hasPermits: [...w.main, ...w.more].includes("pipeline"),
    covers: ideas?.covers ?? {},
    questions: ideas?.questions ?? {},
  };
}

export default function KindTabRoute({ loaderData }: Route.ComponentProps) {
  return <KindTab data={loaderData} />;
}
