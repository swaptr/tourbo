import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { ErrorLine } from "~/components/state";
import { Skeleton } from "~/components/ui/skeleton";
import { LABELS } from "~/lib/labels";
import { cn } from "~/lib/utils";

// The list page frame every workspace list shares (PLAN Q21): title, then the section tabs and
// the toolbar stuck to the top while scrolling, then only the user's items with every state
// (failed, loading, empty). Tours, Events and Material use it; later lists should too.

export type Section = "tours" | "events" | "material";
const SECTIONS: { key: Section; label: string; to: string }[] = [
  { key: "tours", label: LABELS.tours, to: "/work" },
  { key: "events", label: LABELS.events, to: "/work?show=events" },
  { key: "material", label: LABELS.material, to: "/material" },
];

export function ListPage({
  title,
  count,
  notice,
  section,
  toolbar,
  children,
}: {
  title: ReactNode;
  count?: ReactNode;
  notice?: ReactNode;
  section: Section;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  // A 1px sentinel above the toolbar tells when it's stuck (shadow on; no layout change).
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 80),
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <SectionNav section={section} />
      <main className="container mx-auto max-w-5xl px-4 pt-6 pb-12">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-3xl tracking-tight">
            {title}
          </h1>
          {count && (
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-testid="list-count"
            >
              {count}
            </p>
          )}
        </div>
        {notice && <div className="mt-3">{notice}</div>}
        <div ref={sentinel} aria-hidden className="h-px" />
        {/* Sticks right under the section tabs (h-10): one sticky block, paper ground + hairline. */}
        <div
          className={cn(
            "sticky top-10 z-20 -mx-4 border-b bg-background px-4 transition-[border-color,box-shadow] duration-200",
            stuck
              ? "border-border shadow-[0_6px_12px_-10px_rgb(0_0_0/0.25)]"
              : "border-transparent",
          )}
          data-testid="list-sticky"
          data-stuck={stuck || undefined}
        >
          {toolbar}
        </div>
        <div className="mt-3 space-y-5">{children}</div>
      </main>
    </>
  );
}

