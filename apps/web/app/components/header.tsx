import { ChevronDown, UserRound } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { LABELS } from "~/lib/labels";
import { missingFor } from "@tourbo/core/profiles/rules.ts";
import { loadProfile, profileHeaders, subscribeProfile } from "~/lib/profile";
import { readWork, subscribeWork } from "~/lib/work";
import { isArchived, today, type WorkRow } from "~/lib/workspace";
import type { Unfinished } from "./header-menu";

const NAV = [
  { to: "/work", label: LABELS.work },
  { to: "/help", label: "Help" },
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

// One ink app bar everywhere (PLAN Q21 shell): wordmark · act chip (Your act, Help, For venues,
// Use with your AI, theme), the same on every page, home included. No primary in the bar.
export function Header() {
  return <AppBar />;
}

const CHIP =
  "relative inline-flex h-8 max-w-[60vw] items-center gap-1.5 rounded-full px-3 text-sm max-sm:h-11 ring-1 ring-background/25 outline-none hover:bg-background/10 focus-visible:ring-2 focus-visible:ring-ring dark:ring-border dark:hover:bg-muted";

// The menu (and its library) loads on first press, hover or focus of the chip; until then the chip
// is a plain button that looks the same.
const loadMenu = () => import("./header-menu");
const HeaderMenu = lazy(loadMenu);

function ActMenu({ chip, label, shown, onOpen, children }: { chip: string; label?: string; shown: Unfinished[]; onOpen: () => void; children: ReactNode }) {
  const [on, setOn] = useState(false);
  const plain = (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={false}
      className={chip}
      data-testid="act-chip"
      onPointerEnter={() => void loadMenu()}
      onFocus={() => void loadMenu()}
      onClick={() => setOn(true)}
      onKeyDown={(e) => e.key === "ArrowDown" && (e.preventDefault(), setOn(true))}
    >
      {children}
    </button>
  );
  if (!on) return plain;
  return (
    <Suspense fallback={plain}>
      <HeaderMenu chip={chip} label={label} shown={shown} nav={NAV} onOpen={onOpen} toggleTheme={toggleTheme}>
        {children}
      </HeaderMenu>
    </Suspense>
  );
}

// "Continue": only unfinished work, most recent first. The dot uses what this browser already
// knows (setup not finished, plans still planning or stopped); opening the menu asks the
// workspace for the rest (shows missing a date or a venue).
function quickUnfinished(): Unfinished[] {
  const p = loadProfile();
  const out: Unfinished[] = [];
  if (p && missingFor(p, "tour").length)
    out.push({
      href: "/start?next=tour",
      title: p.name || LABELS.profile,
      status: "Finish setup",
    });
  for (const w of readWork()) {
    if (w.kind !== "plan") continue;
    if (w.status === "pending" || w.status === "running")
      out.push({ href: `/plan/${w.id}`, title: w.title, status: "Planning…" });
    else if (w.status === "failed" || w.status === "interrupted")
      out.push({
        href: `/plan/${w.id}`,
        title: w.title,
        status: "Stopped mid-way",
      });
  }
  return out;
}

async function fullUnfinished(): Promise<Unfinished[]> {
  const work = readWork();
  const p = loadProfile();
  if (!work.length) return quickUnfinished();
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "content-type": "application/json", ...profileHeaders(p) },
    body: JSON.stringify({
      runs: work.filter((i) => i.kind === "plan").map((i) => i.id),
      projects: [],
      events: work.filter((i) => i.kind === "event").map((i) => i.id),
      profile: p?.id,
    }),
  });
  if (!res.ok) return quickUnfinished();
  const { rows = [] } = (await res.json().catch(() => ({}))) as {
    rows?: WorkRow[];
  };
  const day = today();
  const out = quickUnfinished().filter((u) => !u.href.startsWith("/plan/"));
  for (const r of [...rows].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    if (isArchived(r, day) || (r.type === "event" && r.tourId)) continue;
    if (r.type === "tour" && r.status !== "done")
      out.push({
        href: `/plan/${r.id}`,
        title: r.title,
        status:
          r.status === "failed" || r.status === "interrupted"
            ? "Stopped mid-way"
            : "Planning…",
      });
    else if (r.type === "event" && !r.firstDate)
      out.push({
        href: `/events/${r.id}`,
        title: r.title,
        status: "Needs a date",
      });
    else if (r.type === "event" && !r.venue)
      out.push({
        href: `/events/${r.id}`,
        title: r.title,
        status: "Needs a venue",
      });
  }
  return out;
}

function AppBar() {
  const [name, setName] = useState<string>();
  const [todo, setTodo] = useState<Unfinished[]>([]);
  useEffect(() => {
    const read = () => setName(loadProfile()?.name || undefined);
    const quick = () => setTodo(quickUnfinished());
    read();
    quick();
    const a = subscribeProfile(() => (read(), quick()));
    const b = subscribeWork(quick);
    return () => (a(), b());
  }, []);
  const shown = todo.slice(0, 5);
  return (
    <header
      className="bg-foreground text-background [--ring:var(--background)] dark:border-b dark:bg-card dark:text-foreground dark:[--ring:var(--primary)]"
      data-testid="app-bar"
    >
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 xl:px-6">
        <Link
          to="/work"
          className="rounded-sm font-heading text-2xl tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tourbo
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">

          <ActMenu
            chip={CHIP}
            label={todo.length ? `${name ?? LABELS.profile}, ${todo.length} unfinished` : undefined}
            shown={shown}
            onOpen={() => void fullUnfinished().then(setTodo).catch(() => {})}
          >
              <UserRound className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{name ?? LABELS.profile}</span>
              <ChevronDown
                className="size-3.5 shrink-0 opacity-70"
                aria-hidden
              />
              {todo.length > 0 && (
                <span
                  className="absolute top-1 right-1 size-2 rounded-full bg-background ring-2 ring-foreground dark:bg-foreground dark:ring-card"
                  aria-hidden
                  data-testid="unfinished-dot"
                />
              )}
          </ActMenu>
        </div>
      </div>
    </header>
  );
}
