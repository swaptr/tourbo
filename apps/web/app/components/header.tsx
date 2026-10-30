import { Moon, Sun } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const NAV = [
  { to: "/projects", label: "Projects" },
  { to: "/explore", label: "For venues" },
  { to: "/connect", label: "Use with your AI" },
];

// Paper (light) is the default; the choice is remembered (see the inline script in root.tsx).
function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {}
}

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        <Link to="/" className="font-heading text-2xl tracking-tight">
          Tourbo
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("hidden px-2 hover:text-foreground sm:inline", isActive ? "text-foreground" : "text-muted-foreground")}>
              {n.label}
            </NavLink>
          ))}
          <Button size="icon-sm" variant="ghost" aria-label="Switch light or dark" onClick={toggleTheme}>
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          {/* The home page has its own big "Plan my tour"; one primary action per screen. */}
          {pathname !== "/" && (
            <Button size="sm" nativeButton={false} render={<Link to="/start" />}>
              Plan a tour
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
