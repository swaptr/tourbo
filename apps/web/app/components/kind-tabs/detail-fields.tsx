import { COURSE_LABEL, COURSES, MARKER_LABEL, MARKERS, MaterialDetails, PART_LABEL, PARTS, type DetailField } from "@tourbo/core/material/material.ts";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";

// The Library form's per-kind details (workspaceFor(kind).fields): key, tempo and energy for songs,
// a marker for bits, size and price for pieces, course for dishes, part for class segments. All
// optional; the Set uses them (energy curve, wall plan, courses, timed segments).

const LABEL: Record<DetailField, string> = { key: "Key", bpm: "Tempo (bpm)", energy: "Energy", marker: "Place in the set", size: "Size", price: "Price", course: "Course", part: "Part of the class" };
const PLACEHOLDER: Partial<Record<DetailField, string>> = { key: "e.g. Am", bpm: "e.g. 120", size: "e.g. 60 × 80 cm", price: "e.g. 450" };
const ENERGY = ["1 · hushed", "2 · easy", "3 · steady", "4 · lifting", "5 · peak"];
const OPTIONS: Partial<Record<DetailField, [string, string][]>> = {
  energy: ENERGY.map((l, i) => [String(i + 1), l]),
  marker: MARKERS.map((m) => [m, MARKER_LABEL[m]]),
  course: COURSES.map((c) => [c, COURSE_LABEL[c]]),
  part: PARTS.map((p) => [p, PART_LABEL[p]]),
};

export function DetailInputs({ fields, initial, id, error }: { fields: DetailField[]; initial?: MaterialDetails; id: string; error?: string }) {
  if (!fields.length) return null;
  return (
    <fieldset className="grid gap-1.5" data-testid="detail-fields">
      <legend className="text-xs text-muted-foreground">Details for your set, all optional</legend>
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        {fields.map((k) => {
          const fid = `${id}-d-${k}`;
          const value = initial?.[k] !== undefined ? String(initial[k]) : "";
          const opts = OPTIONS[k];
          return (
            <div key={k} className="grid gap-1.5">
              <Label htmlFor={fid}>
                {LABEL[k]}
              </Label>
              {opts ? (
                <NativeSelect id={fid} name={`d-${k}`} defaultValue={value} className="w-full">
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {opts.map(([v, l]) => (
                    <NativeSelectOption key={v} value={v}>
                      {l}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <Input id={fid} name={`d-${k}`} data-field="details" defaultValue={value} placeholder={PLACEHOLDER[k]} inputMode={k === "bpm" || k === "price" ? "decimal" : undefined} autoComplete="off" />
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}

// Form data → details (only the kind's fields; blanks dropped). Error = one plain sentence.
export function readDetails(data: FormData, fields: DetailField[], keep?: MaterialDetails): { details?: MaterialDetails; error?: string } {
  const raw: Record<string, unknown> = { ...keep };
  for (const k of fields) {
    const v = String(data.get(`d-${k}`) ?? "").trim();
    delete raw[k];
    if (!v) continue;
    if (k === "bpm" || k === "energy" || k === "price") {
      const n = Number(v.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(n) || !/\d/.test(v)) return { error: `${LABEL[k]} is a number.` };
      raw[k] = k === "price" ? n : Math.round(n);
    } else raw[k] = v;
  }
  if (!Object.keys(raw).length) return {};
  const p = MaterialDetails.safeParse(raw);
  return p.success ? { details: p.data } : { error: p.error.issues[0]?.message ?? "Check the details." };
}
