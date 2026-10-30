import { Menu } from "@base-ui/react/menu";
import { Moon, Sun } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { LABELS } from "~/lib/labels";

// The act chip's menu, loaded on first use (header.tsx): the menu library stays off every page's
// first load. Mounted already open by the press that loaded it; Base UI moves focus into it.

export type Unfinished = { href: string; title: string; status: string };

const ITEM =
  "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground";

export default function HeaderMenu({ chip, label, shown, nav, onOpen, toggleTheme, children }: { chip: string; label?: string; shown: Unfinished[]; nav: { to: string; label: string }[]; onOpen: () => void; toggleTheme: () => void; children: ReactNode }) {
  // Opened by the press that loaded it: fetch the full "Continue" list now (later opens refetch).
  useEffect(onOpen, []);
  return (
          <DropdownMenu defaultOpen onOpenChange={(open) => open && onOpen()}>
            <DropdownMenuTrigger render={<button type="button" aria-label={label} className={chip} data-testid="act-chip" />}>
              {children}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-auto max-w-[min(20rem,calc(100vw-1rem))] min-w-56"
            >
              {shown.length > 0 && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Continue</DropdownMenuLabel>
                    {shown.map((u) => (
                      <Menu.LinkItem
                        key={u.href}
                        closeOnClick
                        render={<Link to={u.href} />}
                        className={`${ITEM} justify-between gap-3`}
                        data-testid="continue-item"
                      >
                        <span className="truncate">{u.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {u.status}
                        </span>
                      </Menu.LinkItem>
                    ))}
                    <Menu.LinkItem
                      closeOnClick
                      render={<Link to="/work" />}
                      className={`${ITEM} text-muted-foreground`}
                    >
                      All your tours →
                    </Menu.LinkItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              {[{ to: "/start?edit=1", label: LABELS.profile }, ...nav].map(
                (n) => (
                  <Menu.LinkItem
                    key={n.to}
                    closeOnClick
                    render={<Link to={n.to} />}
                    className={ITEM}
                  >
                    {n.label}
                  </Menu.LinkItem>
                ),
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme}>
                <Sun className="hidden dark:block" />
                <Moon className="dark:hidden" />
                <span className="dark:hidden">Dark theme</span>
                <span className="hidden dark:inline">Light theme</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
  );
}
