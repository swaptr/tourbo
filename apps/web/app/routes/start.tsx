import { ArrowLeft, ArrowRight, Check, LoaderCircle, MapPin, Mic, Music, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Form, redirect, useFetcher, useNavigation, useSearchParams } from "react-router";
import { z } from "zod";

import { AreaPicker, citiesInside, type AreaValue, type SeedCity } from "~/components/area-picker";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { startRun } from "../../server/agent/orchestrator.server";
import { allSeedCities, citiesNear } from "@tourbo/core/engine/cities.ts";
import { Area, TourParams, type PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/start";
import type { loader as resolveLoader } from "./api.resolve";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Plan your tour — Tourbo" }];
}

export async function loader() {
  const cities: SeedCity[] = allSeedCities().map((c) => ({ name: c.name, lat: c.lat, lon: c.lon, region: c.region }));
  const start = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  return { cities, start };
}

const ROOMS = {
  bar: { label: "Bar or small room", hint: "50–150 people", min: 50, max: 150 },
  club: { label: "Club", hint: "200–800 people", min: 200, max: 800 },
  theater: { label: "Theatre", hint: "800–3,000 people", min: 800, max: 3000 },
} as const;
type Room = keyof typeof ROOMS;

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());
  const area = Area.safeParse({ lat: form.lat, lon: form.lon, radiusKm: form.radiusKm });
  if (!area.success) return { error: "Pick where you want to play on the map." };
  const near = citiesNear(area.data, 0);
  if (near.inside < 2) return { error: "Fewer than two cities are inside your circle. Make it bigger or move it." };
  const room = ROOMS[form.room as Room] ?? ROOMS.club;
  const money = (k: string) => (form[k] ? form[k] : undefined);
  const parsed = TourParams.safeParse({
    artist: form.artist,
    kind: form.kind,
    peers: form.peers,
    notInQloo: form.notInQloo,
    region: near.region,
    homeBase: near.nearest.km <= 150 ? near.nearest.name : undefined,
    area: area.data,
    startDate: form.startDate,
    shows: Math.min(Number(form.shows), near.inside),
    roomMin: room.min,
    roomMax: room.max,
    money: { promoBudget: money("promoBudget"), minGuarantee: money("minGuarantee") },
    jobs: form.jobs,
  });
  if (!parsed.success) return { error: `Something in the form isn't right: ${z.prettifyError(parsed.error).split("\n")[0]}` };
  try {
    return redirect(`/plan/${await startRun(parsed.data)}`);
  } catch {
    return { error: "We couldn't start the planner. Is the database running? Try again in a moment." };
  }
}

const DISCIPLINES: { kind?: PerformerKind; label: string; hint: string; icon: typeof Music }[] = [
  { kind: "musician", label: "Musician", hint: "Singer, band, DJ, producer", icon: Music },
  { kind: "comedian", label: "Comedian", hint: "Stand-up, storyteller, host", icon: Mic },
  { label: "Dancer, poet, painter, author…", hint: "Coming soon", icon: Sparkles },
];

const STEPS = ["You", "Who", "Where", "When", "Jobs"];
const DRAFT_KEY = "tourbo:start";

type State = {
  kind: PerformerKind;
  artist: string;
  confirmed: boolean;
  peers: string;
  notInQloo: boolean;
  area: AreaValue;
  startDate: string;
  shows: number;
  room: Room;
  promoBudget: string;
  minGuarantee: string;
  jobs: { prep: boolean; outreach: boolean };
};