// Tours · Shows · Library, under the app bar and stuck to the top while scrolling. The row may
// scroll sideways on narrow screens (this nav only); the active tab is scrolled into view.
export function SectionNav({ section }: { section: Section }) {
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Newer browsers return a Promise here; an effect must return nothing.
    void active.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [section]);
  return (
    <nav
      className="sticky top-0 z-30 border-b bg-background"
      aria-label={LABELS.work}
      data-testid="section-nav"
    >
      <div className="container mx-auto flex h-10 max-w-5xl items-end gap-1 overflow-x-auto px-4 text-sm [scrollbar-width:none]">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            ref={section === s.key ? active : undefined}
            to={s.to}
            aria-current={section === s.key ? "page" : undefined}
            className={cn(
              "-mb-px flex h-8 shrink-0 items-center border-b-2 px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              section === s.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// Failed (one sentence + retry), loading (skeleton rows), empty (`empty`), else the rows.
export function ListState({
  error,
  onRetry,
  loading,
  empty,
  children,
}: {
  error?: string;
  onRetry?: () => void;
  loading: boolean;
  empty?: ReactNode;
  children: ReactNode;
}) {
  if (error)
    return (
      <ErrorLine message={error} retry={!!onRetry} onRetry={onRetry} boxed />
    );
  if (loading) return <ListSkeleton />;
  if (empty) return <>{empty}</>;
  return <>{children}</>;
}

export function ListSkeleton() {
  return (
    <ul className="divide-y border-y" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((n) => (
        <li key={n} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function ListGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1" aria-label={title}>
      {title && (
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      )}
      <ul className="divide-y border-y" data-testid="work-list">
        {children}
      </ul>
    </section>
  );
}

// One row of the programme listing (PLAN Q21 brief): date column · title + one meta line · fan
// ramp strip · status pill · one figure · ⋯ menu. Hairline rules, no cards. On phones the figure
// moves under the title (never dropped) and the whole row is the link. `lead` is the date column
// (or the Library's length); `icon` is the fallback when an item has no date. `below` holds a
// confirmation or an error line, never a form.
export function ListRow({
  icon,
  lead,
  title,
  href,
  meta,
  extra,
  ramp,
  figure,
  pill,
  menu,
  below,
  testId = "work-row",
  ...data
}: {
  icon?: ReactNode;
  lead?: ReactNode;
  title: ReactNode;
  href?: string;
  meta?: ReactNode;
  extra?: ReactNode;
  ramp?: ReactNode;
  figure?: ReactNode;
  pill?: ReactNode;
  menu?: ReactNode;
  below?: ReactNode;
  testId?: string;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <li
      className="relative flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2 transition-colors duration-150 hover:bg-muted/40 max-sm:min-h-16 max-sm:py-2.5"
      data-testid={testId}
      {...data}
    >
      {lead ?? (
        <span
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4"
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            to={href}
            className="block text-base leading-snug font-medium underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset max-sm:line-clamp-2 sm:truncate"
          >
            {title}
          </Link>
        ) : (
          <span className="block text-base leading-snug font-medium max-sm:line-clamp-2 sm:truncate">
            {title}
          </span>
        )}
        {(meta || figure) && (
          <p className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
            {meta && <span className="min-w-0 truncate">{meta}</span>}
            {/* Phones: the figure joins the meta line (two lines per row, never dropped). */}
            {figure && <span className="shrink-0 sm:hidden">{figure}</span>}
          </p>
        )}
        {/* Above the stretched link, so its "why?" and chips stay clickable and focusable. */}
        {extra && <div className="relative z-10 hidden sm:block">{extra}</div>}
      </div>
      {ramp && <span className="hidden shrink-0 md:inline-flex">{ramp}</span>}
      {pill && <span className="relative shrink-0">{pill}</span>}
      {figure && (
        <span className="hidden w-24 shrink-0 justify-end sm:flex">
          {figure}
        </span>
      )}
      {menu && <span className="relative z-10 shrink-0">{menu}</span>}
      {below && <div className="relative z-10 basis-full">{below}</div>}
    </li>
  );
}

// Fan strength per night as a 4-step strip on the fan ramp (one tick per night). Labelled as fan
// data; numbers live behind the item's "why?".
const STEP = ["bg-score-1", "bg-score-2", "bg-score-3", "bg-score-4"];
const WORD = ["light", "fair", "strong", "very strong"];
export function FanRamp({ values }: { values: number[] }) {
  if (!values.length) return null;
  const steps = values
    .slice(0, 12)
    .map((v) => Math.min(3, Math.max(0, Math.floor(v / 25))));
  return (
    <span
      className="flex h-4 items-end gap-0.5"
      role="img"
      aria-label={`Fan data by night: ${steps.map((s) => WORD[s]).join(", ")}`}
      title="Fan strength by night (fan data)"
    >
      {steps.map((s, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-[1px]", STEP[s])}
          style={{ height: `${40 + s * 20}%` }}
        />
      ))}
    </span>
  );
}

// The date column: serif tabular day over the month (one date), or "1–3" for a short run; tours
// over months show the first night. No date: a dash. Library rows put the length here instead.
export function DateCol({
  start,
  end,
  top,
  big,
}: {
  start?: string;
  end?: string;
  top?: string;
  big?: string;
}) {
  const d = (x: string) => new Date(`${x}T12:00:00Z`);
  const month =
    top ??
    (start
      ? d(start).toLocaleDateString("en-GB", {
          month: "short",
          timeZone: "UTC",
        })
      : "");
  const sameMonth =
    start &&
    end &&
    end !== start &&
    d(end).getUTCMonth() === d(start).getUTCMonth();
  const day =
    big ??
    (start
      ? `${d(start).getUTCDate()}${sameMonth ? `–${d(end!).getUTCDate()}` : ""}`
      : "–");
  return (
    <span
      className="flex w-11 shrink-0 flex-col items-center leading-none"
      aria-hidden
      data-testid="date-col"
    >
      <span className="text-xs font-medium text-muted-foreground uppercase">
        {month}
      </span>
      <span className="num mt-0.5 font-heading text-xl">{day}</span>
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  testId = "work-empty",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="space-y-3 rounded-xl px-4 py-8 text-center ring-1 ring-border"
      data-testid={testId}
    >
      <p className="font-heading text-xl">{title}</p>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      {action && <div className="flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// Inline "Delete for good?" line under a row (the ⋯ menu's Delete opens it).
export function ConfirmLine({
  text,
  confirm,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirm: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <span
      className="flex flex-wrap items-center gap-2 text-sm"
      role="alertdialog"
      aria-label={text}
    >
      {text}
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="inline-flex h-7 items-center rounded-md bg-destructive/10 px-2.5 text-sm font-medium text-destructive outline-none hover:bg-destructive/20 focus-visible:ring-3 focus-visible:ring-destructive/30 disabled:opacity-50"
      >
        {confirm}
      </button>
      <button
        ref={keep}
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="inline-flex h-7 items-center rounded-md px-2.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        Keep
      </button>
    </span>
  );
}
