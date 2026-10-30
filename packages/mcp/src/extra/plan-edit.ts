// tourbo_plan_edit (PLAN §18 Q13 / Q19): change a saved plan the way the website's map and "Change"
// do, through the same versioned edit list (@tourbo/core/runs/edits.server.ts). Deterministic on
// the run's own candidates: no fan-data calls. Ownership: like tourbo_project_update, the id is the
// capability (runs are unguessable uuids); there is no auth (PLAN Q4 dropped).
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { DROPPED, preferences, stopKey, type Edit as EditT, type Pool } from "@tourbo/core/engine/edit.ts";
import { changeEdits, editState, loadPool, type Change } from "@tourbo/core/runs/edits.server.ts";
import { runPlanRow } from "@tourbo/core/runs/steps.server.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";

import { UserError } from "../errors.ts";
import { num, obj, str } from "../tourbo/outputs.ts";
import { TOURBO_TOOLS, type ToolDef } from "../tourbo/tools.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const night = z.string().min(1).max(200).describe("Night key from this tool's nights[].key");
// Same ops as POST /plan/:id/edits (apps/web/app/routes/plan.$id.edits.ts).
export const Edit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("swapCity"), night, city: z.string().min(1).max(120), venueId: z.string().max(120).optional() }),
  z.object({ op: z.literal("swapVenue"), night, venueId: z.string().min(1).max(120) }),
  z.object({ op: z.literal("setDate"), night, date: z.iso.date() }),
  z.object({ op: z.literal("dropNight"), night }),
  z.object({ op: z.literal("restoreNight"), night }),
  z.object({ op: z.literal("addNight"), city: z.string().min(1).max(120), venueId: z.string().max(120).optional(), at: z.number().int().min(0).max(40).optional() }),
  z.object({ op: z.literal("reorder"), night, to: z.number().int().min(0).max(40) }),
  z.object({
    op: z.literal("setLevers"),
    levers: z.object({
      ticketPrice: z.number().positive().nullable().optional(),
      roomMin: z.number().int().positive().optional(),
      roomMax: z.number().int().positive().optional(),
      crew: z.number().int().min(1).max(20).optional(),
      minGuarantee: z.number().nonnegative().nullable().optional(),
    }),
  }),
]);

const Totals = obj({ currency: z.string(), gross: z.number(), artistTake: z.number(), costs: z.number(), profit: z.number() });
const Night = obj({
  key: z.string(),
  night: z.number().describe("1-based position"),
  city: z.string(),
  venue: str,
  venueId: str,
  date: str,
  verdict: str,
  profit: num,
  dropped: z.boolean(),
  yours: z.boolean().describe("The act changed this night"),
});
const Candidate = obj({ city: z.string(), score: z.number(), venues: z.array(obj({ id: z.string(), name: z.string(), roomType: z.string(), capacity: z.number() })) });

type Action = "view" | "apply" | "undo" | "reset" | "dismiss" | "restorePref";
type Input = { run_id: string; action?: Action; edits?: EditT[]; pref?: string; version?: number; candidates: boolean };

const summary = (plan: Plan) => ({
  money: plan.money ? { currency: plan.money.currency, gross: plan.money.gross, artistTake: plan.money.artistTake, costs: plan.money.costs, profit: plan.money.profit } : undefined,
  totalKm: plan.totalKm,
  route: plan.legs.map((l) => ({ from: l.from, to: l.to, km: l.km })),
  nights: plan.stops.map((s, i) => ({
    key: stopKey(s),
    night: i + 1,
    city: s.city.name,
    venue: s.venue?.name ?? null,
    venueId: s.venue?.id ?? null,
    date: s.date ?? null,
    verdict: s.money?.verdict ?? null,
    profit: s.money?.profit ?? null,
    dropped: s.money?.reason === DROPPED,
    yours: !!s.yours,
  })),
});

const MAX_VENUES = 6;
const candidatesOf = (pool: Pool) =>
  pool.cities.map((c) => ({ city: c.name, score: c.score, venues: c.venues.slice(0, MAX_VENUES).map((v) => ({ id: v.id, name: v.name, roomType: v.roomType, capacity: v.capacity })) }));