export default function Start({ loaderData, actionData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get("step") ?? 0), 0), STEPS.length - 1);
  const go = (n: number) => setParams({ step: String(n) }, { preventScrollReset: false });
  const [s, setS] = useState<State>({
    kind: "musician",
    artist: params.get("artist") ?? "",
    confirmed: false,
    peers: "",
    notInQloo: false,
    area: { lat: 41.88, lon: -87.63, radiusKm: 600 },
    startDate: loaderData.start,
    shows: 5,
    room: "club",
    promoBudget: "",
    minGuarantee: "",
    jobs: { prep: true, outreach: true },
  });
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const where = useMemo(() => citiesInside(loaderData.cities, s.area), [loaderData.cities, s.area]);
  const currency = where.region === "in" ? "₹" : where.region === "eu" ? "€" : "$";
  const submitting = useNavigation().state !== "idle";

  // Answers survive a refresh or a trip back from the plan page (this tab only).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as Partial<State> | null;
      if (saved) setS((prev) => ({ ...prev, ...saved, artist: params.get("artist") ?? saved.artist ?? prev.artist }));
    } catch {}
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(s));
  }, [s, restored]);

  // Deep links (?step=3) before earlier steps are filled send the user back to the start.
  useEffect(() => {
    if (restored && step > 1 && !s.artist) go(0);
  }, [step, restored]);

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <ol className="mb-8 flex items-center gap-2 text-xs" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                i < step && "border-indigo-600 bg-indigo-600 text-white",
                i === step && "border-indigo-600 text-indigo-700",
                i > step && "text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden sm:inline", i === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Step title="What do you do?" subtitle="Tourbo plans differently for a band than for a comic: rooms, openers, prices, what to say on stage.">
          <div className="grid gap-3 sm:grid-cols-3">
            {DISCIPLINES.map((d) => (
              <button
                key={d.label}
                type="button"
                disabled={!d.kind}
                onClick={() => {
                  set({ kind: d.kind!, confirmed: false });
                  go(1);
                }}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition",
                  d.kind ? "hover:border-indigo-400 hover:bg-indigo-50/50" : "cursor-not-allowed opacity-50",
                  d.kind === s.kind && "border-indigo-500 ring-2 ring-indigo-500/20",
                )}
              >
                <d.icon className="size-5 text-indigo-600" />
                <span className="font-medium">{d.label}</span>
                <span className="text-sm text-muted-foreground">{d.hint}</span>
              </button>
            ))}
          </div>
        </Step>
      )}

      {step === 1 && <WhoStep s={s} set={set} onBack={() => go(0)} onNext={() => go(2)} />}

      {step === 2 && (
        <Step title="Where do you want to play?" subtitle="Click the map where you'd like to tour, often around home, then size the circle. Every city inside is a candidate.">
          <div className="h-80 overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <AreaPicker cities={loaderData.cities} value={s.area} onChange={(area) => set({ area })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="near">Or start near</Label>
              <select
                id="near"
                className="h-9 rounded-lg border bg-transparent px-2.5 text-sm"
                value=""
                onChange={(e) => {
                  const c = loaderData.cities.find((x) => x.name === e.target.value);
                  if (c) set({ area: { ...s.area, lat: c.lat, lon: c.lon } });
                }}
              >
                <option value="">Choose a city…</option>
                {[...loaderData.cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="radius">Within {s.area.radiusKm.toLocaleString()} km</Label>
              <input
                id="radius"
                type="range"
                min={100}
                max={3000}
                step={50}
                value={s.area.radiusKm}
                onChange={(e) => set({ area: { ...s.area, radiusKm: Number(e.target.value) } })}
                className="accent-indigo-600"
              />
            </div>
          </div>
          <p className={cn("flex items-start gap-1.5 text-sm", where.inside.length < 2 ? "text-destructive" : "text-muted-foreground")}>
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {where.inside.length < 2
              ? "Fewer than two cities inside. Make the circle bigger or move it."
              : `${where.inside.length} cities inside: ${where.inside.slice(0, 8).map((c) => c.name).join(", ")}${where.inside.length > 8 ? "…" : ""}`}
          </p>
          <Nav onBack={() => go(1)} onNext={() => go(3)} nextDisabled={where.inside.length < 2} />
        </Step>
      )}

      {step === 3 && (
        <Step title="When, and how big?" subtitle="Pick the room size you can fill today. Tourbo still checks every night's money and may suggest a smaller room.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">First show</Label>
              <Input id="startDate" type="date" value={s.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Number of shows</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => set({ shows: Math.max(2, s.shows - 1) })} aria-label="Fewer shows">
                  −
                </Button>
                <span className="w-10 text-center text-lg font-medium tabular-nums">{s.shows}</span>
                <Button type="button" variant="outline" size="icon" onClick={() => set({ shows: Math.min(12, s.shows + 1) })} aria-label="More shows">
                  +
                </Button>
                {s.shows > where.inside.length && <span className="text-xs text-muted-foreground">only {where.inside.length} cities in your circle</span>}
              </div>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Typical room</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(ROOMS) as Room[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set({ room: r })}
                  className={cn("rounded-xl border p-3 text-left", s.room === r ? "border-indigo-500 ring-2 ring-indigo-500/20" : "hover:border-indigo-300")}
                >
                  <span className="block text-sm font-medium">{ROOMS[r].label}</span>
                  <span className="text-xs text-muted-foreground">{ROOMS[r].hint}</span>
                </button>
              ))}
            </div>
          </div>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">Money (optional)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="promoBudget">Promo budget for the whole tour ({currency})</Label>
                <Input id="promoBudget" type="number" min={0} value={s.promoBudget} onChange={(e) => set({ promoBudget: e.target.value })} placeholder="e.g. 2000" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="minGuarantee">Lowest fee you'd accept per show ({currency})</Label>
                <Input id="minGuarantee" type="number" min={0} value={s.minGuarantee} onChange={(e) => set({ minGuarantee: e.target.value })} placeholder="Used when negotiating" />
              </div>
            </div>
          </details>
          <Nav onBack={() => go(2)} onNext={() => go(4)} nextDisabled={!s.startDate} />
        </Step>
      )}

      {step === 4 && (
        <Step title="What should Tourbo do for you?" subtitle="Claude does these jobs for you while you watch. Nothing is sent to a venue until you approve it.">
          <Form method="post" className="space-y-5">
            <input type="hidden" name="kind" value={s.kind} />
            <input type="hidden" name="artist" value={s.artist} />
            <input type="hidden" name="peers" value={s.peers} />
            <input type="hidden" name="notInQloo" value={String(s.notInQloo)} />
            <input type="hidden" name="lat" value={s.area.lat} />
            <input type="hidden" name="lon" value={s.area.lon} />
            <input type="hidden" name="radiusKm" value={s.area.radiusKm} />
            <input type="hidden" name="startDate" value={s.startDate} />
            <input type="hidden" name="shows" value={s.shows} />
            <input type="hidden" name="room" value={s.room} />
            <input type="hidden" name="promoBudget" value={s.promoBudget} />
            <input type="hidden" name="minGuarantee" value={s.minGuarantee} />
            <input type="hidden" name="jobs" value={Object.entries(s.jobs).filter(([, v]) => v).map(([k]) => k).join(",")} />
            <ul className="space-y-2">
              <Job checked disabled title="Plan the tour" body="Pick the cities where your fans are, a room and opener in each, the deal and ticket price, and the route. Nights that would lose money are flagged or dropped." />
              <Job
                checked={s.jobs.prep}
                onChange={(prep) => set({ jobs: { ...s.jobs, prep } })}
                title={s.kind === "comedian" ? "Write material notes for every night" : "Write show notes for every night"}
                body={
                  s.kind === "comedian"
                    ? "Local openers, bit premises and crowd-work topics likely to land in each city, built from what that city's audience loves, plus a sponsor ask."
                    : "Opening line, setlist nods to local acts, banter and a crowd moment for each city, built from what that city's audience loves, plus a sponsor ask."
                }
              />
              <Job
                checked={s.jobs.outreach}
                onChange={(outreach) => set({ jobs: { ...s.jobs, outreach } })}
                title="Draft the venue emails"
                body="One booking inquiry per venue, with the fan numbers that make the case. When a venue makes an offer, Tourbo checks it against your fee and drafts a reply."
              />
            </ul>
            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-medium">{s.artist || "Your act"}</span> · {s.shows} shows near {where.nearest?.name ?? "your pin"} (
              {s.area.radiusKm} km) · from {s.startDate} · {ROOMS[s.room].label.toLowerCase()}
            </div>
            {actionData?.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{actionData.error}</p>}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => go(3)}>
                <ArrowLeft /> Back
              </Button>
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                {submitting ? "Starting…" : "Start planning"}
              </Button>
            </div>
          </Form>
        </Step>
      )}
    </main>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1.5 text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Nav({ onBack, onNext, nextDisabled, nextLabel = "Continue" }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-2">
      <Button type="button" variant="ghost" onClick={onBack}>
        <ArrowLeft /> Back
      </Button>
      <Button type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel} <ArrowRight />
      </Button>
    </div>
  );
}

