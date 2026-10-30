import { Check, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { KindTiles, Nav, Step, StylePicker, WhoStep, type Chip, type Who } from "~/components/onboarding";
import { ErrorLine } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { TownSearch } from "~/components/town-search";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Skeleton } from "~/components/ui/skeleton";
import { loadProfile, saveProfile, skipProfile, type LocalProfile } from "~/lib/profile";
import { cn } from "~/lib/utils";
import { getWebEnv } from "../../server/env.server";
import { actKinds } from "@tourbo/core/disciplines/labels.server.ts";
import { topCities } from "@tourbo/core/engine/cities.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import { FIELDS, WHY, missingFor, type Action, type Field } from "@tourbo/core/profiles/profile.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { Route } from "./+types/start";

// Profile once (PLAN Q21): who the act is, in at most three short steps (what you do, your name,
// home base). Saved in this browser (owner key) and the DB. "Skip for now" lands on the workspace.
// Opened for an action (?next=tour | event | ideas) by someone who already has a profile, it asks
// only what that action is missing, with one line why, then goes straight on into the action.
// ?edit=1 is "Edit profile": every step, pre-filled.

export function meta({}: Route.MetaArgs) {
  return [{ title: "Your profile — Tourbo" }];
}

export async function loader() {
  await ensureWorld();
  const env = getWebEnv().DEMO_DISCIPLINES;
  const kinds = (await actKinds()).filter((k) => k.enabled && env.includes(k.kind)).map((k) => ({ kind: k.kind, label: k.label, hint: k.hint }));
  // Home base choices: the largest towns (world table when seeded), A→Z.
  const cities = topCities(1200)
    .map((c) => ({ name: c.name, lat: c.lat, lon: c.lon }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { kinds, cities: cities.filter((c, i) => cities.findIndex((x) => x.name === c.name) === i) };
}

const NEXT = ["tour", "event", "ideas"] as const;
const TITLE: Record<Field, string> = { kind: "What you do", name: "Your name", home: "Home base" };

type Draft = Who & { kinds: PerformerKind[]; home?: { name: string; lat: number; lon: number } };

function draftOf(p: LocalProfile | undefined, artist?: string | null): Draft {
  return {
    kinds: p?.kinds ?? [],
    kind: p?.kinds?.[0] ?? "musician",
    artist: artist ?? p?.name ?? "",
    notInQloo: p?.listed === false,
    way: p?.listed === false ? p.basis === "act" ? undefined : (p.basis as Who["way"]) : undefined,
    peers: (p?.peers ?? []) as Chip[],
    styles: (p?.styles ?? []) as Chip[],
    home: p?.home,
  };
}

export default function Start({ loaderData }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const next = NEXT.find((n) => n === params.get("next")) as Action | undefined;
  const editing = params.get("edit") === "1";
  const project = params.get("project");

  // Read the stored profile after hydration (localStorage); the steps follow from it.
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<LocalProfile>();
  const [d, setD] = useState<Draft>(() => draftOf(undefined, params.get("artist")));
  const [listed, setListed] = useState(true);
  useEffect(() => {
    const p = loadProfile();
    setStored(p);
    // Keep anything typed before the page finished loading.
    setD((prev) => {
      const saved = draftOf(p, params.get("artist"));
      return { ...saved, artist: prev.artist || saved.artist, kinds: prev.kinds.length ? prev.kinds : saved.kinds, kind: prev.kinds[0] ?? saved.kind };
    });
    setListed(p?.listed !== false);
    setReady(true);
  }, []);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  // First time (nothing stored), or editing: every step. Otherwise only what the action lacks.
  // Before hydration: the first-time steps (server HTML is the real form), except when opened
  // for an action, where a returning user's missing steps aren't known yet.
  const steps = useMemo<Field[]>(() => {
    if (!ready) return next ? [] : [...FIELDS];
    if (editing || !stored) return [...FIELDS];
    const missing = missingFor(stored, next);
    return missing.length ? missing : next ? [] : [...FIELDS];
  }, [ready, stored, editing, next]);
  const why = (f: Field) => (next && stored && !editing ? WHY[next][f] : undefined);

  const at = Math.min(Math.max(Number(params.get("step") ?? 0), 0), Math.max(steps.length - 1, 0));
  const go = (n: number) => {
    const p = new URLSearchParams(params);
    p.set("step", String(n));
    setParams(p, { preventScrollReset: false });
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // Where the user was going: the action they started, else the workspace.
  const onward = () => {
    const p = loadProfile();
    if (next === "ideas") return `/ideas?kind=${p?.kinds?.[0] ?? "musician"}&act=${encodeURIComponent(p?.name ?? "")}${p?.home ? `&city=${encodeURIComponent(p.home.name)}` : ""}`;
    if (next) return `/new?type=${next}${project ? `&project=${project}` : ""}`;
    return "/work";
  };
  const finish = async (patch: Partial<Draft> = {}, isListed = listed) => {
    const all = { ...d, ...patch };
    setSaving(true);
    setError(undefined);
    try {
      await saveProfile({
        name: all.artist.trim() || undefined,
        kinds: all.kinds,
        listed: isListed,
        basis: isListed ? "act" : (all.way ?? "city"),
        peers: isListed ? [] : all.peers,
        styles: all.styles,
        home: all.home,
      });
      navigate(onward(), { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };
  const advance = (patch: Partial<Draft> = {}, isListed = listed) => (at < steps.length - 1 ? go(at + 1) : void finish(patch, isListed));

  // Nothing missing for the action: straight on (e.g. a returning user's "New tour").
  useEffect(() => {
    if (ready && steps.length === 0) navigate(onward(), { replace: true });
  }, [ready, steps.length]);

  if (steps.length === 0)
    return (
      <main className="container mx-auto max-w-3xl space-y-4 px-4 py-10" aria-busy="true" aria-label="Loading your profile">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-9 w-2/3" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-11 rounded-xl" />
          ))}
        </div>
      </main>
    );

  const step = steps[at];
  const skip = () => {
    if (!next) skipProfile();
    navigate("/work");
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center gap-3">
        <ol className="flex flex-1 items-center gap-2 text-xs" aria-label="Progress">
          {steps.map((f, i) => (
            <li key={f} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  i < at && "border-primary bg-primary text-primary-foreground",
                  i === at && "border-primary text-primary",
                  i > at && "text-muted-foreground",
                )}
              >
                {i < at ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden sm:inline", i === at ? "font-medium" : "text-muted-foreground")}>{TITLE[f]}</span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>
        <Button type="button" variant="ghost" size="sm" onClick={skip} data-testid="skip-onboarding">
          {next ? "Not now" : editing ? "Cancel" : "Skip for now"}
        </Button>
      </div>

      {step === "kind" && (
        <Step title="What do you do?" subtitle="Pick all that apply, then mark your main one." why={why("kind")}>
          <KindTiles multi kinds={loaderData.kinds} value={d.kinds} onChange={(kinds) => set({ kinds, kind: kinds[0] ?? "musician" })} />
          <Nav onBack={at > 0 ? () => go(at - 1) : undefined} onNext={() => advance()} nextDisabled={!d.kinds.length || saving} reason={saving ? undefined : "Pick at least one."} nextLabel={at === steps.length - 1 ? "Save" : "Continue"} />
        </Step>
      )}

      {step === "name" && (
        <WhoStep
          s={d}
          set={set}
          why={why("name")}
          onSuggest={(sug) => set({ ...(sug.kinds.length ? { kinds: [...new Set([...d.kinds, ...sug.kinds])], kind: d.kinds[0] ?? sug.kinds[0] } : {}), ...(sug.home && !d.home ? { home: sug.home } : {}) })}
          onBack={at > 0 ? () => go(at - 1) : undefined}
          nextLabel={at === steps.length - 1 ? (next ? "Save and continue" : "Save") : "Continue"}
          onNext={(found) => {
            setListed(found);
            advance({}, found);
          }}
        />
      )}

      {step === "home" && (
        <HomeStep
          cities={loaderData.cities}
          d={d}
          set={set}
          why={why("home")}
          saving={saving}
          onBack={at > 0 ? () => go(at - 1) : undefined}
          nextLabel={next ? "Save and continue" : "Save"}
          onNext={() => advance()}
        />
      )}

      {error && (
        <div className="mt-4">
          <ErrorLine message={error} retry onRetry={() => void finish()} />
        </div>
      )}
      {editing && (
        <p className="mt-8 text-xs text-muted-foreground">
          Your profile lives in this browser.{" "}
          <Link to="/work" className="underline underline-offset-4">
            Back to your work
          </Link>
        </p>
      )}
    </main>
  );
}

// Home base: where tours start and end. Style is optional (and already set for "My style is…").
function HomeStep({ cities, d, set, why, saving, onBack, onNext, nextLabel }: { cities: { name: string; lat: number; lon: number }[]; d: Draft; set: (p: Partial<Draft>) => void; why?: string; saving: boolean; onBack?: () => void; onNext: () => void; nextLabel: string }) {
  const [touched, setTouched] = useState(false);
  return (
    <Step title="Where's home?" subtitle="Tours start and end here." why={why} more="Pick the nearest big town. You can plan anywhere later; this only sets the starting point.">
      <div className="grid gap-1.5">
        <Label htmlFor="home">Home base</Label>
        <TownSearch id="home" value={d.home} invalid={touched && !d.home} onChange={(t) => (setTouched(true), set({ home: t && { name: t.name, lat: t.lat, lon: t.lon } }))} placeholder="Type your town, e.g. Chicago" />
        {touched && !d.home ? (
          <p className="text-sm text-destructive">Pick your home base to continue.</p>
        ) : (
          d.home && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> Tours will start near {d.home.name}.
            </p>
          )
        )}
      </div>
      {!(d.notInQloo || d.way) && (
        <details className="rounded-xl border p-3" open={d.styles.length > 0}>
          <summary className="cursor-pointer text-sm font-medium">Your style (optional)</summary>
          <div className="mt-3">
            <StylePicker kind={d.kinds[0] ?? "musician"} chips={d.styles} onChange={(styles) => set({ styles })} />
          </div>
        </details>
      )}
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!d.home || saving} reason={saving ? undefined : "Pick your home base."} nextLabel={saving ? "Saving…" : nextLabel} />
      {saving && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" /> Saving your profile…
        </p>
      )}
    </Step>
  );
}
