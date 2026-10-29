import { Link, NavLink } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const NAV = [
  { to: "/explore", label: "For venues" },
  { to: "/connect", label: "Use with Claude" },
];

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        <Link to="/" className="font-heading text-lg font-semibold tracking-tight">
          Tourbo
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("hidden px-2 hover:text-foreground sm:inline", isActive ? "text-foreground" : "text-muted-foreground")}>
              {n.label}
            </NavLink>
          ))}
          <Button size="sm" nativeButton={false} render={<Link to="/start" />}>
            Plan a tour
          </Button>
        </nav>
      </div>
    </header>
  );
}
