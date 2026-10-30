import { BOUNDARIES, BOUNDARY_LABEL, FLAVOURS, FLAVOUR_LABEL, GUIDANCE_NOTE, localBudget, slotFor, slotsFor, type Boundary, type Flavour } from "@tourbo/core/context/index.ts";

import { Hint } from "~/components/hint";
import { IdeasBoard, type IdeasData } from "~/components/ideas-board";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { cn } from "~/lib/utils";

// Performance context controls (PLAN §18 Q15), shared by the set and ideas pages: the slot, how
// much local flavour, and (crowd-work kinds) what the act is OK with. Each control can carry a
// form `name` so plain forms submit it. All sit at the default control height (h-8).

// "clean" is exclusive; the last other boundary off falls back to clean.
export function toggleBoundary(cur: Boundary[], b: Boundary): Boundary[] {
  if (b === "clean") return ["clean"];
  const rest = cur.filter((x) => x !== b && x !== "clean");
  return cur.includes(b) ? (rest.length ? rest : ["clean"]) : [...rest, b];
}

// Sentence case for the picker ("Headline set", "Support", "Guest spot"); the engine keeps its labels.
const slotName = (s: { key: string; label: string }) => (s.key === "headline" ? "Headline set" : s.label.charAt(0).toUpperCase() + s.label.slice(1));
export const slotLabelOf = (kind: string, slot: string) => slotName(slotFor(kind, slot));

export function SlotSelect({ kind, value, onChange, name, disabled }: { kind: string; value: string; onChange: (v: string) => void; name?: string; disabled?: boolean }) {
  return (
    <NativeSelect name={name} aria-label="Your slot" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {slotsFor(kind).map((s) => (
        <NativeSelectOption key={s.key} value={s.key}>
          {slotName(s)} · {s.size} {s.unit === "minutes" ? "min" : s.unit}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function FlavourToggle({ value, onChange, name, disabled }: { value: Flavour; onChange: (v: Flavour) => void; name?: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Local flavour" className="inline-flex items-center gap-1.5">
      {name && <input type="hidden" name={name} value={value} />}
      <span className="text-muted-foreground">Local flavour</span>
      <span className="inline-flex h-8 items-center rounded-lg border p-0.5">
        {FLAVOURS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={value === f}
            disabled={disabled}
            onClick={() => onChange(f)}
            className={cn("h-full rounded-md px-2.5", value === f ? "bg-foreground font-medium text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {FLAVOUR_LABEL[f]}
          </button>
        ))}
      </span>
    </div>
  );
}

export function SlotHint({ kind, slot, flavour }: { kind: string; slot: string; flavour: Flavour }) {
  const s = slotFor(kind, slot);
  return (
    <Hint text="why?">
      <p>{s.note}</p>
      <p className="mt-1">
        Local touches allowed: {localBudget(s, flavour).max} ({FLAVOUR_LABEL[flavour].toLowerCase()}). A touch is about one per 25 min and at most 15% of the slot; some and lots allow more.
      </p>
    </Hint>
  );
}

export function BoundaryChips({ value, onChange, name, disabled }: { value: Boundary[]; onChange: (v: Boundary[]) => void; name?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="What you're OK with">
      {name && <input type="hidden" name={name} value={value.join(",")} />}
      {BOUNDARIES.map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={value.includes(b)}
          disabled={disabled}
          onClick={() => onChange(toggleBoundary(value, b))}
          className={cn("inline-flex h-8 items-center rounded-full border px-3", value.includes(b) ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}
        >
          {BOUNDARY_LABEL[b]}
        </button>
      ))}
      <Hint label="About these">
        <p>Pick what you're OK with. Tourbo keeps its suggestions inside it, never jokes at a group's expense, and flags local rules.</p>
        <p className="mt-1 text-muted-foreground">{GUIDANCE_NOTE}</p>
      </Hint>
    </div>
  );
}

export type ContextValue = { slot: string; flavour: Flavour; boundaries: Boundary[] };

// One compact row: slot, local flavour, why?, then boundary chips for crowd-work kinds.
// flavour={false}: the tour page sets local flavour in its header Tune (one control for it).
export function ContextControls({ kind, crowd, value, onChange, disabled, flavour = true }: { kind: string; crowd: boolean; value: ContextValue; onChange: (v: ContextValue) => void; disabled?: boolean; flavour?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="context-controls">
      <SlotSelect kind={kind} value={value.slot} onChange={(slot) => onChange({ ...value, slot })} disabled={disabled} />
      {flavour ? (
        <FlavourToggle value={value.flavour} onChange={(flavour) => onChange({ ...value, flavour })} disabled={disabled} />
      ) : (
        <span className="text-muted-foreground">
          Local flavour: <span className="text-foreground">{FLAVOUR_LABEL[value.flavour].toLowerCase()}</span>, set in Tune at the top
        </span>
      )}
      <SlotHint kind={kind} slot={value.slot} flavour={value.flavour} />
      {crowd && <BoundaryChips value={value.boundaries} onChange={(boundaries) => onChange({ ...value, boundaries })} disabled={disabled} />}
    </div>
  );
}

// URL / form fields for a context (ideas pages): ?slot=&flavour=&b=clean,edgy
export const contextParams = (v: ContextValue): Record<string, string> => ({ slot: v.slot, flavour: v.flavour, b: v.boundaries.join(",") });

// The originality budget line above the ideas: "Keep your set; add up to 2 local touches."
export function BudgetLine({ data }: { data: IdeasData }) {
  const c = data.context;
  if (!c) return null;
  const avoided = data.cities.reduce((n, x) => n + (x.avoided ?? 0), 0);
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="budget-line">
      <span>
        {slotName({ key: c.slot, label: c.slotLabel })}: {c.note}
      </span>
      {(avoided > 0 || c.audienceWhy?.length) && (
        <Hint text="why?">
          {avoided > 0 && <p>{avoided === 1 ? "One topic was" : `${avoided} topics were`} left out because they touch what you'd rather avoid here.</p>}
          {c.audienceWhy?.map((w) => (
            <p key={w} className="mt-1">
              {w}
            </p>
          ))}
        </Hint>
      )}
    </p>
  );
}

// Ideas past the budget stay one tap away ("Show 6 more ideas", inside the board).
export const IdeasBoardWithSpares = IdeasBoard;
