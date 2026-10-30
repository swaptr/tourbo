import {
  ArrowLeft,
  Check,
  LoaderCircle,
  MapPin,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";

import { AssistButton, type BuildSetDraft } from "~/components/assist";
import { EventSet } from "~/components/event-set";
import { saveEventSet } from "~/lib/material";
import { formatMoney } from "~/components/city-card";
import { ErrorLine, ShownError, shownMessage } from "~/components/state";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ReadOnlyNote } from "~/components/your-work";
import { itemNoun, LABELS, setName } from "~/lib/labels";
import { loadProfile } from "~/lib/profile";
import { ownerKeyFor, recordWork, removeWork, subscribeWork } from "~/lib/work";
import { PHASE_LABEL, phaseOf, today } from "~/lib/workspace";
import { eventRow } from "../../server/workspace.server";
import { getRun } from "../../server/agent/runs.server";
import { loadPool } from "../../server/agent/edits.server";
import {
  dateRange,
  days,
  type EventFields,
  type EventVenue,
} from "@tourbo/core/events/event.ts";
import { getEvent } from "@tourbo/core/events/events.server.ts";
import { stopKey, venueOptions } from "@tourbo/core/engine/edit.ts";
import { discipline, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import type { Route } from "./+types/events.$id";

// One event (PLAN Q21): a one-off (gig, gallery show, talk, residency) or one night of a tour.
// Dates, venue and the set are edited here; a tour night's room and date change in its tour.

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.event.title} — Tourbo`
        : "Event — Tourbo",
    },
  ];
}

type Room = {
  id: string;
  name: string;
  address?: string;
  roomType: string;
  capacity: number;
  profit: number;
  currency: string;
  current: boolean;
};

export async function loader({ params }: Route.LoaderArgs) {
  const event = await getEvent(params.id);
  if (!event) throw new Response("Not found", { status: 404 });
  // Tourbo's suggested rooms: from the tour's plan (a tour night) or the event's helper plan.
  const runId = event.tourId ?? event.runId;
  const run = runId ? await getRun(runId).catch(() => undefined) : undefined;
  let rooms: Room[] = [];
  if (run?.status === "done" && run.plan) {
    const stop = event.stopKey
      ? run.plan.stops.find((s) => stopKey(s) === event.stopKey)
      : run.plan.stops[0];
    const pool = stop ? await loadPool(run).catch(() => undefined) : undefined;
    if (stop && pool) {
      const currency =
        stop.money?.currency ?? run.plan.money?.currency ?? "USD";
      rooms = venueOptions(run.plan, stopKey(stop), { pool })
        .map((o) => ({
          id: o.venue.id,
          name: o.venue.name,
          address: o.venue.address,
          roomType: o.venue.roomType,
          capacity: o.capacity,
          profit: o.nightProfit,
          currency,
          current: o.current,
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 6);
    }
  }
  return {
    event,
    phase: eventRow(event),
    helper: run ? { id: run.id, status: run.status } : undefined,
    rooms,
  };
}

export default function EventPage({ loaderData }: Route.ComponentProps) {
  const { event, rooms, helper } = loaderData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [setVersion, setSetVersion] = useState(0);
  const keyId = event.tourId ?? event.id;
  const [key, setKey] = useState<string>();
  useEffect(() => {
    const read = () => setKey(ownerKeyFor(keyId));
    read();
    return subscribeWork(read);
  }, [keyId]);
  const canEdit = !!key;
  const tourNight = !!event.tourId;
  const phase = phaseOf(loaderData.phase, today());

  // Remember a one-off in this browser's list once it's opened here with its key.
  useEffect(() => {
    if (key && !tourNight)
      recordWork({
        id: event.id,
        kind: "event",
        title: event.title,
        status: "saved",
      });
  }, [key, event.title]);

  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const post = async (body: unknown, what: string) => {
    setBusy(what);
    setError(undefined);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Owner-Key": key ?? "",
        },
        body: JSON.stringify(body),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || out.error)
        throw new ShownError(
          out.error ?? "That didn't save. Try again in a moment.",
        );
      await revalidator.revalidate();
      return true;
    } catch (e) {
      setError(shownMessage(e, "That didn't save. Try again in a moment."));
      return false;
    } finally {
      setBusy(undefined);
    }
  };
  const save = (patch: Partial<EventFields>) =>
    post({ event: { ...fieldsOf(event), ...patch } }, "save");

  // Helper plan running: check back until it's done.
  useEffect(() => {
    if (!helper || (helper.status !== "running" && helper.status !== "pending"))
      return;
    const t = setInterval(() => void revalidator.revalidate(), 4000);
    return () => clearInterval(t);
  }, [helper?.status]);

  const remove = async () => {
    setBusy("delete");
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "DELETE",
        headers: { "X-Owner-Key": key ?? "" },
      });
      if (!res.ok && res.status !== 404)
        throw new ShownError(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ??
            "That didn't delete. Try again in a moment.",
        );
      removeWork({ id: event.id, kind: "event" });
      navigate("/work?show=events", { replace: true });
    } catch (e) {
      setError(shownMessage(e, "That didn't delete. Try again in a moment."));
      setBusy(undefined);
    }
  };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <main className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link
        to={tourNight ? `/plan/${event.tourId}` : "/work?show=events"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />{" "}
        {tourNight
          ? `Back to the ${LABELS.tour}`
          : `Your ${LABELS.events.toLowerCase()}`}
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1
            className="font-heading text-3xl tracking-tight"
            data-testid="event-title"
          >
            {event.title}
          </h1>
          <p
            className="mt-1 text-sm text-muted-foreground"
            data-testid="event-summary"
          >
            {discipline(event.kind).noun.replace(/^./, (c) => c.toUpperCase())}{" "}
            · {dateRange(event.startDate, event.endDate)}
            {event.startDate &&
              days(event.startDate, event.endDate) > 1 &&
              ` (${days(event.startDate, event.endDate)} days)`}{" "}
            · {event.venue ? `${event.venue.name}, ` : ""}
            {event.city.name}
            {event.classes?.sessions && workspaceFor(event.kind).event.classes && ` · ${event.classes.sessions} ${workspaceFor(event.kind).event.classes!.sessions.toLowerCase()}`}
            {event.classes?.seats && `${event.classes.sessions ? " ×" : " ·"} ${event.classes.seats} seats`}
          </p>
        </div>
        <Badge
          variant="outline"
          className={phase === "on_the_road" ? "border-transparent bg-foreground text-background" : phase === "planned" ? "border-transparent bg-muted text-foreground" : "text-muted-foreground"}
        >
          {PHASE_LABEL[phase]}
        </Badge>
      </div>
      {!canEdit && <ReadOnlyNote what="event" />}
      <ErrorLine message={error} />

      {canEdit && !tourNight && (
        <Details event={event} busy={busy === "save"} onSave={save} />
      )}

      <section className="space-y-3" aria-label="Venue">
        <h2 className="font-heading text-xl">Venue</h2>
        {event.venue ? (
          <p
            className="flex flex-wrap items-center gap-2 text-sm"
            data-testid="event-venue"
          >
            <MapPin className="size-4 text-muted-foreground" />
            <span className="font-medium">{event.venue.name}</span>
            {event.venue.address && (
              <span className="text-muted-foreground">
                {event.venue.address}
              </span>
            )}
            <Badge variant="outline">
              {event.venue.source === "own" ? "your venue" : "Tourbo's pick"}
            </Badge>
            {event.venue.profit !== undefined && event.venue.currency && (
              <span
                className={
                  event.venue.profit >= 0
                    ? "num text-success"
                    : "num text-destructive"
                }
              >
                about {formatMoney(event.venue.profit, event.venue.currency)}{" "}
                profit
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No venue yet.</p>
        )}
        {tourNight ? (
          <p className="text-sm text-muted-foreground">
            The room and date of a tour night change in the tour.{" "}
            <Link
              to={`/plan/${event.tourId}`}
              className="underline underline-offset-4"
            >
              Open the tour
            </Link>
          </p>
        ) : (
          canEdit && (
            <Suggested
              rooms={rooms}
              helper={helper}
              current={event.venue}
              busy={busy}
              onHelp={() => {
                const p = loadProfile();
                const how =
                  p?.listed === false
                    ? {
                        basis: p.basis ?? "city",
                        peers: p.peers
                          .map((x) => x.name.replace(/,/g, " "))
                          .join(","),
                        styles: p.styles.map((x) => x.id).join(","),
                      }
                    : {};
                void post({ intent: "help", ...how }, "help");
              }}
              onPick={(r) =>
                void save({
                  venue: {
                    name: r.name,
                    address: r.address,
                    source: "tourbo",
                    venueId: r.id,
                    capacity: r.capacity,
                    profit: r.profit,
                    currency: r.currency,
                  },
                })
              }
            />
          )
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl">{setName(event.kind)}</h2>
          {canEdit && (
            <AssistButton<BuildSetDraft>
              task="build_set"
              input={{ eventId: event.id }}
              label="Build my set"
              heading={`A ${setName(event.kind).toLowerCase()} for this room`}
              align="end"
              isEmpty={(d) => !d.order.some((e) => e.materialId)}
              empty={`Add a few ${itemNoun(event.kind, true)} to your library first.`}
              render={(d) => (
                <ol className="max-h-64 list-decimal space-y-1 overflow-y-auto pl-5 text-sm">
                  {d.order.map((e, i) => (
                    <li
                      key={i}
                      className={
                        e.materialId ? undefined : "text-muted-foreground"
                      }
                    >
                      <span className="font-medium">{e.title}</span>{" "}
                      <span className="text-muted-foreground">
                        · {e.reason}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              keepLabel="Use this set"
              onKeep={async (d) => {
                await saveEventSet(
                  event.id,
                  d.order.flatMap((e) => e.materialId ?? []),
                  event.tourId,
                );
                setSetVersion((v) => v + 1);
              }}
            />
          )}
        </div>
        <EventSet
          key={setVersion}
          eventId={event.id}
          tourId={event.tourId}
          kind={event.kind}
          canEdit={canEdit}
          currency={event.venue?.currency}
        />
      </section>

      {canEdit && !tourNight && (
        <div className="border-t pt-4">
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {`Delete this ${LABELS.event} for good? Your ${LABELS.material.toLowerCase()} stays.`}
              <Button
                size="sm"
                variant="destructive"
                disabled={!!busy}
                onClick={() => void remove()}
              >
                Delete show
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                autoFocus
              >
                Keep
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete show
            </Button>
          )}
        </div>
      )}
    </main>
  );
}

const fieldsOf = (e: EventFields): EventFields => ({
  title: e.title,
  artist: e.artist,
  kind: e.kind,
  city: e.city,
  startDate: e.startDate,
  endDate: e.endDate,
  venue: e.venue,
  classes: e.classes,
});

// Name, dates and your own venue, edited in place. Inline messages; Save only when something changed.
function Details({
  event,
  busy,
  onSave,
}: {
  event: EventFields;
  busy: boolean;
  onSave: (p: Partial<EventFields>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(event.title);
  const [start, setStart] = useState(event.startDate ?? "");
  const [end, setEnd] = useState(event.endDate ?? "");
  const [own, setOwn] = useState(
    event.venue?.source === "own" ? event.venue.name : "",
  );
  const [address, setAddress] = useState(
    event.venue?.source === "own" ? (event.venue.address ?? "") : "",
  );
  // Classes and seatings: sessions and seats (kinds whose workspace asks for them).
  const classLabels = workspaceFor(event.kind).event.classes;
  const [sessions, setSessions] = useState(event.classes?.sessions ? String(event.classes.sessions) : "");
  const [seats, setSeats] = useState(event.classes?.seats ? String(event.classes.seats) : "");
  const count = (v: string, max: number) => (v.trim() === "" ? undefined : /^\d+$/.test(v.trim()) && +v >= 1 && +v <= max ? +v : NaN);
  const nSessions = count(sessions, 60);
  const nSeats = count(seats, 2000);
  const badClasses = Number.isNaN(nSessions) || Number.isNaN(nSeats);
  const [saved, setSaved] = useState(false);
  const badRange = !!start && !!end && end < start;
  const noTitle = !title.trim();
  const changed =
    title !== event.title ||
    start !== (event.startDate ?? "") ||
    end !== (event.endDate ?? "") ||
    sessions !== (event.classes?.sessions ? String(event.classes.sessions) : "") ||
    seats !== (event.classes?.seats ? String(event.classes.seats) : "") ||
    (own.trim() !== "" &&
      (own !== (event.venue?.source === "own" ? event.venue.name : "") ||
        address !== (event.venue?.address ?? "")));
  const field = "grid gap-1.5";
  return (
    <form
      className="grid gap-4 rounded-xl p-4 ring-1 ring-border sm:grid-cols-2"
      aria-label="Event details"
      onSubmit={async (e) => {
        e.preventDefault();
        if (badRange || noTitle || badClasses) return;
        const venue: EventVenue | undefined = own.trim()
          ? {
              name: own.trim(),
              address: address.trim() || undefined,
              source: "own",
            }
          : event.venue;
        const ok = await onSave({
          title: title.trim(),
          startDate: start || undefined,
          endDate: start ? end || start : undefined,
          venue,
          ...(classLabels ? { classes: nSessions || nSeats ? { sessions: nSessions, seats: nSeats } : undefined } : {}),
        });
        setSaved(ok);
      }}
    >
      <div className={`${field} sm:col-span-2`}>
        <Label htmlFor="e-title">Name</Label>
        <Input
          id="e-title"
          value={title}
          maxLength={120}
          onChange={(e) => (setTitle(e.target.value), setSaved(false))}
          aria-invalid={noTitle}
        />
        {noTitle && (
          <p className="text-sm text-destructive">Give the event a name.</p>
        )}
      </div>
      <div className={field}>
        <Label htmlFor="e-start">{workspaceFor(event.kind).event.start}</Label>
        <Input
          id="e-start"
          type="date"
          value={start}
          onChange={(e) => (setStart(e.target.value), setSaved(false))}
        />
      </div>
      <div className={field}>
        <Label htmlFor="e-end">{workspaceFor(event.kind).event.end}</Label>
        <Input
          id="e-end"
          type="date"
          value={end}
          min={start || undefined}
          disabled={!start}
          onChange={(e) => (setEnd(e.target.value), setSaved(false))}
          aria-invalid={badRange}
        />
        {badRange && (
          <p className="text-sm text-destructive">
            The last day can't be before the first day.
          </p>
        )}
      </div>
      {classLabels && (
        <>
          <div className={field}>
            <Label htmlFor="e-sessions">{classLabels.sessions}</Label>
            <Input id="e-sessions" inputMode="numeric" value={sessions} placeholder="e.g. 2" onChange={(e) => (setSessions(e.target.value), setSaved(false))} aria-invalid={Number.isNaN(nSessions)} />
          </div>
          <div className={field}>
            <Label htmlFor="e-seats">{classLabels.seats}</Label>
            <Input id="e-seats" inputMode="numeric" value={seats} placeholder="e.g. 12" onChange={(e) => (setSeats(e.target.value), setSaved(false))} aria-invalid={Number.isNaN(nSeats)} />
          </div>
          {badClasses ? (
            <p className="text-sm text-destructive sm:col-span-2">Use whole numbers: 1–60 {classLabels.sessions.toLowerCase()}, 1–2,000 seats.</p>
          ) : nSessions && nSeats ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {nSessions * nSeats} seats in all.
            </p>
          ) : null}
        </>
      )}
      <div className={field}>
        <Label htmlFor="e-venue">Your own venue</Label>
        <Input
          id="e-venue"
          value={own}
          maxLength={120}
          placeholder="Venue name"
          onChange={(e) => (setOwn(e.target.value), setSaved(false))}
        />
      </div>
      <div className={field}>
        <Label htmlFor="e-address">Address</Label>
        <Input
          id="e-address"
          value={address}
          maxLength={200}
          disabled={!own.trim()}
          onChange={(e) => (setAddress(e.target.value), setSaved(false))}
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || !changed || badRange || noTitle}
        >
          {busy && <LoaderCircle className="animate-spin" />} Save changes
        </Button>
        {saved && !changed && (
          <span
            className="flex items-center gap-1 text-sm text-muted-foreground"
            role="status"
          >
            <Check className="size-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function Suggested({
  rooms,
  helper,
  current,
  busy,
  onHelp,
  onPick,
}: {
  rooms: Room[];
  helper?: { id: string; status: string };
  current?: EventVenue;
  busy?: string;
  onHelp: () => void;
  onPick: (r: Room) => void;
}) {
  if (!helper)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Want ideas? Tourbo checks rooms in this city and the money for each.
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy === "help"}
          onClick={onHelp}
        >
          {busy === "help" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Sparkles />
          )}{" "}
          Help me pick
        </Button>
      </div>
    );
  if (helper.status === "running" || helper.status === "pending")
    return (
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" /> Tourbo is checking
        rooms in this city…
      </p>
    );
  if (helper.status !== "done")
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        Tourbo couldn't check rooms this time.
        <Link
          to={`/plan/${helper.id}`}
          className="underline underline-offset-4"
        >
          See what happened
        </Link>
      </p>
    );
  if (!rooms.length)
    return (
      <p className="text-sm text-muted-foreground">
        Tourbo found no rooms here. Type your own venue above.
      </p>
    );
  return (
    <ul
      className="divide-y rounded-xl ring-1 ring-border"
      aria-label="Rooms Tourbo suggests"
      data-testid="suggested-rooms"
    >
      {rooms.map((r) => {
        const picked = current?.source === "tourbo" && current.venueId === r.id;
        return (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.roomType} · ~{r.capacity.toLocaleString()} people
                {r.address ? ` · ${r.address}` : ""}
              </span>
            </span>
            <span
              className={
                r.profit >= 0 ? "num text-success" : "num text-destructive"
              }
              title="Estimated profit for the night"
            >
              {formatMoney(r.profit, r.currency)}
            </span>
            <Button
              size="sm"
              variant={picked ? "secondary" : "outline"}
              disabled={picked || busy === "save"}
              onClick={() => onPick(r)}
            >
              {picked ? "Your venue" : "Use this room"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
