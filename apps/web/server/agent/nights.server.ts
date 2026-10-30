import { db } from "@tourbo/core/db/client.server.ts";
import type { MaterialDetails } from "@tourbo/core/material/material.ts";
import { applyFeedbackToCity } from "@tourbo/core/engine/idea-feedback.ts";
import { CATEGORY_LABEL, norm, tagCase, type CityIdeas } from "@tourbo/core/engine/ideas-rank.ts";
import { isGenre } from "@tourbo/core/engine/places.ts";
import { workspaceFor } from "@tourbo/core/disciplines/index.ts";

import type { ShownCity } from "@tourbo/core/engine/idea-feedback.ts";
import { feedbackState, ideasInputsFor, shownIdeas, type SavedIdeas } from "./ideas.server.ts";
import { getPreps } from "./prep.server.ts";
import { getSteps, type Run } from "./runs.server.ts";
import { savedSet } from "./set.server.ts";

// Tour workspace (PLAN Q21): what is already saved for a run, for tab badges and the night panel.
// DB reads only: never fan data or the AI.

const cityKey = (s: string) => norm(s.split(",")[0]);

// Cheap counts for the tour tabs (layout loader): no big JSON leaves the DB.
export async function tabCounts(run: Run, q?: URLSearchParams) {
  const sql = await db();
  const [ideas, set, prep, mail, kindIdeas] = await Promise.all([
    nightIdeaLists(run, q).catch(() => NO_IDEAS),
    sql<{ n: number }[]>`
      select jsonb_array_length(coalesce(output->'build'->'result'->'cities', '[]'::jsonb))::int as n
      from run_steps where run_id = ${run.id} and step = 'set_last' and key = 'last'`,
    sql<{ n: number }[]>`select count(*)::int as n from show_prep where run_id = ${run.id}`,
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from outreach where run_id = ${run.id} group by status`,
    // Kind tabs (Covers, Crowd) open only when the saved ideas hold covers / crowd questions.
    sql<{ covers: number; questions: number }[]>`
      select count(*) filter (where i->>'category' = 'cover')::int as covers, count(*) filter (where coalesce(i->>'question', '') <> '')::int as questions
      from run_steps, jsonb_array_elements(coalesce(output->'data'->'cities', '[]'::jsonb)) c, jsonb_array_elements(coalesce(c->'ideas', '[]'::jsonb)) i
      where run_id = ${run.id} and step in ('ideas', 'ideas_angles')`,
  ]);
  const by = (s: string) => mail.find((m) => m.status === s)?.n ?? 0;
  return {
    // The same lists the night panel and the Ideas page show (covers counted on their own tab).
    ideas: Object.values(ideas.lists).reduce((a, l) => a + l.length, 0),
    set: set[0]?.n ?? 0,
    prep: prep[0]?.n ?? 0,
    covers: kindIdeas[0]?.covers ?? 0,
    questions: kindIdeas[0]?.questions ?? 0,
    emails: { total: mail.reduce((a, m) => a + m.n, 0), drafts: by("drafted"), replies: by("interested") + by("hold") },
  };
}

export type NightIdea = { idea: string; angle: string; why: string; label: string; category: string };
export type NightSetLine = { title: string; minutes: number; local: boolean; move?: string; details?: MaterialDetails }; // move: built order; details: Library set
export type NightPrep = { hook: string; items: { section: string; text: string }[] };
// Per night (by index): the ideas the Ideas tab shows for it (shownIdeas: one source for the page,
// its badge and the night panel).
// cards: the night panel's idea cards (the act's Keep / More like this / Not for me on them).
export type NightCards = ShownCity & { more: string[] };
async function nightIdeaLists(run: Run, q?: URLSearchParams): Promise<{ lists: Record<number, ShownCity["ideas"]>; covers: Record<number, number>; cards: Record<number, NightCards> }> {
  const kind = run.plan?.artist.kind ?? "musician";
  const shown = await shownIdeas(run.id, kind, await ideasInputsFor(run.id, kind, q));
  const out = { lists: {} as Record<number, ShownCity["ideas"]>, covers: {} as Record<number, number>, cards: {} as Record<number, NightCards> };
  (run.plan?.stops ?? []).forEach((s, i) => {
    const c = shown?.cities.find((x) => cityKey(x.city) === cityKey(s.city.name));
    if (!c) return;
    if (c.ideas.length) out.lists[i] = c.ideas;
    if (c.covers) out.covers[i] = c.covers;
    out.cards[i] = { ...c, more: (shown?.feedback?.more ?? []).filter((m) => norm(m.city) === norm(c.city)).map((m) => m.ref) };
  });
  return out;
}
const NO_IDEAS: Awaited<ReturnType<typeof nightIdeaLists>> = { lists: {}, covers: {}, cards: {} };

// covers: per night, how many covers went to the Covers tab (kinds that have one).
export type NightExtras = { ideas: Record<number, NightIdea[]>; covers: Record<number, number>; cards: Record<number, NightCards>; set: Record<number, NightSetLine[]>; prep: Record<number, NightPrep> };

// Per night (by index in the current plan): its saved ideas (the act's Keep / Not for me applied),
// its running order from the last built set, and its show notes.
// q: the page URL's ideas context (?slot=&flavour=&b=), so the panel shows what the Ideas tab shows.
export async function nightExtras(run: Run, q?: URLSearchParams): Promise<NightExtras> {
  const stops = run.plan?.stops ?? [];
  const [ideas, set, preps] = await Promise.all([
    nightIdeaLists(run, q).catch(() => NO_IDEAS),
    savedSet(run.id).catch(() => undefined),
    getPreps(run.id).catch(() => ({}) as Awaited<ReturnType<typeof getPreps>>),
  ]);
  const out: NightExtras = { ideas: {}, covers: ideas.covers, cards: ideas.cards, set: {}, prep: {} };
  stops.forEach((s, i) => {
    const key = cityKey(s.city.name);
    const list = ideas.lists[i] ?? [];
    if (list.length) out.ideas[i] = list.map((x) => ({ idea: x.ref, angle: x.angle, why: x.why, label: CATEGORY_LABEL[x.category] ?? x.category, category: x.category }));
    const order = set?.build.result.cities.find((c) => cityKey(c.city) === key)?.order;
    if (order?.length) out.set[i] = order.map((o) => ({ title: o.title, minutes: o.minutes, local: o.item === undefined, move: o.move }));
    const p = preps[i];
    if (p) out.prep[i] = { hook: p.final.hook, items: p.final.items.map((x) => ({ section: x.section, text: x.text })) };
  });
  return out;
}

// Kind tabs (Covers, Crowd): per night, the saved covers and crowd-work questions, with the
// act's Keep / Not for me applied. DB reads only.
// value = local lift (fan data); ranks parsed from the idea's own why line; genre / style are the
// tags the cover angle was built from (fan data genre tag, the act's style), never raw ids.
export type NightCover = { ref: string; why: string; value: number; cityRank?: number; overallRank?: number; genre?: string; style?: string; image?: string; cities: string[] };
// Over-index: how far up this city's fans rank it vs your fans overall (unranked overall = 100).
const jump = (c: NightCover) => (c.overallRank ?? 100) - (c.cityRank ?? 100);
function coverOf(x: { ref: string; why: string; angle: string; value: number; image?: string; cities?: string[] }, key: string, places: string[]): NightCover {
  const num = (re: RegExp) => (x.why.match(re)?.[1] ? Number(x.why.match(re)![1]) : undefined);
  const m = x.angle.match(/Take their (.+?)(?: into your (.+?) style|,)/);
  const raw = x.angle.match(/into your (.+?) style/)?.[1];
  const style = raw && tagCase(raw);
  const genre = m?.[1] && isGenre(m[1], places) ? tagCase(m[1]) : undefined;
  return {
    ref: x.ref,
    why: x.why,
    value: x.value,
    cityRank: num(/^#(\d+)/),
    overallRank: num(/vs #(\d+) with your fans overall/),
    genre,
    style,
    image: x.image,
    cities: (x.cities ?? []).filter((c) => cityKey(c) !== key),
  };
}
export type NightQuestion = { question: string; ref: string; label: string; why: string };
export async function nightKindIdeas(run: Run): Promise<{ covers: Record<number, NightCover[]>; questions: Record<number, NightQuestion[]> }> {
  const stops = run.plan?.stops ?? [];
  const [ideas, angles, fb] = await Promise.all([
    getSteps<SavedIdeas>(run.id, "ideas").catch(() => new Map<string, SavedIdeas>()),
    getSteps<SavedIdeas>(run.id, "ideas_angles").catch(() => new Map<string, SavedIdeas>()),
    feedbackState(run.id).catch(() => undefined),
  ]);
  const saved = [...ideas.values(), ...angles.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const out = { covers: {} as Record<number, NightCover[]>, questions: {} as Record<number, NightQuestion[]> };
  const places = stops.map((t) => t.city.name);
  stops.forEach((s, i) => {
    const key = cityKey(s.city.name);
    const city = saved.map((x) => x.data.cities.find((c: CityIdeas) => cityKey(c.city) === key)).find(Boolean);
    const list = city ? (fb ? applyFeedbackToCity(city, fb.feedback).ideas : city.ideas) : [];
    const covers = list.filter((x) => x.category === "cover").map((x) => coverOf(x, key, places)).sort((a, b) => jump(b) - jump(a) || (a.cityRank ?? 99) - (b.cityRank ?? 99) || b.value - a.value);
    const questions = list.filter((x) => x.question).map((x) => ({ question: x.question!, ref: x.ref, label: CATEGORY_LABEL[x.category] ?? x.category, why: x.why }));
    if (covers.length) out.covers[i] = covers;
    if (questions.length) out.questions[i] = questions;
  });
  return out;
}
