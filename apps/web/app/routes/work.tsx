import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  NotebookPen,
  Download,
  Plus,
  Route as RouteIcon,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { InsightLine } from "~/components/assist";
import { NewTourForm } from "~/components/new-tour";
import { TourNotes } from "~/components/tour-notes";
import { Popover, PopoverContent, PopoverTitle } from "~/components/ui/popover";
import { ICONS } from "~/components/onboarding";
import { ErrorLine, ShownError, shownMessage } from "~/components/state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  ConfirmLine,
  DateCol,
  DateStub,
  FanRamp,
  EmptyState,
  FilterBar,
  ListGroup,
  ListPage,
  ListRow,
  ListState,
  NewMenu,
  RowActions,
  type FilterDef,
} from "~/components/list";
import { formatMoney } from "~/components/city-card";
import {
  loadProfile,
  profileHeaders,
  subscribeProfile,
  type LocalProfile,
} from "~/lib/profile";
import {
  exportWork,
  importWork,
  ownerKeyFor,
  readWork,
  removeWork,
  subscribeWork,
} from "~/lib/work";
import {
  DEFAULT_QUERY,
  PHASES,
  PHASE_LABEL,
  SORTS,
  SORT_LABEL,
  applyQuery,
  counts,
  filtered,
  inSection,
  isArchived,
  parseQuery,
  phaseOf,
  queryToParams,
  today,
  type Phase,
  type Query,
  type WorkRow,
} from "~/lib/workspace";
import { LABELS } from "~/lib/labels";
import { cn } from "~/lib/utils";
import { dateRange, days } from "@tourbo/core/events/event.ts";
import { canDo, missingFor } from "@tourbo/core/profiles/profile.ts";
import {
  REGION_NAMES,
  type PerformerKind,
  type Region,
} from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/work";

// The workspace (PLAN Q21): this browser's tours, one-off events and tour notebooks, grouped by
// time (on the road, next up, drafts; archived on its own view). Sort, filter and search live in
// the URL. Rows come from /api/workspace for the ids this browser knows (no listing of anyone
// else's work). Built on the shared list kit (components/list), like Events and Material.

export function meta({}: Route.MetaArgs) {
  return [{ title: `${LABELS.work} — Tourbo` }];
}

const LOAD_FAILED =
  "Your work can't be loaded right now. Check your connection and try again.";
const GROUPS: { phase: Phase; title: string }[] = [
  { phase: "on_the_road", title: "On the road" },
  { phase: "planned", title: "Next up" },
  { phase: "draft", title: "Drafts" },
  { phase: "past", title: "Past" },
];
// Status pills stay quiet (ink, not tomato): the page's one tomato is New.
const PILL: Record<Phase, string> = {
  on_the_road: "border-transparent bg-foreground text-background",
  planned: "border-transparent bg-muted text-foreground",
  draft: "border-dashed text-muted-foreground",
  past: "text-muted-foreground",
};

function useRows() {
  const [rows, setRows] = useState<WorkRow[]>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const work = readWork();
      const profile = loadProfile();
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...profileHeaders(profile),
        },
        body: JSON.stringify({
          runs: work.filter((i) => i.kind === "plan").map((i) => i.id),
          projects: [], // projects are retired: their notes live on the tour (TourNotes)
          events: work.filter((i) => i.kind === "event").map((i) => i.id),
          profile: profile?.id,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        rows?: WorkRow[];
        error?: string;
      };
      if (!res.ok || !body.rows)
        throw new ShownError(body.error ?? LOAD_FAILED);
      setRows(body.rows);
    } catch (e) {
      setError(shownMessage(e, LOAD_FAILED));
    }
  }, []);
  useEffect(() => {
    void load();
    return subscribeWork(() => void load());
  }, [load]);
  return { rows, setRows, error, load };
}

