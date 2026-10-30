import { CircleSlash, RotateCw } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { useLocation, useRouteLoaderData } from "react-router";

import { limitKindOf } from "@tourbo/core/shared/errors.ts";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { neutral } from "~/lib/neutral";

// Loading: grey lines shaped like the content, plus one short status line for screen readers.
export function LoadingLines({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? "h-3.5 w-2/3" : "h-3.5 w-full"} />
      ))}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// A sentence meant for the user (from a server `error` field); anything else thrown on the client
// (network, parse) reads as the caller's fallback, never as raw text.
export class ShownError extends Error {}
export const shownMessage = (e: unknown, fallback: string) => (e instanceof ShownError && e.message ? e.message : fallback);

// ---------- Provider limits: sticky, one notice per page ----------
// Once a data or AI limit is seen (server-side at load, or in any widget's answer), the page shows
// one small notice and widgets stay quiet about it. Kept for the rest of the visit.

type Limits = { data: boolean; ai: boolean };
let limits: Limits = { data: false, ai: false };
const listeners = new Set<() => void>();
const NONE: Limits = { data: false, ai: false };

export function reportLimit(kind: "data_limit" | "ai_limit") {
  const key = kind === "data_limit" ? "data" : "ai";
  if (limits[key]) return;
  limits = { ...limits, [key]: true };
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function useLimits(): Limits {
  const live = useSyncExternalStore(subscribe, () => limits, () => NONE);
  // Pages that never need fan data (`/` runs on the static landing bundle; help and setup docs)
  // show a limit only when one is actually hit there.
  const home = ["/", "/connect", "/help"].includes(useLocation().pathname);
  const root = (useRouteLoaderData("root") as { limits?: Limits } | undefined)?.limits;
  const seeded = home ? undefined : root;
  return { data: live.data || !!seeded?.data, ai: live.ai || !!seeded?.ai };
}

// Also for messages shown outside ErrorLine (notes, streamed events): true when the page notice covers it.
export function useLimitMessage(message: string | undefined): boolean {
  const kind = limitKindOf(message);
  useEffect(() => {
    if (kind) reportLimit(kind);
  }, [kind]);
  return !!kind;
}

export function LimitNotice() {
  const { data, ai } = useLimits();
  if (!data && !ai) return null;
  return (
    <div className="container mx-auto px-4 pt-3" data-testid="limit-notice">
      <p className="flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground" role="status">
        <CircleSlash className="size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">{[data && "Fan data is paused for now.", ai && "Your AI assistant is paused for now."].filter(Boolean).join(" ")}</span> Saved work still opens.
        </span>
      </p>
    </div>
  );
}

// Failed: one plain sentence and, only when `retry` says it can help, a retry. Limit sentences
// go to the page notice instead (no per-widget duplicate, no retry).
export function ErrorLine({ message, retry, onRetry, busy, boxed }: { message?: string; retry?: boolean; onRetry?: () => void; busy?: boolean; boxed?: boolean }) {
  const limited = useLimitMessage(message);
  if (!message || limited) return null;
  return (
    <span className={boxed ? "flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm" : "flex flex-wrap items-center gap-2 text-sm"} role="alert">
      <span className={boxed ? undefined : "text-destructive"}>{neutral(message)}</span>
      {onRetry && retry && (
        <Button type="button" size="xs" variant="outline" onClick={onRetry} disabled={busy}>
          <RotateCw /> Try again
        </Button>
      )}
    </span>
  );
}
