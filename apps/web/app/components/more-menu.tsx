import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";

export type MoreItem = { label: ReactNode; to?: string; onSelect?: () => void; disabled?: boolean };

// Secondary actions live here so each screen keeps exactly one primary button (data-primary).
// `size` matches the buttons beside it (same scale as Button).
export function MoreMenu({ items, label = "More", className, size = "sm" }: { items: (MoreItem | false | undefined)[]; label?: string; className?: string; size?: "xs" | "sm" | "default" | "lg" | "xl" }) {
  const list = items.filter(Boolean) as MoreItem[];
  if (!list.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size={size} className={className} />}>
        {label} <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {list.map((item, i) =>
          item.to ? (
            <Menu.LinkItem
              key={i}
              closeOnClick
              render={<Link to={item.to} />}
              className="flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground"
            >
              {item.label}
            </Menu.LinkItem>
          ) : (
            <DropdownMenuItem key={i} onClick={item.onSelect} disabled={item.disabled}>
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
