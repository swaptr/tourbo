import { db } from "@tourbo/core/db/client.server.ts";
import type { Pace } from "@tourbo/core/engine/pace.ts";
import { connectMcp } from "../mcp.server.ts";
import { getRun } from "./runs.server.ts";
import { appendTrace } from "./trace.server.ts";

// After booking: ticket check-ins (pace + advice via MCP tourbo_ticket_pace) and post-show
// results. Logged results calibrate the act's draw on the next plan (orchestrator pastShows).

export type Checkin = { stopIndex: number; sold: number; at: string; pace?: Pace };
export type ShowResult = { stopIndex: number; attendance: number; gross?: number; notes?: string };

const DAY = 86_400_000;

export async function recordCheckin(runId: string, stopIndex: number, sold: number): Promise<Pace> {
  const run = await getRun(runId);
  const stop = run?.plan?.stops[stopIndex];
  if (!run?.plan || !stop) throw new Error("No such show");
  const capacity = stop.money?.capacity ?? stop.capacity?.max ?? Math.max(sold, 1);
  const expected = stop.money?.tickets ?? Math.round(capacity * 0.8);
  const days = stop.date ? Math.max(0, Math.round((Date.parse(`${stop.date}T20:00:00`) - Date.now()) / DAY)) : 30;
  const emit = await appendTrace(runId);
  const mcp = await connectMcp(emit, ["tourbo"]);
  let pace: Pace;
  try {
    pace = await mcp.call<Pace>("tourbo_ticket_pace", {
      expected_tickets: Math.max(1, expected),
      capacity,
      sold,
      days_to_show: days,
      promo_left: stop.promo?.spend,
      has_smaller_room: Boolean(stop.backupVenue),
      currency: stop.money?.currency,
    });
  } finally {
    await mcp.close().catch(() => {});
  }
  const sql = await db();
  await sql`insert into checkins (run_id, stop_index, sold) values (${runId}, ${stopIndex}, ${sold})`;
  emit("decision", `${stop.city.name}: ${sold} sold, ${days} days out → ${pace.status}. ${pace.actions[0] ?? ""}`, { city: stop.city.name, pace: pace.status });
  return pace;
}

export async function recordResult(runId: string, r: ShowResult) {
  const run = await getRun(runId);
  const stop = run?.plan?.stops[r.stopIndex];
  if (!run?.plan || !stop) throw new Error("No such show");
  const sql = await db();
  await sql`delete from show_results where run_id = ${runId} and city = ${stop.city.name}`;
  await sql`
    insert into show_results (run_id, artist_id, city, fan_index, attendance, gross, notes, played_on)
    values (${runId}, ${run.plan.artist.id}, ${stop.city.name}, ${stop.fanIndex ?? null}, ${r.attendance}, ${r.gross ?? null}, ${r.notes ?? null}, ${stop.date ?? null})`;
  const emit = await appendTrace(runId);
  const vs = stop.money?.tickets ? ` (plan said ~${stop.money.tickets})` : "";
  emit("decision", `${stop.city.name}: logged ${r.attendance} people${vs}; the next plan for ${run.plan.artist.name} calibrates from it`, { city: stop.city.name });
}

export async function liveState(runId: string) {
  const sql = await db();
  const [checkins, results] = await Promise.all([
    sql<{ stop_index: number; sold: number; created_at: Date }[]>`
      select distinct on (stop_index) stop_index, sold, created_at from checkins where run_id = ${runId} order by stop_index, created_at desc`,
    sql<{ city: string; attendance: number; gross: string | null; notes: string | null }[]>`
      select city, attendance, gross, notes from show_results where run_id = ${runId}`,
  ]);
  return {
    checkins: Object.fromEntries(checkins.map((c) => [c.stop_index, { sold: c.sold, at: c.created_at.toISOString() }])),
    results: Object.fromEntries(results.map((r) => [r.city, { attendance: r.attendance, gross: r.gross ? Number(r.gross) : undefined, notes: r.notes ?? undefined }])),
  };
}
