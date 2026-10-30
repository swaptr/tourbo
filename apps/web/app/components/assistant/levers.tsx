import { ChevronDown, SlidersHorizontal, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FLAVOURS } from "@tourbo/core/context/budget.ts";
import { applyLevers, DEFAULT_LEVERS, EDGES, ERAS, isDefault, LEVER_LABEL, leversFor, parseLevers, PLANNER_DRIVE_KM, RISKS, type LeverContext, type Levers as LeverState } from "@tourbo/core/engine/levers.ts";
import type { Plan } from "@tourbo/core/shared/types.ts";
import { ErrorLine, shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import { Skeleton } from "~/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useCanEdit } from "~/components/your-work";
import { cn } from "~/lib/utils";
import { LEVERS_CHANGED, patch, post, useAssistant } from "./store";

// "Tune" (PLAN §18 Q20): instant levers, no AI. Every change recomputes the plan in the browser
// (engine/levers.ts applyLevers) and shows the difference inline, with Undo. The stored plan stays
// as it is; the lever state is saved for the owner (run_steps "levers") and the workspace renders
// the tuned view from onChange (or the "tourbo:levers" window event).
//   <Levers runId={run.id} plan={run.plan} onChange={(tuned, levers, context) => …} />
export function Levers({
  runId,
  plan,
  onChange,
  defaultOpen = false,
  bare = false,
  className,
}: {
  runId: string;
  plan: Plan;
  onChange?: (tuned: Plan, levers: LeverState, context: LeverContext) => void;
  defaultOpen?: boolean;
  bare?: boolean; // inside the header's Tune popover: no own toggle, always open
  className?: string;
}) {
  const a = useAssistant({ runId });
  const canEdit = useCanEdit(runId, !!a.state?.owned);
  const [opened, setOpen] = useState(defaultOpen);
  const open = bare || opened;
  const [levers, setLevers] = useState<LeverState>(DEFAULT_LEVERS);
  const [undo, setUndo] = useState<LeverState[]>([]);
  const [error, setError] = useState<string>();
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Saved lever state arrives with the conversation state.
  useEffect(() => {
    if (!loaded.current && a.state?.levers) {
      loaded.current = true;
      setLevers(parseLevers(a.state.levers));
    }
  }, [a.state?.levers]);

  const result = useMemo(() => applyLevers(plan, levers), [plan, levers]);
  useEffect(() => {
    onChange?.(result.plan, levers, result.context);
    window.dispatchEvent(new CustomEvent(LEVERS_CHANGED, { detail: { runId, levers, plan: result.plan, context: result.context } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const save = (next: LeverState) => {
    if (!canEdit) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      post(runId, { intent: "levers", levers: next })
        .then(() => {
          setError(undefined);
          patch(runId, (s) => ({ ...s, levers: next }));
        })
        .catch((e: unknown) => setError(shownMessage(e, "Those changes didn't save. Try again.")));
    }, 500);
  };
  const set = (p: Partial<LeverState>) => {
    const next = parseLevers({ ...levers, ...p });
    if (JSON.stringify(next) === JSON.stringify(levers)) return;
    setUndo((u) => [...u.slice(-19), levers]);
    setLevers(next);
    save(next);
  };
  const back = () => {
    const prev = undo.at(-1);
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    setLevers(prev);
    save(prev);
  };

  const shown = leversFor(plan.artist.kind);
  const currency = plan.money?.currency || "USD";
  const diff = result.diff;
  const ideasOnly = !diff.lines.length && !isDefault(levers);

  return (
    <section className={cn("grid gap-3", className)} aria-label="Tune the plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {bare ? (
          <h2 className="text-sm font-medium">Tune the plan</h2>
        ) : (
          <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={`levers-${runId}`} onClick={() => setOpen((o) => !o)}>
            <SlidersHorizontal /> Tune <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
          {!!diff.lines.length && (
            <span className="contents" data-testid="plan-diff">
              {diff.lines.map((l) => (
                <span key={l} className={cn("num rounded-full border px-2 py-0.5", /^profit \+/.test(l) && "border-score-3", /^profit −/.test(l) && "border-destructive/50 text-destructive")}>
                  {l}
                </span>
              ))}
            </span>
          )}
          {ideasOnly && <span className="text-muted-foreground">Ideas and sets use your settings.</span>}
          {!!undo.length && (
            <Button type="button" size="xs" variant="outline" onClick={back}>
              <Undo2 /> Undo
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div id={`levers-${runId}`} className="grid gap-3">
          {a.loading && !a.state ? (
            <div className="grid gap-2" role="status" aria-label="Loading your settings">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-2/3" />
            </div>
          ) : (
            <>
              <Row name="flavour" label="Local flavour" hint="How many local touches go into sets and ideas. Your own material always leads.">
                <Choice value={levers.flavour} options={FLAVOURS} labels={LEVER_LABEL.flavour} onChange={(flavour) => set({ flavour })} label="Local flavour" />
              </Row>
              <Row name="risk" label="Risk" hint="Safe: rooms you'll fill. Bold: bigger rooms, more upside, lower sell-out odds.">
                <Choice value={levers.risk} options={RISKS} labels={LEVER_LABEL.risk} onChange={(risk) => set({ risk })} label="Risk" />
              </Row>
              {shown.includes("edge") && (
                <Row name="edge" label="Edginess" hint="How far the material may go. The never-punch-down rules always apply.">
                  <Choice value={levers.edge} options={EDGES} labels={LEVER_LABEL.edge} onChange={(edge) => set({ edge })} label="Edginess" />
                </Row>
              )}
              {shown.includes("era") && (
                <Row name="era" label={plan.artist.kind === "musician" || plan.artist.kind === "dj" ? "Covers" : "References"} hint="Recent picks for younger rooms, classics for older ones.">
                  <Choice value={levers.era} options={ERAS} labels={LEVER_LABEL.era} onChange={(era) => set({ era })} label="Covers and references" />
                </Row>
              )}
              <Row name="feeFloor" label="Profit floor" hint={`Leave out nights below this estimated profit (${currency}).`}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={50}
                  aria-label={`Profit floor per night in ${currency}`}
                  placeholder="none"
                  className="w-28"
                  value={levers.feeFloor ?? ""}
                  onChange={(e) => set({ feeFloor: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </Row>
              <Row name="maxDriveKm" label="Max drive a day" hint={`The plan assumes ${PLANNER_DRIVE_KM} km. Shorter days push later dates back and add hotel nights.`}>
                <div className="flex w-full max-w-56 items-center gap-3">
                  <Slider
                    min={200}
                    max={1000}
                    step={50}
                    value={levers.maxDriveKm ?? PLANNER_DRIVE_KM}
                    onValueChange={(v) => {
                      const km = Array.isArray(v) ? v[0] : v;
                      set({ maxDriveKm: km === PLANNER_DRIVE_KM ? undefined : km });
                    }}
                    aria-label="Max drive per day in km"
                  />
                  <span className="num w-16 shrink-0 text-right text-xs">{(levers.maxDriveKm ?? PLANNER_DRIVE_KM).toLocaleString("en-US")} km</span>
                </div>
              </Row>
              {!isDefault(levers) && (
                <Button type="button" size="xs" variant="ghost" className="justify-self-start" onClick={() => set(DEFAULT_LEVERS)}>
                  Reset to Tourbo's plan
                </Button>
              )}
              {!canEdit && <p className="text-xs text-muted-foreground">Shared plan: try the levers here; they aren't saved.</p>}
              <ErrorLine message={error} retry onRetry={() => save(levers)} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ name, label, hint, children }: { name: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div data-testid={`lever-${name}`} className="grid gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-center">
      <span className="text-sm" title={hint}>
        {label}
        <span className="block text-xs text-muted-foreground sm:hidden">{hint}</span>
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Choice<T extends string>({ value, options, labels, onChange, label }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(v: unknown[]) => {
        const next = v[0] as T | undefined;
        if (next) onChange(next);
      }}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o} value={o} aria-label={labels[o]}>
          {labels[o]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
