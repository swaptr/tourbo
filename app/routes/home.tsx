import { useEffect, useState } from "react";
import { Form, Link, redirect, useFetcher, useNavigation } from "react-router";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { startRun } from "../../server/core/agent/orchestrator.server";
import { recentRuns } from "../../server/core/agent/runs.server";
import { seedCities } from "../../server/core/engine/cities";
import { TourParams, type Region } from "../../server/core/shared/types";
import type { Route } from "./+types/home";
import type { loader as searchLoader } from "./api.search";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Tourbo — plan the tour that sells out" }];
}

const DEMOS: { artist: string; region: Region; note: string }[] = [
  { artist: "Japanese Breakfast", region: "na", note: "indie, North America" },
  { artist: "Arijit Singh", region: "in", note: "India" },
  { artist: "Water From Your Eyes", region: "na", note: "niche, thin data" },
];

const ROOMS = {
  club: { label: "Club (200–800)", min: 200, max: 800 },
  theater: { label: "Theater (800–3,000)", min: 800, max: 3000 },
  amphitheater: { label: "Amphitheater (3,000–10,000)", min: 3000, max: 10000 },
  arena: { label: "Arena (10,000–20,000)", min: 10000, max: 20000 },
} as const;
type Room = keyof typeof ROOMS;

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export async function loader() {
  const start = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const cities = (region: Region) => seedCities(region).map((c) => c.name).sort();
  // The form still works if the DB is down; only the recent list is lost.
  const recent = await recentRuns().catch(() => []);
  return { start, homeBases: { na: cities("na"), in: cities("in") }, recent };
}

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());
  const room = ROOMS[form.room as Room] ?? ROOMS.club;
  const parsed = TourParams.safeParse({
    ...form,
    homeBase: form.homeBase || undefined,
    roomMin: room.min,
    roomMax: room.max,
  });
  if (!parsed.success) return { error: z.prettifyError(parsed.error) };
  const id = await startRun(parsed.data);
  return redirect(`/plan/${id}`);
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const search = useFetcher<typeof searchLoader>();
  const [artist, setArtist] = useState("");
  const [region, setRegion] = useState<Region>("na");
  const submitting = navigation.state !== "idle";

  useEffect(() => {
    if (artist.trim().length < 2) return;
    const timer = setTimeout(() => search.load(`/api/search?q=${encodeURIComponent(artist.trim())}`), 250);
    return () => clearTimeout(timer);
    // `search` changes identity every render; only the query should retrigger.
  }, [artist]);

  return (
    <main className="container mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Plan the tour that sells out</h1>
      <p className="mt-2 text-muted-foreground">
        Give it an artist. Tourbo finds where their fans actually are, picks rooms and local openers, and routes the
        tour, every pick backed by Qloo taste data.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Try:</span>
        {DEMOS.map((demo) => (
          <Button
            key={demo.artist}
            variant="outline"
            size="sm"
            onClick={() => {
              setArtist(demo.artist);
              setRegion(demo.region);
            }}
          >
            {demo.artist}
            <span className="text-muted-foreground">· {demo.note}</span>
          </Button>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tour details</CardTitle>
          <CardDescription>Room size steers venue picks; capacities are estimates (Qloo has none).</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="artist">Artist</Label>
              <Input
                id="artist"
                name="artist"
                required
                autoComplete="off"
                list="artist-options"
                placeholder="Search Qloo artists"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
              <datalist id="artist-options">
                {search.data?.results.map((r) => <option key={r.id} value={r.name} />)}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="region">Region</Label>
              <select
                id="region"
                name="region"
                className={selectClass}
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
              >
                <option value="na">North America</option>
                <option value="in">India</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="homeBase">Home base</Label>
              <select id="homeBase" name="homeBase" className={selectClass} key={region} defaultValue="">
                <option value="">Anywhere</option>
                {loaderData.homeBases[region].map((city) => (
                  <option key={city}>{city}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="startDate">Tour starts</Label>
              <Input id="startDate" name="startDate" type="date" required defaultValue={loaderData.start} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shows">Shows</Label>
              <Input id="shows" name="shows" type="number" min={2} max={20} defaultValue={6} required />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="room">Room size</Label>
              <select id="room" name="room" className={selectClass} defaultValue="club">
                {Object.entries(ROOMS).map(([key, room]) => (
                  <option key={key} value={key}>
                    {room.label}
                  </option>
                ))}
              </select>
            </div>
            {actionData?.error && (
              <p className="text-sm whitespace-pre-line text-destructive sm:col-span-2">{actionData.error}</p>
            )}
            <Button type="submit" size="lg" className="sm:col-span-2" disabled={submitting}>
              {submitting ? "Starting…" : "Plan tour"}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {loaderData.recent.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-muted-foreground">Recent tours</h2>
          <ul className="mt-2 divide-y rounded-xl ring-1 ring-foreground/10">
            {loaderData.recent.map((run) => (
              <li key={run.id}>
                <Link
                  to={`/plan/${run.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{run.artistName}</span>
                  <span className="text-muted-foreground">
                    {run.shows} shows · {run.region === "in" ? "India" : "North America"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
