import { randomBytes } from "node:crypto";

import { getRun, savePlan } from "../agent/runs.server.ts";
import { appendTrace } from "../agent/trace.server.ts";
import { db } from "../db/client.server.ts";
import type { Outreach, OutreachStatus } from "../shared/types.ts";
import { sendEmail } from "./email.server.ts";
import { classifyReply, draftInquiry } from "./llm.ts";

type Row = {
  id: string;
  run_id: string;
  stop_index: number;
  city: string;
  venue_id: string;
  venue_name: string;
  status: OutreachStatus;
  subject: string;
  draft: string;
  thread_token: string;
  last_reply: string | null;
  reply_summary: string | null;
  updated_at: Date;
};

const toOutreach = (r: Row): Outreach => ({
  id: r.id,
  runId: r.run_id,
  stopIndex: r.stop_index,
  city: r.city,
  venueId: r.venue_id,
  venueName: r.venue_name,
  status: r.status,
  subject: r.subject,
  draft: r.draft,
  lastReply: r.last_reply,
  replySummary: r.reply_summary,
  updatedAt: r.updated_at.toISOString(),
});

export async function listOutreach(runId: string): Promise<Outreach[]> {
  const sql = await db();
  const rows = await sql<Row[]>`select * from outreach where run_id = ${runId} order by stop_index, created_at`;
  return rows.map(toOutreach);
}

async function getRow(id: string) {
  const sql = await db();
  const [row] = await sql<Row[]>`select * from outreach where id = ${id}`;
  return row;
}

async function insertDraft(runId: string, stopIndex: number) {
  const run = await getRun(runId);
  const stop = run?.plan?.stops[stopIndex];
  if (!run?.plan || !stop?.venue) return undefined;
  const draft = await draftInquiry(run.plan.artist, stop, stop.venue);
  const sql = await db();
  const [row] = await sql<Row[]>`
    insert into outreach (run_id, stop_index, city, venue_id, venue_name, status, subject, draft, thread_token)
    values (${runId}, ${stopIndex}, ${stop.city.name}, ${stop.venue.id}, ${stop.venue.name}, 'drafted',
      ${draft.subject}, ${draft.body}, ${randomBytes(8).toString("hex")})
    returning *
  `;
  return row;
}

// One inquiry per stop that has a venue and no email yet.
export async function draftAll(runId: string) {
  const run = await getRun(runId);
  if (!run?.plan) throw new Error("Run has no plan yet");
  const existing = new Set((await listOutreach(runId)).map((o) => o.stopIndex));
  const emit = await appendTrace(runId);
  const rows = await Promise.all(
    run.plan.stops.map((stop, i) => (existing.has(i) || !stop.venue ? undefined : insertDraft(runId, i))),
  );
  const drafted = rows.filter((r) => r !== undefined);
  emit("decision", `Outreach: drafted ${drafted.length} venue inquiries`, { drafted: drafted.length });
}

export async function sendDraft(id: string) {
  const row = await getRow(id);
  if (!row || row.status !== "drafted") return;
  const emailId = await sendEmail({ subject: row.subject, text: row.draft, token: row.thread_token });
  const sql = await db();
  await sql`update outreach set status = 'sent', updated_at = now() where id = ${id}`;
  const emit = await appendTrace(row.run_id);
  emit("decision", `Outreach: sent inquiry to ${row.venue_name} (${row.city})${emailId ? "" : " [simulated]"}`, {
    city: row.city,
    simulated: !emailId,
  });
}

export async function sendAll(runId: string) {
  for (const o of await listOutreach(runId)) if (o.status === "drafted") await sendDraft(o.id);
}

export async function confirm(id: string) {
  const sql = await db();
  await sql`update outreach set status = 'confirmed', updated_at = now()
    where id = ${id} and status in ('interested', 'hold')`;
}

export async function updateDraft(id: string, subject: string, body: string) {
  const sql = await db();
  await sql`update outreach set subject = ${subject}, draft = ${body}, updated_at = now()
    where id = ${id} and status = 'drafted'`;
}

// Shared by the inbound webhook and the "simulate reply" button.
export async function handleReply(token: string, text: string) {
  const sql = await db();
  const [row] = await sql<Row[]>`select * from outreach where thread_token = ${token}`;
  if (!row) return false;
  const { intent, summary } = await classifyReply(text);
  const status: OutreachStatus = intent === "pass" ? "passed" : intent;
  await sql`update outreach set status = ${status}, last_reply = ${text}, reply_summary = ${summary}, updated_at = now()
    where id = ${row.id}`;
  const emit = await appendTrace(row.run_id);
  emit("decision", `Outreach: ${row.venue_name} replied (${intent}): ${summary}`, { city: row.city, intent });
  if (intent === "pass") await promoteBackup(row, emit);
  return true;
}

// A pass swaps in the backup venue, updates the plan and drafts a new inquiry.
async function promoteBackup(row: Row, emit: Awaited<ReturnType<typeof appendTrace>>) {
  const run = await getRun(row.run_id);
  const stop = run?.plan?.stops[row.stop_index];
  if (!run?.plan || !stop) return;
  if (stop.venue?.id !== row.venue_id) return; // already replaced
  if (!stop.backupVenue) {
    emit("repair", `${row.city}: ${row.venue_name} passed and there is no backup; re-plan this city`, { city: row.city });
    return;
  }
  const backup = stop.backupVenue;
  const stops = run.plan.stops.map((s, i) => (i === row.stop_index ? { ...s, venue: backup, backupVenue: undefined } : s));
  await savePlan(run.id, { ...run.plan, stops });
  await insertDraft(run.id, row.stop_index);
  emit("repair", `${row.city}: ${row.venue_name} passed → promoted backup ${backup.name}, drafted a new inquiry`, {
    city: row.city,
  });
}

const SIMULATED: Record<"interested" | "hold" | "pass", string> = {
  interested:
    "Thanks for reaching out! That date is open and we'd love to host. Sending our rate card and tech rider today. Can you confirm by Friday?",
  hold: "We have a soft hold on that night already. We can pencil you in as second hold, or offer the following Tuesday. Let us know.",
  pass: "Thanks for thinking of us, but we're fully booked that week and can't take the show. Best of luck with the tour.",
};

export async function simulateReply(id: string, kind: keyof typeof SIMULATED) {
  const row = await getRow(id);
  if (!row || row.status !== "sent") return;
  await handleReply(row.thread_token, SIMULATED[kind]);
}
