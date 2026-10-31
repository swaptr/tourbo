import { ArrowLeft, Check, LoaderCircle, MapPin, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Link,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import {
  AreaPicker,
  citiesInside,
  type AreaValue,
  type SeedCity,
} from "~/components/area-picker";
import {
  ICONS,
  Job,
  KindTiles,
  Nav,
  Step,
  type KindOption,
} from "~/components/onboarding";
import { ErrorLine } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AssistButton, type TitleDraft } from "~/components/assist";
import { Label } from "~/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { Skeleton } from "~/components/ui/skeleton";
import { loadProfile, type LocalProfile } from "~/lib/profile";
import { ownerKeyFor, recordWork } from "~/lib/work";
import { ProfileInputs } from "~/components/profile-inputs";
import { TownSearch } from "~/components/town-search";
import { LABELS } from "~/lib/labels";
import { cn } from "~/lib/utils";
import { startRun } from "../../server/agent/orchestrator.server";
import { apiError } from "../../server/agent/errors";
import { checkOwner, newOwnerKey } from "../../server/owner.server";
import { getWebEnv } from "../../server/env.server";
import { runLimit } from "../../server/limits.server";
import { attachRun } from "@tourbo/core/projects/projects.server.ts";
import { discipline, workspaceFor } from "@tourbo/core/disciplines/index.ts";
import { actKinds } from "@tourbo/core/disciplines/labels.server.ts";
import { citiesNear, topCities } from "@tourbo/core/engine/cities.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import { EventFields } from "@tourbo/core/events/event.ts";
import { createEvent } from "@tourbo/core/events/events.server.ts";
import { canDo } from "@tourbo/core/profiles/profile.ts";
import {
  Area,
  TourParams,
  type PerformerKind,
} from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/new";

// New tour or event (PLAN Q21). Starts from the act profile, so it never asks who you are; the one
// gate is profile/profile.ts REQUIRED (a tour needs the act's name and home base, an event the
// name; its city is asked here). Missing fields send the user to /start?next=… and back here.
// "What sort of show is this?" is per tour / event: pre-picked to the main kind, chips for the
// profile's other kinds, "Something else" for any kind.

export function meta({ location }: Route.MetaArgs) {
  return [
    {
      title: `${new URLSearchParams(location.search).get("type") === "event" ? "New event" : "New tour"} — Tourbo`,
    },
  ];
}

export async function loader() {
  await ensureWorld();
  const env = getWebEnv().DEMO_DISCIPLINES;
  const kinds: KindOption[] = (await actKinds())
    .filter((k) => k.enabled && env.includes(k.kind))
    .map((k) => ({ kind: k.kind, label: k.label, hint: k.hint }));
  const cities: SeedCity[] = topCities(1200).map((c) => ({
    name: c.name,
    lat: c.lat,
    lon: c.lon,
    region: c.region,
  }));
  return {
    kinds,
    cities,
    start: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
  };
}

const ROOMS = {
  bar: { label: "Bar or small room", hint: "50–150 people", min: 50, max: 150 },
  club: { label: "Club", hint: "200–800 people", min: 200, max: 800 },
  theater: { label: "Theatre", hint: "800–3,000 people", min: 800, max: 3000 },
} as const;
type Room = keyof typeof ROOMS;

async function offered(kind: unknown) {
  const env = getWebEnv().DEMO_DISCIPLINES;
  return (await actKinds()).some(
    (k) => k.enabled && env.includes(k.kind) && k.kind === kind,
  );
}

