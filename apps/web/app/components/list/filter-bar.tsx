import { ArrowDownUp, ListFilter, Search, X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { useKey } from "./keys";

// The one-line toolbar every list page shares (PLAN Q21): search · Filter ▾ (active count) ·
// Sort ▾ · page ⋯ · New. Config-driven: each page passes its filters and sort fields; the page
// keeps the values in its URL. Never wraps or scrolls sideways: on narrow screens the buttons
// drop their words and the active-filter chips give way to the count. `/` focuses search.

export type FilterOption = { value: string; label: string; count?: number };
export type FilterDef = {
  key: string;
  label: string; // group heading in the menu ("Status")
  any?: string; // the "no filter" choice ("Any status"); omit for a filter that always has a value (view)
  value?: string;
  options: FilterOption[];
  onChange: (value?: string) => void;
  counts?: boolean; // counts toward "Filter · N" and shows a chip (default: true when `any` is set)
};
export type SortDef = { value: string; dir: "asc" | "desc"; options: { value: string; label: string }[]; onChange: (value: string, dir: "asc" | "desc") => void };

export function FilterBar({ q, onQ, placeholder, filters, sort, onClear, menu, newMenu }: { q: string; onQ: (q: string) => void; placeholder: string; filters: FilterDef[]; sort: SortDef; onClear: () => void; menu?: ReactNode; newMenu?: ReactNode }) {
  const search = useRef<HTMLInputElement>(null);
  useKey("/", () => search.current?.focus());
  const shown = filters.filter((f) => f.options.length > 0);
  const active = shown.filter((f) => (f.counts ?? !!f.any) && f.value);
  const sortLabel = sort.options.find((o) => o.value === sort.value)?.label ?? "";
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5 py-2" role="search" data-testid="filter-bar">
      <div className="relative min-w-0 flex-1 basis-32">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input ref={search} type="search" aria-label="Search" aria-keyshortcuts="/" placeholder={placeholder} className="pl-8 max-sm:h-11" value={q} onChange={(e) => onQ(e.target.value)} />
      </div>
      {active.length > 0 && (
        <div className="hidden min-w-0 shrink items-center gap-1 overflow-hidden lg:flex" aria-label="Active filters">
          {active.slice(0, 3).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => f.onChange(undefined)}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-muted px-2 text-xs outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove filter ${f.label}: ${f.options.find((o) => o.value === f.value)?.label}`}
            >
              {f.options.find((o) => o.value === f.value)?.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="shrink-0 max-sm:h-11 max-sm:min-w-11" aria-label={active.length ? `Filter, ${active.length} on` : "Filter"} data-testid="filter-button" />}>
          <ListFilter />
          <span className="hidden sm:inline">Filter</span>
          {active.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs leading-4 font-semibold text-primary-foreground tabular-nums">{active.length}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
          {shown.map((f, i) => (
            <DropdownMenuGroup key={f.key}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{f.label}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={f.value ?? ""} onValueChange={(v: string) => f.onChange(v || undefined)}>
                {f.any && (
                  <DropdownMenuRadioItem value="" closeOnClick>
                    {f.any}
                  </DropdownMenuRadioItem>
                )}
                {f.options.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value} closeOnClick>
                    <span className="flex-1">{o.label}</span>
                    {o.count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          ))}
          {active.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClear}>Clear filters</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="shrink-0 max-sm:h-11 max-sm:min-w-11" aria-label={`Sort: ${sortLabel}, ${sort.dir === "asc" ? "ascending" : "descending"}`} data-testid="sort-button" />}>
          <ArrowDownUp />
          <span className="hidden sm:inline">{sortLabel}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort.value} onValueChange={(v: string) => sort.onChange(v, sort.dir)}>
              {sort.options.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} closeOnClick>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort.dir} onValueChange={(v: string) => sort.onChange(sort.value, v as "asc" | "desc")}>
              <DropdownMenuRadioItem value="asc" closeOnClick>
                Ascending
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc" closeOnClick>
                Descending
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {menu}
      {newMenu}
    </div>
  );
}