export default function Work() {
  const [params, setParams] = useSearchParams();
  const query = parseQuery(params);
  // Reads the live URL: the hook's params can lag one render behind the history entry, so quick
  // successive changes (a tab, then typing) never undo each other.
  const setQuery = (patch: Partial<Query>) =>
    setParams(
      () =>
        queryToParams({
          ...parseQuery(new URLSearchParams(window.location.search)),
          ...patch,
        }),
      { replace: true, preventScrollReset: true },
    );
  const clear = () =>
    setParams(
      queryToParams({
        ...DEFAULT_QUERY,
        section: query.section,
        sort: query.sort,
        dir: query.dir,
      }),
      { replace: true },
    );
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LocalProfile | null>(); // undefined until read (no flash)
  const { rows, setRows, error, load } = useRows();
  const day = today();
  const [notice, setNotice] = useState<string>();

  // Never walled: first-timers see the empty list with a quiet "set up your act" line.
  useEffect(() => {
    const read = () => setProfile(loadProfile() ?? null);
    read();
    return subscribeProfile(read);
  }, []);

  const shown = useMemo(
    () => (rows ? applyQuery(rows, query, day) : []),
    [rows, params.toString(), day],
  );
  const tally = rows ? counts(rows, query.section, day) : undefined;
  const kinds = useMemo(
    () =>
      [
        ...new Set((rows ?? []).map((r) => r.kind).filter(Boolean)),
      ] as PerformerKind[],
    [rows],
  );
  const regions = useMemo(
    () =>
      [
        ...new Set((rows ?? []).map((r) => r.region).filter(Boolean)),
      ] as Region[],
    [rows],
  );
  const missing = profile
    ? missingFor(profile, query.section === "events" ? "event" : "tour")
    : [];
  const events = query.section === "events";
  const grouped = query.view === "active" && query.sort === "date";
  const update = (r: WorkRow) => (next?: WorkRow) =>
    setRows((all) =>
      (all ?? []).flatMap((x) =>
        x.id === r.id && x.type === r.type ? (next ? [next] : []) : [x],
      ),
    );
  const file = useRef<HTMLInputElement>(null);
  // A tour on the road with a show today: one strip at the top that opens Tonight.
  const onTonight = rows?.find(
    (r) => r.type === "tour" && r.tonight && !isArchived(r, day),
  );
  const live =
    rows?.filter((r) => inSection(r, query.section) && !isArchived(r, day)) ??
    [];
  const onRoad = live.filter((r) => phaseOf(r, day) === "on_the_road").length;
  const noun = events
    ? live.length === 1
      ? LABELS.event
      : LABELS.events.toLowerCase()
    : live.length === 1
      ? LABELS.tour
      : LABELS.tours.toLowerCase();
  const countLine =
    rows && live.length > 0
      ? `${live.length} ${noun}${onRoad ? ` · ${onRoad} on the road` : ""}${tally?.archived ? ` · ${tally.archived} archived` : ""}`
      : undefined;

  const filters: FilterDef[] = [
    {
      key: "view",
      label: "Show",
      value: query.view,
      counts: query.view !== "active",
      options: [
        { value: "active", label: "Active", count: tally?.active },
        { value: "archived", label: "Archived", count: tally?.archived },
      ],
      onChange: (v) =>
        setQuery({ view: v === "archived" ? "archived" : "active" }),
    },
    {
      key: "status",
      label: "Status",
      any: "Any status",
      value: query.phase,
      options: PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] })),
      onChange: (v) => setQuery({ phase: v as Phase | undefined }),
    },
    {
      key: "kind",
      label: "Kind of show",
      any: "Any kind",
      value: query.kind,
      options:
        kinds.length > 1
          ? kinds.map((k) => ({ value: k, label: k.replace("_", " ") }))
          : [],
      onChange: (v) => setQuery({ kind: v as PerformerKind | undefined }),
    },
    {
      key: "region",
      label: "Region",
      any: "Anywhere",
      value: query.region,
      options:
        regions.length > 1
          ? regions.map((r) => ({ value: r, label: REGION_NAMES[r] }))
          : [],
      onChange: (v) => setQuery({ region: v as Region | undefined }),
    },
    {
      key: "when",
      label: "When",
      any: "Any time",
      value: query.when,
      options: [
        { value: "upcoming", label: "Upcoming" },
        { value: "past", label: "Past" },
      ],
      onChange: (v) => setQuery({ when: v as Query["when"] }),
    },
  ];

  return (
    <ListPage
      section={query.section}
      count={
        <>
          {countLine && (
            <span className="text-foreground/80">{countLine}. </span>
          )}
          {LABELS.page[query.section].line}
        </>
      }
      title={LABELS.page[query.section].title}
      notice={
        <>
          {onTonight && (
            <Link
              to={`/plan/${onTonight.id}/tonight`}
              className="flex items-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm text-background outline-none hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring/60 max-sm:min-h-11"
              data-testid="tonight-strip"
            >
              <span
                className="size-2 shrink-0 animate-pulse rounded-full bg-background motion-reduce:animate-none"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">Tonight:</span>{" "}
                {onTonight.tonight!.city.split(",")[0]}
                {onTonight.tonight!.venue && ` · ${onTonight.tonight!.venue}`}
              </span>
              <span aria-hidden>→</span>
            </Link>
          )}
          {profile !== undefined && (!profile || missing.length > 0) && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="finish-profile"
            >
              {!profile || (profile.skipped && !profile.name)
                ? events
                  ? "Tell Tourbo who you are and your shows are filed under your act."
                  : "Tell Tourbo who you are once, and every tour starts from there."
                : events
                  ? "Add your act's name to file shows under it."
                  : `Add your ${missing.includes("name") ? "act's name" : "home base"} and Tourbo can plan a tour.`}{" "}
              <Link
                to={`/start${profile ? `?next=${events ? "event" : "tour"}` : ""}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {profile ? "Finish your profile" : "Set up your act"}
              </Link>
            </p>
          )}
          {notice && (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
              data-testid="work-notice"
            >
              {notice}
              <button
                type="button"
                className="underline underline-offset-4 hover:text-foreground"
                onClick={() => setNotice(undefined)}
              >
                Dismiss
              </button>
            </p>
          )}
        </>
      }
      toolbar={
        <FilterBar
          q={query.q}
          onQ={(q) => setQuery({ q })}
          placeholder={
            events ? "Search shows, venues, cities" : "Search tours and cities"
          }
          filters={filters}
          sort={{
            value: query.sort,
            dir: query.dir,
            options: SORTS.filter(
              (s) => !events || s === "date" || s === "name",
            ).map((s) => ({ value: s, label: SORT_LABEL[s] })),
            onChange: (sort, dir) =>
              setQuery({
                sort: sort as Query["sort"],
                dir:
                  sort !== query.sort
                    ? sort === "profit" || sort === "nights"
                      ? "desc"
                      : "asc"
                    : dir,
              }),
          }}
          onClear={clear}
          menu={
            <>
              <RowActions
                label="More actions"
                size="icon"
                actions={[
                  {
                    label: profile?.name ? "Edit profile" : "Set up profile",
                    icon: <UserRound />,
                    to: "/start?edit=1",
                  },
                  {
                    label: "Export my work",
                    icon: <Download />,
                    onSelect: () => exportWork(),
                  },
                  {
                    label: "Import work",
                    icon: <Upload />,
                    onSelect: () => file.current?.click(),
                  },
                ]}
              />
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import work file"
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (!f) return;
                  try {
                    const n = importWork(await f.text());
                    setNotice(
                      n
                        ? `Imported ${n} item${n === 1 ? "" : "s"}.`
                        : "That file had nothing to import.",
                    );
                  } catch (err) {
                    setNotice((err as Error).message);
                  }
                }}
              />
            </>
          }
          newMenu={
            <NewMenu
              items={[
                profile && canDo(profile, "tour")
                  ? {
                      label: LABELS.newTour,
                      title: LABELS.planTour,
                      form: (close: () => void) => (
                        <NewTourForm profile={profile} close={close} />
                      ),
                    }
                  : { label: LABELS.newTour, to: "/start?next=tour" },
                { label: LABELS.newEvent, to: "/new?type=event" },
              ]}
            />
          }
        />
      }
    >
      <ListState
        error={error}
        onRetry={() => void load()}
        loading={!rows}
        empty={
          shown.length === 0 && (
            <Empty
              query={query}
              hasAny={(tally?.active ?? 0) + (tally?.archived ?? 0) > 0}
              onClear={clear}
            />
          )
        }
      >
        {grouped && events ? (
          byMonth(shown).map((g) => (
            <ListGroup key={g.key} title={g.title}>
              {g.rows.map((r) => (
                <Row
                  key={`${r.type}:${r.id}`}
                  row={r}
                  day={day}
                  act={profile?.name}
                  onChange={update(r)}
                />
              ))}
            </ListGroup>
          ))
        ) : grouped ? (
          GROUPS.map((g) => {
            const list = shown.filter((r) => phaseOf(r, day) === g.phase);
            return list.length ? (
              <ListGroup key={g.phase} title={g.title}>
                {list.map((r) => (
                  <Row
                    key={`${r.type}:${r.id}`}
                    row={r}
                    day={day}
                    act={profile?.name}
                    onChange={update(r)}
                  />
                ))}
              </ListGroup>
            ) : null;
          })
        ) : (
          <ListGroup title={query.view === "archived" ? "Archived" : undefined}>
            {shown.map((r) => (
              <Row
                key={`${r.type}:${r.id}`}
                row={r}
                day={day}
                act={profile?.name}
                onChange={update(r)}
              />
            ))}
          </ListGroup>
        )}
      </ListState>
    </ListPage>
  );
}

function Empty({
  query,
  hasAny,
  onClear,
}: {
  query: Query;
  hasAny: boolean;
  onClear: () => void;
}) {
  const events = query.section === "events";
  if (filtered(query))
    return (
      <EmptyState
        title="Nothing matches these filters."
        action={
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  if (query.view === "archived")
    return (
      <EmptyState
        title="Nothing archived."
        body={`${events ? LABELS.events : LABELS.tours} move here by themselves the day after their last date.`}
      />
    );
  return (
    <EmptyState
      title={
        hasAny
          ? "All quiet right now. Past ones are under Filter → Archived."
          : LABELS.empty[query.section].title
      }
      body={LABELS.empty[query.section].body}
      action={
        <>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={events ? "/new?type=event" : "/new?type=tour"} />}
          >
            {events ? <Plus /> : <Sparkles />}{" "}
            {events ? LABELS.addEvent : LABELS.planTour}
          </Button>
          {!events && !hasAny && (
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link to="/" />}
            >
              Try an example
            </Button>
          )}
        </>
      }
    />
  );
}

// Shows by month of their first day (soonest first as sorted); undated drafts last.
function byMonth(rows: WorkRow[]) {
  const groups = new Map<string, WorkRow[]>();
  for (const r of rows) {
    const k = r.firstDate?.slice(0, 7) ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const title = (k: string) =>
    k === "none"
      ? "No date yet"
      : new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
  return [...groups]
    .sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : 0))
    .map(([key, rows]) => ({ key, title: title(key), rows }));
}

// How far into a tour on the road: nights played of nights booked (by date).
function progress(r: WorkRow, day: string) {
  if (!r.firstDate || !r.lastDate) return undefined;
  const total = days(r.firstDate, r.lastDate);
  const done = Math.min(total, days(r.firstDate, day));
  return { done, total };
}

const keyOf = (r: WorkRow) =>
  r.type === "project" ? ownerKeyFor(r.id) : ownerKeyFor(r.tourId ?? r.id);
const hrefOf = (r: WorkRow) =>
  r.type === "project"
    ? `/projects/${r.id}`
    : r.type === "event"
      ? `/events/${r.id}`
      : `/plan/${r.id}`;
const serverKind = (r: WorkRow) =>
  r.type === "project" ? "project" : r.type === "event" ? "event" : "run";

// In the act's own workspace its name is noise: "Juniper Lane in Columbus" reads as "Columbus",
// a tour named after the act reads by its route ("Chicago to Minneapolis").
function shownTitle(row: WorkRow, act?: string) {
  if (!act || !row.title.toLowerCase().startsWith(act.toLowerCase()))
    return row.title;
  const rest = row.title.slice(act.length).trim();
  if (row.type === "tour") {
    const c = row.cities.map((x) => x.split(",")[0]);
    return c.length > 1 && c[0] !== c[c.length - 1]
      ? `${c[0]} to ${c[c.length - 1]}`
      : c.length
        ? `Around ${c[0]}`
        : row.title;
  }
  const m = rest.match(/^(?:in|at|:|-|–)\s*(.+)$/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1) : row.title;
}

function Row({
  row,
  day,
  act,
  onChange,
}: {
  row: WorkRow;
  day: string;
  act?: string;
  onChange: (r?: WorkRow) => void;
}) {
  const [busy, setBusy] = useState<"archive" | "delete">();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState<string>();
  const phase = phaseOf(row, day);
  const archived = isArchived(row, day);
  const key = keyOf(row);
  const Icon = (row.kind && ICONS[row.kind]) || Sparkles;
  const tourNight = row.type === "event" && !!row.tourId;
  const where =
    row.type === "event"
      ? [row.venue, row.cities[0]].filter(Boolean).join(", ")
      : row.cities.length
        ? row.cities.slice(0, 4).join(" → ") +
          (row.cities.length > 4 ? " …" : "")
        : row.homeBase
          ? `near ${row.homeBase}`
          : "";
  const status =
    row.type === "tour" &&
    (row.status === "failed" || row.status === "interrupted")
      ? "Stopped"
      : row.type === "tour" && row.status !== "done"
        ? "Planning"
        : PHASE_LABEL[phase];

  const archive = async () => {
    setBusy("archive");
    setError(undefined);
    try {
      const op = archived ? "restore" : "archive";
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key ? { "X-Owner-Key": key } : {}),
        },
        body: JSON.stringify({ op, kind: serverKind(row), id: row.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new ShownError(
          body.error ?? "That didn't change. Try again in a moment.",
        );
      onChange({ ...row, archived: op === "archive" });
    } catch (e) {
      setError(shownMessage(e, "That didn't change. Try again in a moment."));
    } finally {
      setBusy(undefined);
    }
  };
  const remove = async () => {
    setBusy("delete");
    setError(undefined);
    try {
      const path =
        row.type === "project"
          ? "projects"
          : row.type === "event"
            ? "events"
            : "runs";
      const res = await fetch(`/api/${path}/${row.id}`, {
        method: "DELETE",
        headers: key ? { "X-Owner-Key": key } : {},
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok && res.status !== 404)
        throw new ShownError(
          body.error ?? "That didn't delete. Try again in a moment.",
        );
      removeWork({ id: row.id, kind: row.type === "tour" ? "plan" : row.type });
      onChange(undefined);
    } catch (e) {
      setError(shownMessage(e, "That didn't delete. Try again in a moment."));
      setConfirming(false);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <ListRow
      data-phase={phase}
      data-archived={String(archived)}
      icon={<Icon />}
      lead={
        row.type === "event" ? (
          <DateStub start={row.firstDate} end={row.lastDate} />
        ) : row.firstDate && row.status === "done" ? (
          <DateCol start={row.firstDate} end={row.lastDate} />
        ) : undefined
      }
      ramp={row.fans?.length ? <FanRamp values={row.fans} /> : undefined}
      title={shownTitle(row, act)}
      href={hrefOf(row)}
      meta={
        row.type === "event" ? (
          <span className="inline-flex items-center gap-1">
            <Icon className="size-3.5 text-primary" aria-hidden />
            {[
              where || "Venue to pick",
              tourNight
                ? !row.tourTitle ||
                  (act &&
                    row.tourTitle.toLowerCase().startsWith(act.toLowerCase()))
                  ? `${LABELS.tour} night`
                  : `night of ${row.tourTitle}`
                : row.firstDate &&
                    row.lastDate &&
                    row.lastDate !== row.firstDate
                  ? `${days(row.firstDate, row.lastDate)} days`
                  : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : (
          <>
            {row.type === "project"
              ? LABELS.notebook
              : `${row.nights} night${row.nights === 1 ? "" : "s"}`}
            {row.firstDate && ` · ${dateRange(row.firstDate, row.lastDate)}`}
            {row.type === "project"
              ? row.notes
                ? ` · ${row.notes} notes`
                : ""
              : !row.cities.length && row.homeBase
                ? ` · near ${row.homeBase}`
                : ""}
          </>
        )
      }
      extra={
        <>
          {/* One line of fan-data insight per finished tour or show with a plan (batched, cached). */}
          {((row.type === "tour" && row.status === "done") ||
            (row.type === "event" && !tourNight && row.runId)) && (
            <InsightLine
              runId={row.type === "tour" ? row.id : row.runId}
              className="mt-1"
            />
          )}
          {row.type === "tour" &&
            (row.cities.length > 0 || phase === "on_the_road") && (
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {row.cities.length > 0 && (
                  <ol
                    className="flex min-w-0 max-sm:hidden items-center gap-1 overflow-hidden text-xs text-muted-foreground"
                    aria-label="Route"
                  >
                    {row.cities.slice(0, 6).map((c, i) => (
                      <li
                        key={`${c}${i}`}
                        className="flex shrink-0 items-center gap-1"
                      >
                        {i > 0 && (
                          <span className="h-px w-2 bg-border" aria-hidden />
                        )}
                        <span className="rounded-full bg-muted px-1.5 py-px">
                          {c.split(",")[0]}
                        </span>
                      </li>
                    ))}
                    {row.cities.length > 6 && (
                      <li className="shrink-0">+{row.cities.length - 6}</li>
                    )}
                  </ol>
                )}
                {phase === "on_the_road" &&
                  (() => {
                    const p = progress(row, day);
                    return p ? (
                      <span
                        className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                        data-testid="road-progress"
                      >
                        <span
                          className="h-1 w-14 overflow-hidden rounded-full bg-muted"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full bg-foreground/70"
                            style={{ width: `${(100 * p.done) / p.total}%` }}
                          />
                        </span>
                        day {p.done} of {p.total}
                      </span>
                    ) : null;
                  })()}
              </div>
            )}
        </>
      }
      figure={
        row.profit !== undefined &&
        row.currency && (
          <span
            className={cn(
              "num text-sm font-semibold",
              row.profit >= 0 ? "text-success" : "text-destructive",
            )}
            title="Estimated profit"
          >
            {formatMoney(row.profit, row.currency)}
          </span>
        )
      }
      pill={
        <Badge
          variant={status === "Stopped" ? "destructive" : "outline"}
          className={status === "Stopped" ? undefined : PILL[phase]}
        >
          {status}
        </Badge>
      }
      menu={
        <span ref={anchor} className="shrink-0">
          <RowActions
            label={`Actions for ${row.title}`}
            actions={[
              { label: "Open", icon: <ArrowUpRight />, to: hrefOf(row) },
              {
                label: "Notes and to-dos",
                icon: <NotebookPen />,
                onSelect: () => setNotes(true),
                hidden: row.type !== "tour",
              },
              {
                label: tourNight ? `Open the ${LABELS.tour}` : "",
                icon: <RouteIcon />,
                to: `/plan/${row.tourId}`,
                hidden: !tourNight,
              },
              {
                label: archived ? "Restore" : "Archive",
                icon: archived ? <ArchiveRestore /> : <Archive />,
                onSelect: () => void archive(),
                hidden: !key,
                disabled: !!busy,
              },
              {
                label: "Delete…",
                icon: <Trash2 />,
                onSelect: () => setConfirming(true),
                destructive: true,
                hidden: !key || tourNight,
                disabled: !!busy,
              },
            ]}
          />
          {row.type === "tour" && (
            <Popover open={notes} onOpenChange={setNotes}>
              <PopoverContent
                anchor={anchor}
                align="end"
                className="w-[min(26rem,calc(100vw-2rem))] p-3"
              >
                <PopoverTitle className="font-heading text-lg">
                  Notes for {row.title}
                </PopoverTitle>
                {notes && <TourNotes runId={row.id} compact />}
              </PopoverContent>
            </Popover>
          )}
        </span>
      }
      below={
        confirming ? (
          <ConfirmLine
            text={`Delete “${row.title}” for good?`}
            confirm="Delete"
            busy={!!busy}
            onConfirm={() => void remove()}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          error && <ErrorLine message={error} />
        )
      }
    />
  );
}
