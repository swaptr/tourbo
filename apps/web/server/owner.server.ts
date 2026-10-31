import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@tourbo/core/db/client.server.ts";

import { isActive } from "./agent/runs.server.ts";

// Owner keys (PLAN Q16): no accounts, so whoever creates a run or project gets a random key, kept
// in their browser (localStorage "tourbo:work") and sent as X-Owner-Key. The server keeps only
// its sha256. Share links (the bare id) stay read-only.

export const OWNER_HEADER = "x-owner-key";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHECK_FAILED = "We couldn't check that this is yours just now. Try again in a moment.";
export const FORBIDDEN = "Only the browser that made this can change or delete it. Open it from that browser, or import your work there.";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export function newOwnerKey() {
  const key = randomBytes(24).toString("base64url");
  return { key, hash: hash(key) };
}

export type OwnedKind = "run" | "project" | "profile" | "event";

// undefined: no such row. null: row made before owner keys (or via MCP).
export async function ownerHash(kind: OwnedKind, id: string): Promise<string | null | undefined> {
  if (!UUID.test(id)) return undefined;
  const sql = await db();
  const rows =
    kind === "run"
      ? await sql<{ owner_hash: string | null }[]>`select owner_hash from runs where id = ${id}`
      : kind === "project"
        ? await sql<{ owner_hash: string | null }[]>`select owner_hash from projects where id = ${id}`
        : kind === "profile"
          ? await sql<{ owner_hash: string | null }[]>`select owner_hash from profiles where id = ${id}`
          : await sql<{ owner_hash: string | null }[]>`select owner_hash from events where id = ${id}`;
  return rows[0] ? rows[0].owner_hash : undefined;
}

export function keyMatches(stored: string, key: string | null | undefined) {
  if (!key) return false;
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hash(key), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OwnerCheck = "ok" | "missing" | "forbidden";

// strict: rows without an owner key are refused too (delete). Otherwise they stay open (legacy),
// except plans: every website plan gets a key, so an ownerless one (made via MCP) is read-only here.
export async function checkOwner(kind: OwnedKind, id: string, key: string | null | undefined, strict = false): Promise<OwnerCheck> {
  const stored = await ownerHash(kind, id);
  if (stored === undefined) return "missing";
  if (stored === null) return strict || kind === "run" ? "forbidden" : "ok";
  return keyMatches(stored, key) ? "ok" : "forbidden";
}

export const ownerKeyOf = (request: Request) => request.headers.get(OWNER_HEADER);

// Plain-sentence JSON responses for the owner-key API routes.
export const forbidden = () => Response.json({ error: FORBIDDEN }, { status: 403 });
export const notFound = (what = "This") => Response.json({ error: `${what} isn't here any more. It may have been deleted.` }, { status: 404 });

// Status of items the browser already knows (by id), for the "Continue" list. No listing: only
// ids the caller sends come back.
export async function workStatus(items: { kind: OwnedKind; id: string }[]) {
  const sql = await db();
  const runIds = [...new Set(items.filter((i) => i.kind === "run" && UUID.test(i.id)).map((i) => i.id))].slice(0, 200);
  const projectIds = [...new Set(items.filter((i) => i.kind === "project" && UUID.test(i.id)).map((i) => i.id))].slice(0, 200);
  const [runs, projects] = await Promise.all([
    runIds.length
      ? sql<{ id: string; status: string }[]>`select id, status from runs where id = any(${runIds}::uuid[])`
      : [],
    projectIds.length ? sql<{ id: string }[]>`select id from projects where id = any(${projectIds}::uuid[])` : [],
  ]);
  // Same rule as getRun: "running" that this process doesn't own was cut off by a restart.
  const live = (r: { id: string; status: string }) => ((r.status === "running" || r.status === "pending") && !isActive(r.id) ? "interrupted" : r.status);
  return { runs: runs.map((r) => ({ id: r.id, status: live(r) })), projects: projects.map((p) => p.id) };
}

export async function deleteOwned(kind: OwnedKind, id: string) {
  const sql = await db();
  if (kind === "run") await sql`delete from runs where id = ${id}`;
  else if (kind === "project") await sql`delete from projects where id = ${id}`;
  else if (kind === "profile") await sql`delete from profiles where id = ${id}`;
  else await sql`delete from events where id = ${id}`;
}

// Root middleware: any non-GET request to a plan (/plan/:id/...) or project page (/projects/:id)
// is an edit, so it needs that item's owner key. Share links stay read-only. Client-side the key
// is attached by installOwnerFetch() (app/lib/work.ts).
const OWNED_PATH = /^\/(plan|projects|events)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/.]|$)/i;
// Returns the refusal sentence, or undefined to let the request through.
export async function ownerGuard(request: Request): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const m = OWNED_PATH.exec(new URL(request.url).pathname);
  if (!m) return undefined;
  const check = await checkOwner(m[1] === "plan" ? "run" : m[1] === "events" ? "event" : "project", m[2], ownerKeyOf(request)).catch(() => "error" as const);
  if (check === "error") return CHECK_FAILED; // fail closed
  return check === "forbidden" ? FORBIDDEN : undefined;
}
