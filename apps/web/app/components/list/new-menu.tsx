import { ChevronDown, Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTitle } from "~/components/ui/popover";
import { useKey } from "./keys";

// "New ▾": the list page's one primary action. Items either go somewhere (`to`, e.g. the tour
// planner) or open a small form in a popover anchored to the button (`form`, given a `close`).
// A single item skips the menu. `n` opens it.

export type NewItem = { label: string; to?: string; form?: (close: () => void) => ReactNode; title?: string };

export function NewMenu({ items, label = "New" }: { items: NewItem[]; label?: string }) {
  const navigate = useNavigate();
  const anchor = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<NewItem>();
  const pick = (i: NewItem) => (i.form ? setForm(i) : i.to && navigate(i.to));
  const single = items.length === 1 ? items[0] : undefined;
  useKey("n", () => (single ? pick(single) : setMenu(true)));
  const trigger = (
    <>
      <Plus />
      <span className="hidden sm:inline">{single && !single.form ? single.label : label}</span>
      {!single && <ChevronDown className="hidden sm:block" />}
    </>
  );
  return (
    <>
      {single ? (
        <Button ref={anchor} data-primary className="shrink-0 max-sm:h-11 max-sm:min-w-11" aria-label={single.label} aria-keyshortcuts="n" data-testid="new-menu" onClick={() => pick(single)}>
          {trigger}
        </Button>
      ) : (
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <DropdownMenuTrigger render={<Button ref={anchor} data-primary className="shrink-0 max-sm:h-11 max-sm:min-w-11" aria-label={label} aria-keyshortcuts="n" data-testid="new-menu" />}>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            {items.map((i) => (
              <DropdownMenuItem key={i.label} onClick={() => pick(i)}>
                {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Popover open={!!form} onOpenChange={(o) => !o && setForm(undefined)}>
        <PopoverContent anchor={anchor} align="end" className="w-[min(24rem,calc(100vw-2rem))] p-3" data-testid="new-form">
          {form && (
            <>
              <PopoverTitle className="font-heading text-lg">{form.title ?? form.label}</PopoverTitle>
              {form.form?.(() => setForm(undefined))}
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
