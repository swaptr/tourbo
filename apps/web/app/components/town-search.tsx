import { LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";

export type Town = { name: string; lat: number; lon: number; country?: string };

// Any town by name (home base, "start near"): a combobox over the local town list (/api/towns).
// Arrow keys + Enter pick; Escape closes. Works offline from fan data.
export function TownSearch({ id, value, onChange, placeholder = "Type a town or city", invalid, autoFocus }: { id: string; value?: Town; onChange: (t?: Town) => void; placeholder?: string; invalid?: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [towns, setTowns] = useState<Town[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = useId();
  const seq = useRef(0);
  useEffect(() => setQ(value?.name ?? ""), [value?.name]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || term === value?.name) return setTowns([]);
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/towns?q=${encodeURIComponent(term)}`);
        const body = (await res.json()) as { towns: Town[] };
        if (n !== seq.current) return;
        setTowns(body.towns ?? []);
        setFailed(false);
        setActive(0);
      } catch {
        if (n === seq.current) setFailed(true);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (t: Town) => {
    onChange(t);
    setQ(t.name);
    setOpen(false);
  };
  const show = open && q.trim().length >= 2 && q.trim() !== value?.name;
  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        id={id}
        role="combobox"
        aria-expanded={show}
        aria-controls={list}
        aria-autocomplete="list"
        aria-activedescendant={show && towns[active] ? `${list}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        autoFocus={autoFocus}
        className="pl-8"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (value && e.target.value !== value.name) onChange(undefined);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, towns.length - 1)));
          else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          else if (e.key === "Enter" && towns[active]) (e.preventDefault(), pick(towns[active]));
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {loading && show && <LoaderCircle className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
      {show && (
        <ul id={list} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg bg-popover p-1 text-sm shadow-md ring-1 ring-foreground/10">
          {towns.map((t, i) => (
            <li
              key={`${t.name}${t.lat}`}
              id={`${list}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn("flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5", i === active && "bg-accent text-accent-foreground")}
              onMouseDown={(e) => (e.preventDefault(), pick(t))}
              onMouseEnter={() => setActive(i)}
            >
              <span>{t.name}</span>
              {t.country && <span className="text-xs text-muted-foreground">{t.country}</span>}
            </li>
          ))}
          {!loading && !towns.length && <li className="px-2 py-1.5 text-muted-foreground">{failed ? "Towns didn't load. Check your connection and try again." : "No town by that name. Try the nearest bigger one."}</li>}
        </ul>
      )}
    </div>
  );
}