// The profile's owner key proves the profile is this browser's; only then is the work filed under it.
async function profileOf(form: Record<string, FormDataEntryValue>) {
  const id = String(form.profile ?? "");
  if (!id) return undefined;
  return (await checkOwner(
    "profile",
    id,
    String(form.profileKey ?? ""),
    true,
  ).catch(() => "forbidden")) === "ok"
    ? id
    : undefined;
}

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());
  if (!(await offered(form.kind)))
    return {
      error:
        "This site doesn't plan for that sort of show yet. Pick another one.",
    };
  if (form.intent === "event") return newEvent(form);
  const area = Area.safeParse({
    lat: form.lat,
    lon: form.lon,
    radiusKm: form.radiusKm,
  });
  if (!area.success)
    return { error: "Pick where you want to play on the map." };
  await ensureWorld();
  const near = citiesNear(area.data, 0);
  if (near.inside < 2)
    return {
      error:
        "Fewer than two cities are inside your circle. Make it bigger or move it.",
    };
  const room = ROOMS[form.room as Room] ?? ROOMS.club;
  const money = (k: string) => (form[k] ? form[k] : undefined);
  const parsed = TourParams.safeParse({
    artist: form.artist,
    kind: form.kind,
    peers: form.peers,
    notInQloo: form.notInQloo,
    styles: form.styles,
    basis: form.basis,
    region: near.region,
    homeBase:
      form.homeBase || (near.nearest.km <= 150 ? near.nearest.name : undefined),
    area: area.data,
    startDate: form.startDate,
    shows: Math.max(2, Math.min(Number(form.shows), near.inside)),
    mode: "tour",
    roomMin: room.min,
    roomMax: room.max,
    money: {
      promoBudget: money("promoBudget"),
      minGuarantee: money("minGuarantee"),
    },
    jobs: form.jobs,
  });
  if (!parsed.success)
    return {
      error: `Something in the form isn't right: ${z.prettifyError(parsed.error).split("\n")[0]}`,
    };
  const limited = runLimit(request);
  if (limited) return { error: limited };
  try {
    const owner = newOwnerKey();
    const id = await startRun(parsed.data, {
      ownerHash: owner.hash,
      profileId: await profileOf(form),
    });
    if (
      form.project &&
      (await checkOwner(
        "project",
        String(form.project),
        String(form.projectKey ?? ""),
      ).catch(() => "forbidden")) === "ok"
    )
      await attachRun(String(form.project), id).catch(() => {});
    return {
      created: {
        id,
        kind: "plan" as const,
        ownerKey: owner.key,
        title: `${parsed.data.artist} tour`,
        href: `/plan/${id}`,
      },
    };
  } catch (error) {
    return apiError(error, "start");
  }
}

async function newEvent(form: Record<string, FormDataEntryValue>) {
  const num = (k: string) => Number(form[k]);
  const venueName = String(form.venueName ?? "").trim();
  const parsed = EventFields.safeParse({
    title: form.title,
    artist: form.artist,
    kind: form.kind,
    city: form.city
      ? { name: String(form.city), lat: num("cityLat"), lon: num("cityLon") }
      : undefined,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    // Classes, workshops, seatings: how many and how big (only kinds that have them send these).
    classes:
      form.sessions || form.seats
        ? { sessions: form.sessions ? Number(form.sessions) : undefined, seats: form.seats ? Number(form.seats) : undefined }
        : undefined,
    venue:
      form.venue === "own" && venueName
        ? {
            name: venueName,
            address: String(form.venueAddress ?? "").trim() || undefined,
            source: "own",
          }
        : undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error:
        issue?.path[0] === "city"
          ? "Pick the city the show is in."
          : (issue?.message ?? "Check the event and try again."),
      field: String(issue?.path[0] ?? ""),
    };
  }
  if (form.venue === "own" && !venueName)
    return {
      error: "Give your venue a name, or choose “Help me pick later”.",
      field: "venueName",
    };
  try {
    const owner = newOwnerKey();
    const event = await createEvent(parsed.data, {
      ownerHash: owner.hash,
      profileId: await profileOf(form),
    });
    return {
      created: {
        id: event.id,
        kind: "event" as const,
        ownerKey: owner.key,
        title: event.title,
        href: `/events/${event.id}`,
      },
    };
  } catch (error) {
    return apiError(
      error,
      "new event",
      "The event didn't save. Try again in a moment.",
    );
  }
}

