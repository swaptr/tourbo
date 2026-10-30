import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";

// The "⋯" menu: per-row actions (open, edit, duplicate, add to set, archive, delete) and the
// list page's own actions. Destructive items sit last, after a separator.

export type Action = { label: string; icon?: ReactNode; to?: string; onSelect?: () => void; destructive?: boolean; disabled?: boolean; hidden?: boolean };

export function RowActions({ label, actions, size = "icon-sm" }: { label: string; actions: Action[]; size?: "icon-sm" | "icon" }) {
  const list = actions.filter((a) => !a.hidden);
  if (!list.length) return null;
  const safe = list.filter((a) => !a.destructive);
  const risky = list.filter((a) => a.destructive);
  const item = (a: Action) =>
    a.to ? (
      <Menu.LinkItem
        key={a.label}
        closeOnClick
        render={<Link to={a.to} />}
        className="flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground [&_svg]:size-4"
      >
        {a.icon}
        {a.label}
      </Menu.LinkItem>
    ) : (
      <DropdownMenuItem key={a.label} onClick={a.onSelect} disabled={a.disabled} variant={a.destructive ? "destructive" : undefined}>
        {a.icon}
        {a.label}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={size} className="shrink-0 max-sm:size-11" aria-label={label} data-testid="row-actions" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        {safe.map(item)}
        {safe.length > 0 && risky.length > 0 && <DropdownMenuSeparator />}
        {risky.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