function Job({ title, body, checked, disabled, onChange }: { title: string; body: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <li>
      <label className={cn("flex gap-3 rounded-xl border p-3", checked && "border-indigo-300 bg-indigo-50/40", !disabled && "cursor-pointer")}>
        <input type="checkbox" className="mt-1 accent-indigo-600" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{body}</span>
        </span>
      </label>
    </li>
  );
}

// "Is this you?": confirm the Qloo match, or plan from acts you sound like.
function WhoStep({ s, set, onBack, onNext }: { s: State; set: (p: Partial<State>) => void; onBack: () => void; onNext: () => void }) {
  const lookup = useFetcher<typeof resolveLoader>();
  const notMe = s.notInQloo;
  const setNotMe = (v: boolean) => set({ notInQloo: v });
  const data = lookup.data;
  const looking = lookup.state !== "idle";
  const name = s.artist.trim();

  useEffect(() => {
    setNotMe(false);
    if (name.length < 2) return;
    const t = setTimeout(() => lookup.load(`/api/resolve?name=${encodeURIComponent(name)}&kind=${s.kind}`), 350);
    return () => clearTimeout(t);
    // Re-run on the name or discipline only.
  }, [name, s.kind]);

  const found = data?.ok && data.act && !notMe;
  const needPeers = Boolean(data && !looking && name.length >= 2 && (!data.act || notMe));
  const canContinue = name.length >= 2 && !looking && (found ? true : needPeers && s.peers.split(",").some((p) => p.trim()));

  return (
    <Step
      title={s.kind === "comedian" ? "What's your stage name?" : "What's your act called?"}
      subtitle="Tourbo looks you up on Qloo to see where your fans are. New or not on Qloo yet? Tell us who you sound like instead."
    >
      <div className="grid gap-1.5">
        <Label htmlFor="artist">Name</Label>
        <Input id="artist" autoFocus autoComplete="off" value={s.artist} onChange={(e) => set({ artist: e.target.value })} placeholder={s.kind === "comedian" ? "e.g. Zakir Khan" : "e.g. Japanese Breakfast"} />
      </div>
      {looking && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Looking you up on Qloo…
        </p>
      )}
      {data && !data.ok && <p className="text-sm text-destructive">{data.error}</p>}
      {found && data.act && (
        <div className="flex items-center gap-3 rounded-xl border p-3">
          {data.act.image ? <img src={data.act.image} alt="" className="size-12 rounded-lg object-cover" /> : <div className="size-12 rounded-lg bg-muted" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{data.act.name}</p>
            <p className="truncate text-sm text-muted-foreground">{data.act.genres.join(" · ") || "On Qloo"}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNotMe(true)}>
            Not me
          </Button>
        </div>
      )}
      {needPeers && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/50 p-3">
          <p className="text-sm">
            {notMe ? "No problem." : `We couldn't find “${name}” on Qloo.`} Who do you sound like? Tourbo will plan from their fans.
          </p>
          {!notMe && data?.suggestions && data.suggestions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Did you mean:{" "}
              {data.suggestions.slice(0, 3).map((n, i) => (
                <span key={n}>
                  {i > 0 && ", "}
                  <button type="button" className="underline" onClick={() => set({ artist: n })}>
                    {n}
                  </button>
                </span>
              ))}
              ?
            </p>
          )}
          <Input aria-label="Acts you sound like" value={s.peers} onChange={(e) => set({ peers: e.target.value })} placeholder="One to three acts, comma-separated" />
        </div>
      )}
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </Step>
  );
}