export const PLAN_EDIT_TOOL: ToolDef = {
  name: "tourbo_plan_edit",
  title: "Change a saved tour plan",
  hints: { readOnly: false, idempotent: false, openWorld: false, destructive: true },
  output: obj({
    run_id: z.string(),
    version: z.number().describe("Pass back as version on the next change"),
    edits: z.number().describe("Edits now applied on top of Tourbo's plan"),
    money: Totals.optional().describe("Tour totals over played nights (estimates)"),
    totalKm: z.number(),
    route: z.array(obj({ from: z.string(), to: z.string(), km: z.number() })),
    nights: z.array(Night),
    change: obj({ profit: z.number(), gross: z.number(), costs: z.number(), km: z.number(), fans: z.number(), changed: z.array(z.string()), removed: z.array(z.string()) }).optional().describe("Versus the plan before this call"),
    preferences: z.array(obj({ id: z.string(), text: z.string(), count: z.number() })),
    notice: str.describe("A new preference Tourbo noticed from this edit"),
    errors: z.array(z.string()).describe("Earlier edits that no longer apply"),
    candidates: z.array(Candidate).optional(),
  }),
  description:
    "Change a saved tour plan (run_id = the id in /plan/<id>, from the website or the hosted agent) and get the recomputed money and route. action view (default without edits) returns the nights with their keys; candidates:true adds the cities and rooms this plan already checked (swapCity / addNight / swapVenue pick from them). action apply takes edits (ops: swapCity, swapVenue, setDate, dropNight, restoreNight, addNight, reorder, setLevers); several edits apply as one step and undo together. undo takes the last step back, reset returns to Tourbo's plan, dismiss / restorePref hide or bring back a noticed preference (pref id). Pass version from the last result to avoid overwriting a change made elsewhere. Same edit list as the website, so every tab sees it. No fan-data calls; anyone with the run id can change the plan.",
  input: z.object({
    run_id: z.string(),
    action: z.enum(["view", "apply", "undo", "reset", "dismiss", "restorePref"]).optional().describe("Default: apply when edits are given, else view"),
    edits: z.array(Edit).max(20).optional(),
    pref: z.string().max(80).optional().describe("Preference id for dismiss / restorePref"),
    version: z.number().int().optional(),
    candidates: z.boolean().default(false).describe("Include the candidate cities and rooms"),
  }),
  run: async (p: Input) => {
    if (!UUID.test(p.run_id)) throw new UserError("That plan id isn't valid: use the id from /plan/<id>.");
    const action: Action = p.action ?? (p.edits?.length ? "apply" : "view");
    const row = await runPlanRow(p.run_id);
    if (!row?.plan) throw new UserError(row ? `That plan has no nights yet (status: ${row.status}); try again when it's done.` : "No plan with that id: it may have been deleted.");
    if (action === "view") {
      const [state, pool] = await Promise.all([editState(p.run_id), p.candidates ? loadPool(row) : undefined]);
      return { run_id: p.run_id, version: state.version, edits: state.edits.length, ...summary(row.plan), preferences: preferences(state.edits, state.dismissed), errors: [], ...(pool ? { candidates: candidatesOf(pool) } : {}) };
    }
    let change: Change;
    if (action === "apply") {
      if (!p.edits?.length) throw new UserError("Pass edits to apply (e.g. [{op:'dropNight', night:'<key>'}]); call with action view for the night keys.");
      change = p.edits.length === 1 ? { kind: "apply", edit: p.edits[0] } : { kind: "applyMany", edits: p.edits, group: `mcp-${randomUUID()}` };
    } else if (action === "dismiss" || action === "restorePref") {
      if (!p.pref) throw new UserError(`Pass pref (a preference id from preferences[]) to ${action}.`);
      change = { kind: action, pref: p.pref };
    } else change = { kind: action };
    const r = await changeEdits(p.run_id, change, p.version);
    // The web's version message says "reload"; an agent re-reads with view instead.
    if (!r.ok) throw new UserError(r.status === 409 && p.version !== undefined && /another tab/.test(r.error) ? "This plan changed since that version: call with action view for the latest version, then try again." : r.error);
    const pool = p.candidates ? await loadPool({ id: p.run_id, plan: r.plan }) : undefined;
    return {
      run_id: p.run_id,
      version: r.state.version,
      edits: r.state.edits.length,
      ...summary(r.plan),
      change: { ...r.diff.totals, changed: r.diff.changed, removed: r.diff.removed },
      preferences: r.prefs,
      notice: r.notice?.text ?? null,
      errors: r.errors,
      ...(pool ? { candidates: candidatesOf(pool) } : {}),
    };
  },
};

TOURBO_TOOLS.push(PLAN_EDIT_TOOL);
