// "Your work" without accounts (PLAN Q16): this browser's index of what it made, in localStorage
// ("tourbo:work"). Client-only; every function is a no-op on the server. The owner key of a plan
// or project lives here and goes out as X-Owner-Key on edits (installOwnerFetch).

export type WorkKind = "plan" | "set" | "prep" | "ideas" | "project" | "event";
export type WorkItem = {
  id: string; // run id for plan / set / prep / ideas-of-a-plan; project id; any stable id for city ideas
  kind: WorkKind;
  title: string;
  status?: string; // plan: pending | running | done | failed | interrupted; gone = deleted elsewhere
  updatedAt: string;
  ownerKey?: string;
  href?: string; // when not the default page for the kind
};

const KEY = "tourbo:work";
const EVENT = "tourbo:work";
const MAX = 200;
const OWNER_HEADER = "X-Owner-Key";

const browser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";
const same = (a: Pick<WorkItem, "id" | "kind">, b: Pick<WorkItem, "id" | "kind">) => a.id === b.id && a.kind === b.kind;

function valid(x: unknown): x is WorkItem {
  const i = x as WorkItem;
  return !!i && typeof i.id === "string" && typeof i.title === "string" && ["plan", "set", "prep", "ideas", "project", "event"].includes(i.kind);
}

// Throws when storage is unreadable (private mode, quota); callers show the error state.
export function readWork(): WorkItem[] {
  if (!browser()) return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) return [];
  // Older or hand-made entries may lack updatedAt; treat them as oldest instead of throwing.
  return list
    .filter(valid)
    .map((i) => (typeof i.updatedAt === "string" ? i : { ...i, updatedAt: "" }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function write(list: WorkItem[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new Event(EVENT));
}

// Add or update one item (keeps an existing owner key when the patch has none).
export function recordWork(item: Omit<WorkItem, "updatedAt"> & { updatedAt?: string }) {
  if (!browser()) return;
  try {
    const list = readWork();
    const old = list.find((i) => same(i, item));
    const next: WorkItem = { ...old, ...item, ownerKey: item.ownerKey ?? old?.ownerKey ?? ownerKeyFor(item.id, list), updatedAt: item.updatedAt ?? new Date().toISOString() };
    write([next, ...list.filter((i) => !same(i, item))]);
  } catch {}
}

// A plan made from another one (Adjust, retry as new): same owner key as its parent.
export function rememberRun(id: string, title: string, fromId?: string, status = "running") {
  recordWork({ id, kind: "plan", title, status, ownerKey: fromId ? ownerKeyFor(fromId) : undefined });
}

// Fresh statuses from the server (statusOf returns undefined to keep an item's current one).
export function updateStatuses(statusOf: (i: WorkItem) => string | undefined) {
  if (!browser()) return;
  try {
    const list = readWork();
    let changed = false;
    for (const i of list) {
      const s = statusOf(i);
      if (s && s !== i.status) {
        i.status = s;
        changed = true;
      }
    }
    if (changed) write(list);
  } catch {}
}

export function removeWork(item: Pick<WorkItem, "id" | "kind">) {
  if (!browser()) return;
  // Deleting a plan removes its set / show notes / ideas entries too.
  write(readWork().filter((i) => !(item.kind === "plan" && i.kind !== "project" ? i.id === item.id : same(i, item))));
}

export function ownerKeyFor(id: string, list?: WorkItem[]): string | undefined {
  try {
    return (list ?? readWork()).find((i) => i.id === id && i.ownerKey)?.ownerKey;
  } catch {
    return undefined;
  }
}

export function hrefOf(i: WorkItem) {
  if (i.href) return i.href;
  if (i.kind === "project") return `/projects/${i.id}`;
  if (i.kind === "event") return `/events/${i.id}`;
  if (i.kind === "plan") return `/plan/${i.id}`;
  return `/plan/${i.id}/${i.kind}`;
}

// Server side of an item: plans and their sub-pages are runs.
export const serverKind = (i: WorkItem): "run" | "project" | undefined =>
  i.kind === "project" ? "project" : i.kind === "event" ? undefined : /^[0-9a-f-]{36}$/i.test(i.id) && !i.href?.startsWith("/ideas") ? "run" : undefined;

export function subscribeWork(cb: () => void) {
  if (!browser()) return () => {};
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const ownerHeaders = (id: string): Record<string, string> => {
  const key = ownerKeyFor(id);
  return key ? { [OWNER_HEADER]: key } : {};
};

// Export / import: a JSON file to move your work (with its owner keys) to another browser.
export function exportWork() {
  const blob = new Blob([JSON.stringify({ tourbo: "work", version: 1, items: readWork() }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tourbo-work-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Returns how many items were added or updated; throws a plain sentence when the file isn't ours.
export function importWork(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Tourbo work file. Pick the file you exported.");
  }
  const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error("That file isn't a Tourbo work file. Pick the file you exported.");
  const incoming = items.filter(valid).map((i) => ({ ...i, updatedAt: typeof i.updatedAt === "string" ? i.updatedAt : new Date().toISOString() }));
  const list = readWork();
  for (const i of incoming) {
    const at = list.findIndex((x) => same(x, i));
    if (at < 0) list.push(i);
    else list[at] = { ...list[at], ...i, ownerKey: i.ownerKey ?? list[at].ownerKey };
  }
  write(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  return incoming.length;
}

// Edits to a plan or project page (React Router form posts go through fetch) carry that item's
// owner key, so the root middleware lets them through. Installed once, in the browser only.
const OWNED_PATH = /^\/(?:plan|projects|events)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/.]|$)/i;
let installed = false;
export function installOwnerFetch() {
  if (!browser() || installed) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const request = input instanceof Request ? input : undefined;
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        const url = new URL(request?.url ?? String(input), location.href);
        const m = url.origin === location.origin ? OWNED_PATH.exec(url.pathname) : null;
        const key = m && ownerKeyFor(m[1]);
        if (key) {
          const headers = new Headers(init?.headers ?? request?.headers);
          if (!headers.has(OWNER_HEADER)) headers.set(OWNER_HEADER, key);
          return request ? original(new Request(request, { ...init, headers })) : original(input, { ...init, headers });
        }
      }
    } catch {}
    return original(input, init);
  };
}
