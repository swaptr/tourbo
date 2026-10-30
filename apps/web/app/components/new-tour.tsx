import { ChevronDown, LoaderCircle, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";

import { discipline } from "@tourbo/core/disciplines/index.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";
import { ICONS } from "~/components/onboarding";
import { ProfileInputs } from "~/components/profile-inputs";
import { ErrorLine } from "~/components/state";
import { TownSearch, type Town } from "~/components/town-search";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { LABELS } from "~/lib/labels";
import type { LocalProfile } from "~/lib/profile";
import { cn } from "~/lib/utils";
import { recordWork } from "~/lib/work";

// "Plan a tour" as a small popover form (PLAN Q21): kind, near, radius, first night + nights,
// room size; money and jobs folded away. Posts to the same /new action as the full page;
// "Draw it on the map" opens /new?type=tour for a custom area.

const RADII = [100, 300, 600, 1000];
const ROOMS = [
  { key: "bar", label: "Small room" },
  { key: "club", label: "Club" },
  { key: "theater", label: "Theatre" },
] as const;
type Created = {
  created?: {
    id: string;
    kind: "plan";
    ownerKey: string;
    title: string;
    href: string;
  };
  error?: string;
};
const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const chip = (on: boolean) =>
  cn(
    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
    on ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
  );

export function NewTourForm({
  profile,
  close,
}: {
  profile: LocalProfile;
  close: () => void;
}) {
  const fetcher = useFetcher<Created>();
  const navigate = useNavigate();
  const [kind, setKind] = useState<PerformerKind>(
    profile.kinds[0] ?? "musician",
  );
  const [near, setNear] = useState<Town | undefined>(profile.home);
  const [radius, setRadius] = useState(600);
  const [startDate, setStart] = useState(inDays(60));
  const [shows, setShows] = useState(5);
  const [room, setRoom] = useState<(typeof ROOMS)[number]["key"]>("club");
  const [tried, setTried] = useState(false);
  const busy = fetcher.state !== "idle";
  const created = fetcher.data?.created;
  useEffect(() => {
    if (!created) return;
    recordWork({
      id: created.id,
      kind: "plan",
      title: created.title,
      status: "running",
      ownerKey: created.ownerKey,
    });
    close();
    navigate(created.href);
  }, [created?.id]);
  const kinds = profile.kinds.length
    ? profile.kinds
    : (["musician"] as PerformerKind[]);

  return (
    <fetcher.Form
      method="post"
      action="/new?type=tour"
      className="grid gap-3"
      noValidate
      data-testid="new-tour-form"
      onSubmit={(e) => {
        setTried(true);
        if (!near) e.preventDefault();
      }}
    >
      <ProfileInputs profile={profile} kind={kind} />
      <input type="hidden" name="intent" value="tour" />
      <input type="hidden" name="homeBase" value={profile.home?.name ?? ""} />
      <input type="hidden" name="lat" value={near?.lat ?? ""} />
      <input type="hidden" name="lon" value={near?.lon ?? ""} />
      <input type="hidden" name="radiusKm" value={radius} />
      <input type="hidden" name="shows" value={shows} />
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="jobs" value="prep,outreach" />

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">
          What sort of show is this?
        </legend>
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="What sort of show is this?"
        >
          {kinds.map((k) => {
            const Icon = ICONS[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={chip(kind === k)}
                onClick={() => setKind(k)}
              >
                {Icon && <Icon aria-hidden />}
                {discipline(k).label}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={false}
            className={chip(false)}
            onClick={() => (close(), navigate("/new?type=tour"))}
          >
            Something else
          </button>
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="nt-near">Start near</Label>
        <TownSearch
          id="nt-near"
          value={near}
          onChange={setNear}
          invalid={tried && !near}
        />
        {tried && !near && (
          <p className="text-xs text-destructive">
            Pick a town to plan around.
          </p>
        )}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="radiogroup"
          aria-label="How far"
        >
          {RADII.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={radius === r}
              className={chip(radius === r)}
              onClick={() => setRadius(r)}
            >
              {r.toLocaleString()} km
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nt-start">First night</Label>
          <Input
            id="nt-start"
            name="startDate"
            type="date"
            value={startDate}
            min={inDays(1)}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label id="nt-shows">Nights</Label>
          <div
            className="flex h-8 items-center gap-1"
            role="group"
            aria-labelledby="nt-shows"
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Fewer nights"
              disabled={shows <= 2}
              onClick={() => setShows(shows - 1)}
            >
              <Minus />
            </Button>
            <span
              className="num w-8 text-center font-medium"
              aria-live="polite"
            >
              {shows}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="More nights"
              disabled={shows >= 12}
              onClick={() => setShows(shows + 1)}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="radiogroup"
        aria-label="Typical room"
      >
        {ROOMS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={room === r.key}
            className={chip(room === r.key)}
            onClick={() => setRoom(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <details className="group rounded-lg border px-3 py-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
          Money and what Tourbo does
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="mt-2 grid gap-2">
          <div className="grid gap-1">
            <Label htmlFor="nt-promo">
              Promo budget for the whole tour (optional)
            </Label>
            <Input
              id="nt-promo"
              name="promoBudget"
              inputMode="numeric"
              placeholder="e.g. 1500"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="nt-fee">
              Lowest fee you'd take per night (optional)
            </Label>
            <Input
              id="nt-fee"
              name="minGuarantee"
              inputMode="numeric"
              placeholder="e.g. 400"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Tourbo also drafts show prep and venue emails. Change that on the
            full form.
          </p>
        </div>
      </details>

      {fetcher.data?.error && <ErrorLine message={fetcher.data.error} />}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/new?type=tour" onClick={close} />}
        >
          Draw it on the map
        </Button>
        <Button type="submit" data-primary disabled={busy}>
          {busy && <LoaderCircle className="animate-spin" />}{" "}
          {busy ? "Planning…" : LABELS.planThisTour}
        </Button>
      </div>
    </fetcher.Form>
  );
}
