import { AssistButton, type ProfileDraft } from "~/components/assist";
import {
  Amphora,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  ChefHat,
  Check,
  Clapperboard,
  Disc3,
  Drama,
  Footprints,
  Guitar,
  LoaderCircle,
  MapPin,
  Mic,
  Music,
  Palette,
  PersonStanding,
  Podcast,
  Presentation,
  Sparkles,
  Tags,
  Tent,
  Users,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Hint } from "~/components/hint";
import { ErrorLine } from "~/components/state";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { discipline } from "@tourbo/core/disciplines/index.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { loader as resolveLoader } from "~/routes/api.resolve";
import type { loader as tagsLoader } from "~/routes/api.tags";

// Shared pieces of the profile onboarding (/start) and the new tour / event form (/new), PLAN Q21.

export type Way = "peers" | "styles" | "city";
export type Chip = { id: string; name: string; type?: string };
export type KindOption = { kind: PerformerKind; label: string; hint: string };

// Disciplines without their own icon use the fallback.
export const ICONS: Partial<Record<PerformerKind, LucideIcon>> = {
  musician: Music,
  comedian: Mic,
  dj: Disc3,
  dancer: Footprints,
  poet: Sparkles,
  visual_artist: Palette,
  author: BookOpen,
  podcaster: Podcast,
  speaker: Presentation,
  magician: WandSparkles,
  theatre: Drama,
  photographer: Camera,
  maker: Amphora,
  busker: Guitar,
  circus: Tent,
  chef: ChefHat,
  filmmaker: Clapperboard,
  teacher: PersonStanding,
};

// Every step: a short title, one hint line, controls. Longer help sits behind "?".
export function Step({
  title,
  subtitle,
  more,
  why,
  children,
}: {
  title: string;
  subtitle: string;
  more?: React.ReactNode;
  why?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        {why && (
          <p
            className="mb-3 rounded-lg bg-info/10 px-3 py-2 text-sm ring-1 ring-info/30"
            role="status"
            data-testid="why-asked"
          >
            {why}
          </p>
        )}
        <h1 className="font-heading text-2xl tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
          {subtitle}
          {more && <Hint label="More about this step">{more}</Hint>}
        </p>
      </div>
      {children}
    </section>
  );
}

// `reason`: one plain line next to a disabled Continue saying what it's waiting for.
export function Nav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Continue",
  reason,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  reason?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        {nextDisabled && reason && (
          <span
            className="text-right text-sm text-muted-foreground"
            id="next-reason"
            data-testid="next-reason"
          >
            {reason}
          </span>
        )}
        <Button
          type="button"
          data-primary
          onClick={onNext}
          disabled={nextDisabled}
          aria-describedby={nextDisabled && reason ? "next-reason" : undefined}
        >
          {nextLabel} <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

