import { RotateCw, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AssistResult, AssistTask } from "@tourbo/core/assist/assist.ts";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { EvidenceChips, SOURCE_LABEL } from "./evidence";
import { useAssist, type AssistScope, type AssistState } from "./use-assist";

// One AI assist as a button: sparkle + label. Click → the draft opens in a popover (skeleton while
// it's written) with its evidence and Keep / Edit / Discard. Nothing is applied until Keep.
//   <AssistButton task="title" input={{ runId }} label="Suggest a title"
//     render={(d) => <p className="font-medium">{d.title}</p>} onKeep={(d) => setTitle(d.title)} />

export type AssistButtonProps<T> = {
  task: AssistTask;
  input: unknown | (() => unknown); // a function is read on click (latest form values)
  label: string;
  heading?: string; // popover title; defaults to the label
  scope?: AssistScope; // { runId } or { profileId }; default: the browser's act profile
  render: (draft: T, result: AssistResult<T>) => ReactNode;
  onKeep: (draft: T) => void | Promise<void>;
  onEdit?: (draft: T) => void; // "Edit": hand the draft to the page's own form
  keepLabel?: string;
  isEmpty?: (draft: T) => boolean; // a draft with nothing in it shows `empty` instead of Keep
  empty?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
  primary?: boolean; // the screen's one primary action (filled, data-primary)
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
};

export function AssistButton<T>({ task, input, label, heading, scope, render, onKeep, onEdit, keepLabel = "Keep", isEmpty, empty, size = "sm", variant = "outline", primary, disabled, className, align = "start" }: AssistButtonProps<T>) {
  const assist = useAssist<T>(task, scope);
  const [open, setOpen] = useState(false);
  const read = () => (typeof input === "function" ? (input as () => unknown)() : input);
  const start = () => {
    setOpen(true);
    void assist.run(read());
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) start();
        else setOpen(false);
      }}
    >
      <PopoverTrigger
        render={
          <Button size={size} variant={primary ? "default" : variant} data-primary={primary || undefined} disabled={disabled} aria-busy={assist.loading || undefined} className={cn("group/assist", className)} data-assist={task}>
            <Sparkles data-icon="inline-start" className={cn(primary ? "text-primary-foreground" : "text-primary", "transition-transform duration-300 ease-out group-hover/assist:rotate-12", assist.loading && "animate-pulse")} />
            {label}
          </Button>
        }
      />
      <PopoverContent align={align} className="w-[min(24rem,calc(100vw-16px))] gap-0 p-0">
        <AssistPanel
          heading={heading ?? label}
          state={assist}
          render={render}
          onRetry={() => void assist.run(read())}
          onDiscard={() => {
            setOpen(false);
            assist.reset();
          }}
          onKeep={async (d) => {
            await onKeep(d);
            setOpen(false);
            assist.reset();
          }}
          onEdit={
            onEdit &&
            ((d) => {
              onEdit(d);
              setOpen(false);
              assist.reset();
            })
          }
          keepLabel={keepLabel}
          isEmpty={isEmpty}
          empty={empty}
        />
      </PopoverContent>
    </Popover>
  );
}

// The draft body + actions, usable inline too (e.g. under a paste box) with useAssist().
export function AssistPanel<T>({
  heading,
  state,
  render,
  onRetry,
  onDiscard,
  onKeep,
  onEdit,
  keepLabel = "Keep",
  isEmpty,
  empty = "Nothing to suggest here yet.",
  className,
}: {
  heading: string;
  state: AssistState<T>;
  render: (draft: T, result: AssistResult<T>) => ReactNode;
  onRetry?: () => void;
  onDiscard: () => void;
  onKeep: (draft: T) => void | Promise<void>;
  onEdit?: (draft: T) => void;
  keepLabel?: string;
  isEmpty?: (draft: T) => boolean;
  empty?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const result = state.result;
  const loading = state.status === "loading" || state.status === "idle";
  const nothing = !!result && !!isEmpty?.(result.draft);
  const keep = async () => {
    if (!result) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onKeep(result.draft);
    } catch (error) {
      setSaveError((error as Error).message || "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className={cn("grid", className)} aria-busy={loading || undefined} aria-live="polite">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</h3>
        {result && !loading && <span className="shrink-0 text-xs text-muted-foreground">{SOURCE_LABEL[result.source]}</span>}
      </header>
      <div className="grid max-h-[min(22rem,60vh)] gap-3 overflow-y-auto px-3 py-3">
        {loading ? (
          <DraftSkeleton />
        ) : state.status === "error" ? (
          <div className="grid justify-items-start gap-2">
            <p className="text-sm">{state.error}</p>
            {state.retry && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCw data-icon="inline-start" />
                Try again
              </Button>
            )}
          </div>
        ) : result && nothing ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : result ? (
          <>
            <div className="min-w-0 animate-in fade-in-0 duration-300">{render(result.draft, result)}</div>
            <EvidenceChips evidence={result.evidence} />
            {result.notice && <p className="text-xs text-muted-foreground">{result.notice}</p>}
          </>
        ) : null}
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t px-3 py-2">
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
        {onEdit && (
          <Button size="sm" variant="outline" disabled={!result || loading || nothing || saving} onClick={() => result && onEdit(result.draft)}>
            Edit
          </Button>
        )}
        <Button size="sm" disabled={!result || loading || nothing || saving} onClick={keep}>
          {saving ? "Keeping…" : keepLabel}
        </Button>
      </footer>
    </section>
  );
}

function DraftSkeleton() {
  return (
    <div className="grid gap-2" aria-label="Writing a draft">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="mt-1 flex gap-1.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}