export default function NewWork({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [params] = useSearchParams();
  const type = params.get("type") === "event" ? "event" : "tour";
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LocalProfile>();
  const [ready, setReady] = useState(false);

  // The one gate: anything the action needs that the profile lacks goes back to onboarding, which
  // returns here when done.
  useEffect(() => {
    const p = loadProfile();
    if (!canDo(p, type)) {
      navigate(
        `/start?next=${type}${params.get("project") ? `&project=${params.get("project")}` : ""}`,
        { replace: true },
      );
      return;
    }
    setProfile(p);
    setReady(true);
  }, [type]);

  const created =
    actionData && "created" in actionData ? actionData.created : undefined;
  useEffect(() => {
    if (!created) return;
    recordWork({
      id: created.id,
      kind: created.kind,
      title: created.title,
      status: created.kind === "plan" ? "running" : "saved",
      ownerKey: created.ownerKey,
    });
    navigate(created.href, { replace: true });
  }, [created?.id]);

  if (!ready || !profile)
    return (
      <main
        className="container mx-auto max-w-3xl space-y-4 px-4 py-10"
        aria-busy="true"
        aria-label="Loading"
      >
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </main>
    );
  return type === "event" ? (
    <EventForm
      profile={profile}
      loaderData={loaderData}
      actionData={actionData}
    />
  ) : (
    <TourForm
      profile={profile}
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

type FormProps = {
  profile: LocalProfile;
  loaderData: Route.ComponentProps["loaderData"];
  actionData: Route.ComponentProps["actionData"];
};

// Hidden fields every new tour / event carries from the profile.
// "What sort of show is this?": the profile's kinds as chips (main first), "Something else" opens every kind.
function ShowKind({
  profile,
  kinds,
  value,
  onChange,
}: {
  profile: LocalProfile;
  kinds: KindOption[];
  value: PerformerKind;
  onChange: (k: PerformerKind) => void;
}) {
  const mine = profile.kinds
    .map((k) => kinds.find((o) => o.kind === k))
    .filter((k): k is KindOption => !!k);
  const [other, setOther] = useState(() => !mine.some((k) => k.kind === value));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">
        What sort of show is this?
      </legend>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="What sort of show is this?"
      >
        {mine.map((k) => {
          const Icon = ICONS[k.kind] ?? Sparkles;
          const on = !other && value === k.kind;
          return (
            <Button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={on}
              variant="outline"
              className={on ? "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background" : undefined}
              size="sm"
              onClick={() => {
                setOther(false);
                onChange(k.kind);
              }}
            >
              <Icon /> {k.label}
            </Button>
          );
        })}
        <Button
          type="button"
          role="radio"
          aria-checked={other}
          variant={other ? "default" : "outline"}
          size="sm"
          onClick={() => setOther(true)}
        >
          Something else
        </Button>
      </div>
      {other && (
        <KindTiles
          kinds={kinds}
          value={[value]}
          onChange={(v) => v[0] && onChange(v[0])}
        />
      )}
    </fieldset>
  );
}

const TOUR_STEPS = ["Where", "When", "Jobs"];

function TourForm({ profile, loaderData, actionData }: FormProps) {
  const [params, setParams] = useSearchParams();
  const step = Math.min(
    Math.max(Number(params.get("step") ?? 0), 0),
    TOUR_STEPS.length - 1,
  );
  const go = (n: number) => {
    const p = new URLSearchParams(params);
    p.set("step", String(n));
    setParams(p, { preventScrollReset: false });
  };
  const project = params.get("project") ?? undefined;
  const home = profile.home!;
  const [kind, setKind] = useState<PerformerKind>(
    profile.kinds[0] ?? "musician",
  );
  const [area, setArea] = useState<AreaValue>({
    lat: home.lat,
    lon: home.lon,
    radiusKm: 600,
  });
  const [startDate, setStartDate] = useState(loaderData.start);
  const [shows, setShows] = useState(5);
  const [room, setRoom] = useState<Room>("club");
  const [promoBudget, setPromo] = useState("");
  const [minGuarantee, setMinGuarantee] = useState("");
  const [jobs, setJobs] = useState({ prep: true, outreach: true });
  const where = useMemo(
    () => citiesInside(loaderData.cities, area),
    [loaderData.cities, area],
  );
  const nearList = useMemo(
    () =>
      [...loaderData.cities]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((c, i, all) => i === 0 || all[i - 1].name !== c.name),
    [loaderData.cities],
  );
  const currency =
    where.region === "in" ? "₹" : where.region === "eu" ? "€" : "$";
  const submitting =
    useNavigation().state !== "idle" ||
    !!(actionData && "created" in actionData);
  const d = discipline(kind);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <ol
          className="flex flex-1 items-center gap-2 text-xs"
          aria-label="Progress"
        >
          {TOUR_STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  i < step &&
                    "border-primary bg-primary text-primary-foreground",
                  i === step && "border-primary text-primary",
                  i > step && "text-muted-foreground",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden sm:inline",
                  i === step ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < TOUR_STEPS.length - 1 && (
                <span className="h-px flex-1 bg-border" />
              )}
            </li>
          ))}
        </ol>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/work" />}
        >
          Cancel
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="new-for">
        {LABELS.newTour} for{" "}
        <span className="font-medium text-foreground">{profile.name}</span> from{" "}
        {home.name} ·{" "}
        <Link to="/start?edit=1" className="underline underline-offset-4">
          edit profile
        </Link>
      </p>

      {step === 0 && (
        <Step
          title="Where do you want to play?"
          subtitle="Click the map, then size the circle."
          more="Every city inside the circle is a candidate. The circle starts at your home base."
        >
          <ShowKind
            profile={profile}
            kinds={loaderData.kinds}
            value={kind}
            onChange={setKind}
          />
          <div className="h-80 overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <AreaPicker
              cities={loaderData.cities}
              value={area}
              onChange={setArea}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="near">Or start near</Label>
              <NativeSelect
                id="near"
                className="w-full"
                value=""
                onChange={(e) => {
                  const c = loaderData.cities.find(
                    (x) => x.name === e.target.value,
                  );
                  if (c) setArea({ ...area, lat: c.lat, lon: c.lon });
                }}
              >
                <NativeSelectOption value="">Choose a city…</NativeSelectOption>
                {nearList.map((c) => (
                  <NativeSelectOption key={c.name}>{c.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="radius">
                Within {area.radiusKm.toLocaleString()} km
              </Label>
              <input
                id="radius"
                type="range"
                min={100}
                max={3000}
                step={50}
                value={area.radiusKm}
                onChange={(e) =>
                  setArea({ ...area, radiusKm: Number(e.target.value) })
                }
                className="accent-primary"
              />
            </div>
          </div>
          <p
            className={cn(
              "flex items-start gap-1.5 text-sm",
              where.inside.length < 2
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {where.inside.length < 2
              ? "Fewer than two cities inside. Make the circle bigger or move it."
              : `${where.inside.length} cities inside: ${where.inside
                  .slice(0, 8)
                  .map((c) => c.name)
                  .join(", ")}${where.inside.length > 8 ? "…" : ""}`}
          </p>
          <Nav onNext={() => go(1)} nextDisabled={where.inside.length < 2} />
        </Step>
      )}

      {step === 1 && (
        <Step
          title="When, and how big?"
          subtitle="Pick a room you can fill today."
          more="Tourbo still checks each night's money and may suggest a smaller room."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">First show</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-invalid={!startDate}
              />
              {!startDate && (
                <p className="text-sm text-destructive">
                  Pick the date of the first show.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Number of shows</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShows(Math.max(2, shows - 1))}
                  aria-label="Fewer shows"
                >
                  −
                </Button>
                <span className="w-10 text-center text-lg font-medium tabular-nums">
                  {shows}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShows(Math.min(12, shows + 1))}
                  aria-label="More shows"
                >
                  +
                </Button>
                {shows > where.inside.length && (
                  <span className="text-xs text-muted-foreground">
                    only {where.inside.length} cities in your circle
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Typical room</Label>
            <div
              className="grid gap-2 sm:grid-cols-3"
              role="radiogroup"
              aria-label="Typical room"
            >
              {(Object.keys(ROOMS) as Room[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={room === r}
                  onClick={() => setRoom(r)}
                  className={cn(
                    "rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    room === r
                      ? "border-primary ring-2 ring-primary/25"
                      : "hover:border-primary/50",
                  )}
                >
                  <span className="block text-sm font-medium">
                    {ROOMS[r].label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ROOMS[r].hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Money (optional)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="promoBudget">
                  Promo budget for the whole tour ({currency})
                </Label>
                <Input
                  id="promoBudget"
                  type="number"
                  min={0}
                  value={promoBudget}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder="e.g. 2000"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="minGuarantee">
                  Lowest fee you'd accept per show ({currency})
                </Label>
                <Input
                  id="minGuarantee"
                  type="number"
                  min={0}
                  value={minGuarantee}
                  onChange={(e) => setMinGuarantee(e.target.value)}
                  placeholder="Used when negotiating"
                />
              </div>
            </div>
          </details>
          <Nav
            onBack={() => go(0)}
            onNext={() => go(2)}
            nextDisabled={!startDate}
          />
        </Step>
      )}

      {step === 2 && (
        <Step
          title="What should Tourbo do?"
          subtitle="Nothing goes to a venue until you approve it."
          more="Tourbo does these jobs while you watch. Tap a job to see what it covers."
        >
          <Form method="post" className="space-y-5">
            <ProfileInputs profile={profile} kind={kind} />
            <input type="hidden" name="intent" value="tour" />
            <input type="hidden" name="homeBase" value={home.name} />
            {project && <input type="hidden" name="project" value={project} />}
            {project && (
              <input
                type="hidden"
                name="projectKey"
                value={ownerKeyFor(project) ?? ""}
              />
            )}
            <input type="hidden" name="lat" value={area.lat} />
            <input type="hidden" name="lon" value={area.lon} />
            <input type="hidden" name="radiusKm" value={area.radiusKm} />
            <input type="hidden" name="startDate" value={startDate} />
            <input type="hidden" name="shows" value={shows} />
            <input type="hidden" name="room" value={room} />
            <input type="hidden" name="promoBudget" value={promoBudget} />
            <input type="hidden" name="minGuarantee" value={minGuarantee} />
            <input
              type="hidden"
              name="jobs"
              value={Object.entries(jobs)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(",")}
            />
            <ul className="space-y-2">
              <Job
                checked
                disabled
                title="Plan the tour"
                body="Pick the cities where your fans are, a room and opener in each, the deal and ticket price, and the route. Nights that would lose money are flagged or dropped."
              />
              <Job
                checked={jobs.prep}
                onChange={(prep) => setJobs({ ...jobs, prep })}
                title={
                  kind === "comedian"
                    ? "Write material notes for every night"
                    : kind === "musician"
                      ? "Write show notes for every night"
                      : `Write ${d.noun} notes for every stop`
                }
                body="Opening words, local nods and a crowd moment for each city, built from what that city's audience loves, plus a sponsor ask."
              />
              <Job
                checked={jobs.outreach}
                onChange={(outreach) => setJobs({ ...jobs, outreach })}
                title="Draft the venue emails"
                body="One booking inquiry per venue, with the fan numbers that make the case. When a venue makes an offer, Tourbo checks it against your fee and drafts a reply."
              />
            </ul>
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-medium">{profile.name}</span> ·{" "}
              {loaderData.kinds.find((k) => k.kind === kind)?.label ?? kind} ·{" "}
              {shows} shows near {where.nearest?.name ?? "your pin"} (
              {area.radiusKm} km) · from {startDate} ·{" "}
              {ROOMS[room].label.toLowerCase()}
            </div>
            {actionData && "error" in actionData && actionData.error && (
              <ErrorLine message={actionData.error} />
            )}
            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => go(1)}
              >
                <ArrowLeft /> Back
              </Button>
              <Button
                type="submit"
                size="lg"
                data-primary
                disabled={submitting}
              >
                {submitting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {submitting ? "Starting…" : "Start planning"}
              </Button>
            </div>
          </Form>
        </Step>
      )}
    </main>
  );
}

// One-off event: sort of show, name, city, a day or a range, and a venue (your own, or let Tourbo
// suggest rooms later). Dates and venue can wait: it's saved as a draft.
function EventForm({ profile, loaderData, actionData }: FormProps) {
  const [kind, setKind] = useState<PerformerKind>(
    profile.kinds[0] ?? "musician",
  );
  const cities = useMemo(
    () =>
      [...loaderData.cities]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((c, i, all) => i === 0 || all[i - 1].name !== c.name),
    [loaderData.cities],
  );
  const [city, setCity] = useState(() =>
    cities.find((c) => c.name === profile.home?.name),
  );
  const [title, setTitle] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [venue, setVenue] = useState<"later" | "own">("later");
  const [venueName, setVenueName] = useState("");
  const [tried, setTried] = useState(false);
  const submitting =
    useNavigation().state !== "idle" ||
    !!(actionData && "created" in actionData);
  const autoTitle = `${profile.name} in ${city?.name ?? "…"}`;
  const ev = workspaceFor(kind).event; // date and venue field names for this kind
  const badRange = !!startDate && !!endDate && endDate < startDate;
  const problems = {
    city: !city ? "Pick the city the show is in." : undefined,
    endDate: badRange
      ? "The last day can't be before the first day."
      : undefined,
    venueName:
      venue === "own" && !venueName.trim()
        ? "Give your venue a name, or choose “Help me pick later”."
        : undefined,
  };
  const serverError =
    actionData && "error" in actionData ? actionData.error : undefined;
  const field = "grid gap-1.5";
  const msg = (m?: string) =>
    tried && m ? <p className="text-sm text-destructive">{m}</p> : null;

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-tight sm:text-3xl">
            {LABELS.newEvent}
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            {ev.hint}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/work?show=events" />}
        >
          Cancel
        </Button>
      </div>
      <Form
        method="post"
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          setTried(true);
          if (Object.values(problems).some(Boolean)) e.preventDefault();
        }}
      >
        <ProfileInputs profile={profile} kind={kind} />
        <input type="hidden" name="intent" value="event" />
        <input type="hidden" name="cityLat" value={city?.lat ?? ""} />
        <input type="hidden" name="cityLon" value={city?.lon ?? ""} />
        <input type="hidden" name="title" value={title.trim() || autoTitle} />
        <ShowKind
          profile={profile}
          kinds={loaderData.kinds}
          value={kind}
          onChange={setKind}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={field}>
            <Label htmlFor="ev-city">City</Label>
            <input type="hidden" name="city" value={city?.name ?? ""} />
            <TownSearch id="ev-city" value={city} invalid={tried && !city} onChange={(t) => setCity(t && { ...t, region: "na" })} />
            {msg(problems.city)}
          </div>
          <div className={field}>
            <Label htmlFor="ev-title">Name (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="ev-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={autoTitle}
                maxLength={120}
              />
              <AssistButton<TitleDraft>
                task="title"
                input={() => ({
                  kind,
                  mode: "event",
                  cities: city ? [city.name] : [],
                  startDate: startDate || undefined,
                  ai: true,
                })}
                label="Suggest"
                heading="A name for this show"
                disabled={!city}
                render={(d) => (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{d.title}</p>
                    {d.alternatives.slice(0, 3).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="block text-left text-muted-foreground hover:text-foreground"
                        onClick={() => setTitle(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                onKeep={(d) => setTitle(d.title)}
                onEdit={(d) => setTitle(d.title)}
                align="end"
              />
            </div>
          </div>
          <div className={field}>
            <Label htmlFor="ev-start">{ev.start} (optional)</Label>
            <Input
              id="ev-start"
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className={field}>
            <Label htmlFor="ev-end">{ev.end} (optional)</Label>
            <Input
              id="ev-end"
              name="endDate"
              type="date"
              value={endDate}
              min={startDate || undefined}
              disabled={!startDate}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={tried && badRange}
            />
            {msg(problems.endDate) ?? (
              <p className="text-xs text-muted-foreground">
                {startDate
                  ? "Leave empty for a one-day event."
                  : "Pick the first day first."}
              </p>
            )}
          </div>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{ev.venue}</legend>
          <div
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Venue"
          >
            {(
              [
                [
                  "later",
                  "Help me pick later",
                  "Tourbo suggests rooms in that city, with the money for each.",
                ],
                ["own", "My own venue", "Type its name and address."],
              ] as const
            ).map(([v, label, hint]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={venue === v}
                onClick={() => setVenue(v)}
                className={cn(
                  "rounded-xl border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  venue === v
                    ? "border-primary ring-2 ring-primary/25"
                    : "hover:border-primary/50",
                )}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="venue" value={venue} />
          {venue === "own" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={field}>
                <Label htmlFor="ev-venue">{ev.venue} name</Label>
                <Input
                  id="ev-venue"
                  name="venueName"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  aria-invalid={tried && !!problems.venueName}
                  maxLength={120}
                  autoFocus
                />
                {msg(problems.venueName)}
              </div>
              <div className={field}>
                <Label htmlFor="ev-address">Address (optional)</Label>
                <Input id="ev-address" name="venueAddress" maxLength={200} />
              </div>
            </div>
          )}
        </fieldset>
        {ev.classes && (
          <details className="group rounded-lg border px-3 py-2" data-testid="more-details">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              More details
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">{ev.classes.sessions} and {ev.classes.seats.toLowerCase()}</span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className={field}>
                <Label htmlFor="ev-sessions">{ev.classes.sessions} (optional)</Label>
                <Input id="ev-sessions" name="sessions" type="number" inputMode="numeric" min={1} max={60} placeholder="e.g. 2" />
              </div>
              <div className={field}>
                <Label htmlFor="ev-seats">{ev.classes.seats} (optional)</Label>
                <Input id="ev-seats" name="seats" type="number" inputMode="numeric" min={1} max={2000} placeholder="e.g. 12" />
              </div>
            </div>
          </details>
        )}
        {serverError && <ErrorLine message={serverError} />}
        <div className="flex justify-end">
          <Button type="submit" size="lg" data-primary disabled={submitting}>
            {submitting && <LoaderCircle className="animate-spin" />}{" "}
            {submitting ? "Saving…" : LABELS.addEvent}
          </Button>
        </div>
      </Form>
    </main>
  );
}
