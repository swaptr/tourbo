import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { MATERIAL_TYPES, MaterialFields, ORIGINS, readLength, readTags, type Material, type MaterialType } from "@tourbo/core/material/material.ts";
import { workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { DetailInputs, readDetails } from "~/components/kind-tabs/detail-fields";
import { shownMessage } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import { LABELS, libraryTypes, typeLabel } from "~/lib/labels";

// Add / edit one piece of material: title, type, length, origin, tags, notes. Checked here with
// plain inline messages, then on the server (its message lands on the same field).

type Errors = Partial<Record<"title" | "lengthMin" | "tags" | "notes" | "details" | "form", string>>;

export function MaterialForm({
  initial,
  defaultType,
  kind,
  submitLabel,
  onSave,
  onCancel,
  extra,
}: {
  initial?: Material;
  defaultType: MaterialType;
  kind?: string; // offers only this kind's Library types, named its way ("Track", "Dish")
  submitLabel: string;
  onSave: (fields: MaterialFields) => Promise<void>;
  onCancel?: () => void;
  extra?: ReactNode;
}) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const f = (n: string) => `${id}-${n}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const length = readLength(String(data.get("length") ?? ""));
    const next: Errors = {};
    if (length === "bad") next.lengthMin = "Length is in minutes, like 4 or 3:30.";
    const fields = kind ? workspaceFor(kind).fields : [];
    const details = readDetails(data, fields, initial?.details);
    if (details.error) next.details = details.error;
    const parsed = MaterialFields.safeParse({
      title: String(data.get("title") ?? ""),
      type: String(data.get("type") ?? defaultType),
      kind: initial?.kind,
      lengthMin: length === "bad" ? undefined : length,
      notes: String(data.get("notes") ?? "").trim() || undefined,
      tags: readTags(String(data.get("tags") ?? "")),
      origin: String(data.get("origin") ?? "original"),
      source: initial?.source,
      details: details.details,
    });
    if (!parsed.success) for (const i of parsed.error.issues) next[(i.path[0] as keyof Errors) ?? "form"] ??= i.message;
    setErrors(next);
    if (Object.keys(next).length || !parsed.success) {
      const first = Object.keys(next)[0];
      form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave(parsed.data);
      if (!initial) {
        form.current?.reset();
        form.current?.querySelector<HTMLElement>('[data-field="title"]')?.focus();
      }
    } catch (err) {
      const field = (err as { field?: string }).field;
      const message = shownMessage(err, "That didn't save. Try again in a moment.");
      setErrors(field && ["title", "lengthMin", "tags", "notes"].includes(field) ? { [field]: message } : { form: message });
    } finally {
      setBusy(false);
    }
  }

  const msg = (k: keyof Errors) =>
    errors[k] ? (
      <p id={f(`${k}-error`)} className="text-xs text-destructive">
        {errors[k]}
      </p>
    ) : null;
  const invalid = (k: keyof Errors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": f(`${k}-error`) } : {});

  return (
    <form
      ref={form}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        }
      }}
      className="@container grid gap-3"
      data-testid="material-form"
    >
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 grid gap-1.5 @lg:col-span-1">
          <Label htmlFor={f("title")}>Title</Label>
          <Input id={f("title")} name="title" data-field="title" defaultValue={initial?.title} placeholder="e.g. Harbour Lights" autoComplete="off" maxLength={120} autoFocus={!!initial} {...invalid("title")} />
          {msg("title")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={f("type")}>Type</Label>
          <NativeSelect id={f("type")} name="type" defaultValue={initial?.type ?? defaultType} className="w-full">
            {(kind ? [...new Set([...libraryTypes(kind), ...(initial?.type ? [initial.type] : [])])] : MATERIAL_TYPES).map((t) => (
              <NativeSelectOption key={t} value={t}>
                {typeLabel(kind, t)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={f("length")}>Length (min)</Label>
          <Input id={f("length")} name="length" data-field="lengthMin" inputMode="decimal" defaultValue={initial?.lengthMin !== undefined ? String(Math.round(initial.lengthMin * 10) / 10) : ""} placeholder="e.g. 4" autoComplete="off" {...invalid("lengthMin")} />
          {msg("lengthMin")}
        </div>
      </div>
      {kind && <DetailInputs fields={workspaceFor(kind).fields} initial={initial?.details} id={id} error={errors.details} />}
      <div className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor={f("origin")}>Whose is it?</Label>
          <NativeSelect id={f("origin")} name="origin" defaultValue={initial?.origin ?? "original"} className="w-full">
            {ORIGINS.map((o) => (
              <NativeSelectOption key={o} value={o}>
                {LABELS.origin[o]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={f("tags")}>Tags (optional, comma-separated)</Label>
          <Input id={f("tags")} name="tags" data-field="tags" defaultValue={initial?.tags.join(", ")} placeholder="e.g. opener, acoustic" autoComplete="off" {...invalid("tags")} />
          {msg("tags")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={f("notes")}>Notes (optional)</Label>
        <Textarea id={f("notes")} name="notes" data-field="notes" defaultValue={initial?.notes} rows={2} className="min-h-14" placeholder="Key, tuning, the story you tell before it…" maxLength={2000} {...invalid("notes")} />
        {msg("notes")}
      </div>
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy} data-primary>
          {busy && <LoaderCircle className="animate-spin" />} {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        {extra}
      </div>
    </form>
  );
}