// Title only; what the job covers opens on demand.
export function Job({
  title,
  body,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        checked && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-3">
        <label
          className={cn(
            "flex flex-1 items-center gap-3",
            !disabled && "cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.checked)}
          />
          <span className="text-sm font-medium">{title}</span>
        </label>
        <Hint label={`What "${title}" covers`} align="end">
          {body}
        </Hint>
      </div>
    </li>
  );
}

// "Is this you?": confirm the fan-data match. Not listed (or "Not me")? Three equal ways in:
// acts you sound like, your style, or just your area. Never a dead end.
const WAYS: { key: Way; title: string; hint: string; icon: LucideIcon }[] = [
  {
    key: "peers",
    title: "I sound like…",
    hint: "1–3 acts you're like",
    icon: Users,
  },
  {
    key: "styles",
    title: "My style is…",
    hint: "1–3 styles or scenes",
    icon: Tags,
  },
  {
    key: "city",
    title: "Just my city",
    hint: "Plan from local taste",
    icon: MapPin,
  },
];

export type Who = {
  kind: PerformerKind;
  artist: string;
  notInQloo: boolean;
  way?: Way;
  peers: Chip[];
  styles: Chip[];
};

// The name step: confirm the fan-data match, or pick a way in. onNext gets whether it was found.
export function WhoStep({
  s,
  set,
  onBack,
  onNext,
  nextLabel,
  why,
  onSuggest,
}: {
  s: Who;
  set: (p: Partial<Who>) => void;
  onBack?: () => void;
  onNext: (listed: boolean) => void;
  nextLabel?: string;
  why?: string;
  onSuggest?: (d: ProfileDraft) => void;
}) {
  const lookup = useFetcher<typeof resolveLoader>();
  const notMe = s.notInQloo;
  const setNotMe = (v: boolean) => set({ notInQloo: v });
  const data = lookup.data;
  const looking = lookup.state !== "idle";
  const name = s.artist.trim();
  const [first, setFirst] = useState(true);

  useEffect(() => {
    // Keep a restored "Not me" on first render; a new name or discipline resets it.
    if (!first) setNotMe(false);
    setFirst(false);
    if (name.length < 2) return;
    const t = setTimeout(
      () =>
        lookup.load(
          `/api/resolve?name=${encodeURIComponent(name)}&kind=${s.kind}`,
        ),
      350,
    );
    return () => clearTimeout(t);
    // Re-run on the name or discipline only.
  }, [name, s.kind]);

  const found = Boolean(data?.ok && data.act && !notMe);
  const unlisted = Boolean(
    data && !looking && name.length >= 2 && (!data.act || notMe),
  );
  const ready =
    s.way === "city" ||
    (s.way === "peers" && s.peers.length > 0) ||
    (s.way === "styles" && s.styles.length > 0);
  const canContinue =
    name.length >= 2 && !looking && (found || (unlisted && ready));

  return (
    <Step
      title={
        s.kind === "comedian" || s.kind === "poet"
          ? "What's your stage name?"
          : s.kind === "visual_artist" || s.kind === "author"
            ? "What name do you work under?"
            : "What's your act called?"
      }
      subtitle="We'll look up where your fans are."
      more="Not listed yet? That's normal for new acts. Pick who you sound like, your style, or just your city."
      why={why}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="artist">Name</Label>
        <Input
          id="artist"
          autoFocus
          autoComplete="off"
          value={s.artist}
          onChange={(e) => set({ artist: e.target.value })}
          placeholder={`e.g. ${discipline(s.kind).example}`}
        />
      </div>
      {looking && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Looking you up…
        </p>
      )}
      {data && !data.ok && !looking && (
        <ErrorLine
          message={data.error}
          retry={data.retry}
          onRetry={() =>
            lookup.load(
              `/api/resolve?name=${encodeURIComponent(name)}&kind=${s.kind}`,
            )
          }
        />
      )}
      {!found && !notMe && !looking && data && data.suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Is it one of these?</p>
          <div className="flex flex-wrap gap-2">
            {data.suggestions.slice(0, 5).map((n) => (
              <Button
                key={n}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set({ artist: n })}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>
      )}
      {found && data?.act && (
        <div className="flex items-center gap-3 rounded-xl border p-3">
          {data.act.image ? (
            <img
              src={data.act.image}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
          ) : (
            <div className="size-12 rounded-lg bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{data.act.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {data.act.genres.join(" · ") || "Found you"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNotMe(true)}
          >
            Not me
          </Button>
        </div>
      )}
      {found && data?.act && onSuggest && (
        <AssistButton<ProfileDraft>
          task="profile_suggest"
          input={{ name: data.act.name, genres: data.act.genres }}
          label="Fill the rest from my act"
          heading="From your act"
          render={(d) => (
            <ul className="space-y-1 text-sm">
              {d.kinds.length > 0 && (
                <li>
                  You do: {d.kinds.map((k) => discipline(k).label).join(", ")}
                </li>
              )}
              {d.home && (
                <li>
                  Home base: {d.home.name}
                  {d.homeFrom ? ` (from ${d.homeFrom})` : ""}
                </li>
              )}
            </ul>
          )}
          isEmpty={(d) => !d.kinds.length && !d.home}
          onKeep={(d) => onSuggest(d)}
        />
      )}
      {unlisted && (
        <div className="space-y-3 rounded-xl border p-3" data-testid="unlisted">
          <p className="text-sm">
            {notMe
              ? "No problem. Pick one way in."
              : data?.ok
                ? data.suggestions.length
                  ? "Not on the list? Pick one way in."
                  : `“${name}” isn't listed yet. Pick one way in.`
                : "Or skip the lookup: pick one way in."}
          </p>
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="How should Tourbo plan for you?"
          >
            {WAYS.map((w) => (
              <button
                key={w.key}
                type="button"
                role="radio"
                aria-checked={s.way === w.key}
                onClick={() => set({ way: w.key })}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition hover:border-primary/50",
                  s.way === w.key && "border-primary ring-2 ring-primary/25",
                )}
              >
                <w.icon className="size-4 text-primary" />
                <span className="text-sm font-medium">{w.title}</span>
                <span className="text-xs text-muted-foreground">{w.hint}</span>
              </button>
            ))}
          </div>
          {s.way === "peers" && (
            <PeerPicker chips={s.peers} onChange={(peers) => set({ peers })} />
          )}
          {s.way === "styles" && (
            <StylePicker
              kind={s.kind}
              chips={s.styles}
              onChange={(styles) => set({ styles })}
            />
          )}
          {s.way === "city" && (
            <p className="text-sm text-muted-foreground">
              We'll plan from what people near you like.
            </p>
          )}
        </div>
      )}
      <Nav
        onBack={onBack}
        onNext={() => onNext(found)}
        nextDisabled={!canContinue}
        reason={
          name.length < 2
            ? "Type your name first."
            : looking
              ? "Looking you up…"
              : unlisted && !ready
                ? s.way === "peers"
                  ? "Add an act you sound like."
                  : s.way === "styles"
                    ? "Pick a style."
                    : "Choose how to plan."
                : undefined
        }
        nextLabel={nextLabel}
      />
    </Step>
  );
}

export const MAX_CHIPS = 3;
const normName = (x: string) =>
  x
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function Chips({
  chips,
  onRemove,
}: {
  chips: Chip[];
  onRemove: (c: Chip) => void;
}) {
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <li
          key={c.id}
          className="flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 py-0.5 pr-1 pl-3 text-sm"
        >
          {c.name}
          {c.type && (
            <span className="text-xs text-muted-foreground">· {c.type}</span>
          )}
          <button
            type="button"
            onClick={() => onRemove(c)}
            aria-label={`Remove ${c.name}`}
            className="rounded-full p-0.5 hover:bg-primary/20"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// "I sound like…": only names from the list become chips; anything else gets a plain hint.
export function PeerPicker({
  chips,
  onChange,
}: {
  chips: Chip[];
  onChange: (c: Chip[]) => void;
}) {
  const search = useFetcher<typeof resolveLoader>();
  const [q, setQ] = useState("");
  const [hint, setHint] = useState("");
  const [loaded, setLoaded] = useState(""); // query the current results belong to
  const [want, setWant] = useState(""); // Enter pressed before results arrived
  const results =
    search.data && "peers" in search.data ? (search.data.peers ?? []) : [];
  const full = chips.length >= MAX_CHIPS;

  useEffect(() => {
    setHint("");
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      setLoaded(q.trim());
      search.load(`/api/resolve?peer=${encodeURIComponent(q.trim())}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (want && search.state === "idle" && loaded === want) tryAdd();
  }, [search.state, search.data, loaded, want]);

  const add = (c: Chip) => {
    if (!chips.some((x) => x.id === c.id))
      onChange([...chips, c].slice(0, MAX_CHIPS));
    setQ("");
    setHint("");
  };
  const tryAdd = () => {
    const typed = q.trim();
    if (!typed) return;
    if (typed.length >= 2 && (search.state !== "idle" || loaded !== typed)) {
      setWant(typed);
      setHint("Checking…");
      return;
    }
    setWant("");
    const exact = results.find((r) => normName(r.name) === normName(typed));
    if (exact) add(exact);
    else
      setHint(
        `No match for “${typed}”. Pick a name from the list, or try “My style is…”.`,
      );
  };

  return (
    <div className="space-y-2">
      <Chips
        chips={chips}
        onRemove={(c) => onChange(chips.filter((x) => x.id !== c.id))}
      />
      {!full && (
        <div className="relative">
          <Input
            aria-label="Acts you sound like"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryAdd();
              }
            }}
            onBlur={() => q.trim() && setTimeout(tryAdd, 150)}
            placeholder="Type an act, comic, podcast or show"
          />
          {q.trim().length >= 2 && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md"
            >
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(r)}
                    className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {search.data && !search.data.ok && (
        <ErrorLine
          message={search.data.error}
          retry={search.data.retry}
          onRetry={() =>
            loaded &&
            search.load(`/api/resolve?peer=${encodeURIComponent(loaded)}`)
          }
        />
      )}
      {hint && (
        <p className="text-sm text-warning-foreground" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}

// "My style is…": up to three fan-data styles for the discipline.
export function StylePicker({
  kind,
  chips,
  onChange,
}: {
  kind: PerformerKind;
  chips: Chip[];
  onChange: (c: Chip[]) => void;
}) {
  const tags = useFetcher<typeof tagsLoader>();
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () =>
        tags.load(
          `/api/tags?kind=${kind}${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}`,
        ),
      q ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [q, kind]);
  const options = (tags.data?.tags ?? []).filter(
    (t) => !chips.some((c) => c.id === t.id),
  );
  const full = chips.length >= MAX_CHIPS;
  return (
    <div className="space-y-2">
      <Chips
        chips={chips}
        onRemove={(c) => onChange(chips.filter((x) => x.id !== c.id))}
      />
      {!full && (
        <>
          <Input
            aria-label="Find a style"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`e.g. ${discipline(kind).scene.split(",")[0]}`}
          />
          {tags.state !== "idle" && !options.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Finding styles…
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange([...chips, t].slice(0, MAX_CHIPS))}
                  className="rounded-full border px-3 py-0.5 text-sm hover:border-primary/50 hover:bg-primary/10"
                >
                  + {t.name}
                </button>
              ))}
              {tags.data?.ok && !options.length && q.trim().length >= 2 && (
                <p className="text-sm text-muted-foreground">
                  No style called “{q.trim()}”. Try a broader word.
                </p>
              )}
            </div>
          )}
          {tags.data && !tags.data.ok && (
            <ErrorLine
              message={tags.data.error}
              retry={tags.data.retry}
              onRetry={() =>
                tags.load(
                  `/api/tags?kind=${kind}${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ""}`,
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// Kind tiles. multi: toggles (first picked = main, marked); single: one pick. The first six (act_kinds
// order) show up front, the rest behind "More kinds".
export function KindTiles({
  kinds,
  value,
  onChange,
  multi,
}: {
  kinds: KindOption[];
  value: PerformerKind[];
  onChange: (v: PerformerKind[]) => void;
  multi?: boolean;
}) {
  const top = kinds.slice(0, 6);
  const rest = kinds.slice(6);
  const [more, setMore] = useState(() =>
    rest.some((k) => value.includes(k.kind)),
  );
  const tile = ({ kind, label, hint }: KindOption) => {
    const Icon = ICONS[kind] ?? Sparkles;
    const on = value.includes(kind);
    return (
      <button
        key={kind}
        type="button"
        aria-pressed={on}
        aria-describedby={hint ? `kind-hint-${kind}` : undefined}
        onClick={() =>
          onChange(
            multi
              ? on
                ? value.filter((k) => k !== kind)
                : [...value, kind]
              : [kind],
          )
        }
        className={cn(
          "flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none hover:border-foreground/40 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
          on && "border-foreground bg-card ring-1 ring-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 text-foreground/70" />
        {/* The hint teaches the choice ("Bands, singers, songwriters"); full text, no tooltip needed. */}
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {/* Name stays the label alone (exact, matches what's seen first); the hint is the description. */}
          {hint && <span id={`kind-hint-${kind}`} aria-hidden className="block text-xs font-normal text-muted-foreground">{hint}</span>}
        </span>

        {multi && on && (
          <Check className="size-4 shrink-0 text-foreground" aria-hidden />
        )}
      </button>
    );
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {top.map(tile)}
      </div>
      {rest.length > 0 &&
        (more ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rest.map(tile)}
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMore(true)}
          >
            More kinds
          </Button>
        ))}
      {multi && value.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-sm" role="radiogroup" aria-label="Main">
          <span className="mr-1 text-muted-foreground">Main:</span>
          {value.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value[0] === k}
              onClick={() => onChange([k, ...value.filter((x) => x !== k)])}
              className={cn("inline-flex h-7 items-center rounded-full border px-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring max-sm:h-10 max-sm:px-3.5", value[0] === k ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
            >
              {kinds.find((o) => o.kind === k)?.label ?? k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
