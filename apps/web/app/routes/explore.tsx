import { LoaderCircle } from "lucide-react";
import { useFetcher } from "react-router";

import { Chip, formatNumber } from "~/components/trace";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { REGION_NAMES, Region, type Region as RegionT } from "@tourbo/core/shared/types.ts";
import { connectMcp } from "../../server/mcp.server";
import type { Route } from "./+types/explore";

export function meta({}: Route.MetaArgs) {
  return [{ title: "For venues and new acts — Tourbo" }];
}

type Markets = {
  found?: false;
  hint?: string;
  signal: { acts: { name: string }[]; tags: { name: string }[] };
  markets: { city: string; region: RegionT; score: number; heatmapCells: number; thinData: boolean }[];
};
type Acts = {
  found: boolean;
  hint?: string;
  venue?: { name: string; address?: string };
  acts?: { id: string; name: string; fit: number; localCells: number; affinity?: number }[];
  note?: string;
};

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const kindOf = (v: FormDataEntryValue | null) => (v === "comedian" ? "comedian" : "musician");

// Both tools run through the Tourbo MCP server, exactly as an external agent would call them.
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const mcp = await connectMcp(() => {}, ["tourbo"]);
  try {
    if (form.get("intent") === "markets") {
      const regions = form.getAll("regions").map(String);
      const markets = await mcp.call<Markets>("tourbo_find_markets", {
        acts: list(form.get("acts")),
        genres: list(form.get("genres")),
        regions: regions.length ? regions : Region.options,
        kind: kindOf(form.get("kind")),
        limit: 15,
      });
      return { intent: "markets" as const, markets };
    }
    const acts = await mcp.call<Acts>("tourbo_acts_for_venue", {
      venue: String(form.get("venue") ?? ""),
      city: String(form.get("city") ?? ""),
      kind: kindOf(form.get("kind")),
      limit: 10,
    });
    return { intent: "acts" as const, acts };
  } catch (error) {
    return { intent: String(form.get("intent")), error: (error as Error).message };
  } finally {
    await mcp.close().catch(() => {});
  }
}

const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

function KindSelect() {
  return (
    <select name="kind" className={selectClass} defaultValue="musician">
      <option value="musician">Musicians</option>
      <option value="comedian">Comedians</option>
    </select>
  );
}

export default function Explore() {
  const markets = useFetcher<typeof action>();
  const acts = useFetcher<typeof action>();
  const m = markets.data && "markets" in markets.data ? markets.data.markets : undefined;
  const a = acts.data && "acts" in acts.data ? acts.data.acts : undefined;
  return (
    <main className="container mx-auto max-w-5xl space-y-8 px-4 py-12">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">For venues and new acts</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Two questions small acts and small rooms ask before any tour exists. Both answers come from Qloo through the
          same MCP tools your own agent can call.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where do acts like me win?</CardTitle>
          <CardDescription>
            Rank cities in every region by the fans of comparable acts or a genre (try genre “qawwali”, or acts “Nusrat
            Fateh Ali Khan”). Built for new and foreign acts with no data of their own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <markets.Form method="post" className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
            <input type="hidden" name="intent" value="markets" />
            <div className="grid gap-1.5">
              <Label htmlFor="acts">Comparable acts</Label>
              <Input id="acts" name="acts" placeholder="Comma-separated" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="genres">Genres / scenes</Label>
              <Input id="genres" name="genres" placeholder="e.g. qawwali, shoegaze" />
            </div>
            <div className="grid gap-1.5">
              <Label>Act type</Label>
              <KindSelect />
            </div>
            <div className="flex flex-wrap gap-4 text-sm sm:order-last sm:col-span-4">
              {Region.options.map((r) => (
                <label key={r} className="flex items-center gap-1.5">
                  <input type="checkbox" name="regions" value={r} defaultChecked /> {REGION_NAMES[r]}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={markets.state !== "idle"}>
              {markets.state !== "idle" && <LoaderCircle className="animate-spin" />} Find markets
            </Button>
          </markets.Form>
          {markets.data && "error" in markets.data && <p className="text-sm text-destructive">{markets.data.error}</p>}
          {m?.hint && <p className="text-sm text-muted-foreground">{m.hint}</p>}
          {m?.markets && (
            <>
              <p className="text-xs text-muted-foreground">
                Signal: {[...m.signal.acts.map((x) => x.name), ...m.signal.tags.map((t) => `#${t.name}`)].join(" · ")}
              </p>
              <ol className="grid gap-1.5 sm:grid-cols-3">
                {m.markets.map((c, i) => (
                  <li key={c.city} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                    <span>
                      {i + 1}. {c.city} <span className="text-xs text-muted-foreground">{c.region.toUpperCase()}</span>
                    </span>
                    <span className="flex gap-1">
                      {c.thinData && <Badge variant="outline">thin</Badge>}
                      <Chip>{c.score}</Chip>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promoter mode: who should play my room?</CardTitle>
          <CardDescription>
            For bars, small venues and promoters: acts this room's crowd likes, ranked by affinity plus local fan
            presence. Try “Empty Bottle”, Chicago.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <acts.Form method="post" className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
            <input type="hidden" name="intent" value="acts" />
            <div className="grid gap-1.5">
              <Label htmlFor="venue">Venue</Label>
              <Input id="venue" name="venue" required placeholder="Venue name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required placeholder="City" />
            </div>
            <div className="grid gap-1.5">
              <Label>Act type</Label>
              <KindSelect />
            </div>
            <Button type="submit" disabled={acts.state !== "idle"}>
              {acts.state !== "idle" && <LoaderCircle className="animate-spin" />} Find acts
            </Button>
          </acts.Form>
          {acts.data && "error" in acts.data && <p className="text-sm text-destructive">{acts.data.error}</p>}
          {a?.hint && <p className="text-sm text-muted-foreground">{a.hint}</p>}
          {a?.acts && (
            <>
              <p className="text-sm">
                <span className="font-medium">{a.venue?.name}</span>
                {a.venue?.address && <span className="text-muted-foreground"> · {a.venue.address}</span>}
              </p>
              <ol className="divide-y text-sm">
                {a.acts.map((act, i) => (
                  <li key={act.id} className="flex items-center justify-between py-1.5">
                    <span>
                      {i + 1}. {act.name}
                    </span>
                    <span className="flex gap-1">
                      <Chip>fit {act.fit}</Chip>
                      <Chip>local cells {formatNumber(act.localCells)}</Chip>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">{a.note}</p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
