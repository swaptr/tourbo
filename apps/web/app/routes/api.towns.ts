import { db } from "@tourbo/core/db/client.server.ts";
import { searchTowns } from "@tourbo/core/engine/cities.ts";
import { ensureWorld } from "@tourbo/core/engine/world.server.ts";
import type { Route } from "./+types/api.towns";

type Row = { name: string; country: string; admin1: string | null; lat: number; lon: number };

// Any town by name for home base / "start near" (PLAN Q21). Local town data only (the GeoNames
// table, else the seed list), no fan data. US/CA towns carry their state ("Springfield, IL").
export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ towns: [] });
  const headers = { "cache-control": "public, max-age=3600" };
  try {
    if (await ensureWorld()) {
      const sql = await db();
      const t = q.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[%_\\]/g, "");
      const rows = await sql<Row[]>`
        select name, country, admin1, lat, lon from cities
        where ascii_name ilike ${t + "%"} or name ilike ${t + "%"} or ascii_name ilike ${"% " + t + "%"}
        order by (ascii_name ilike ${t + "%"} or name ilike ${t + "%"}) desc, population desc limit 8`;
      const towns = rows.map((r) => ({ name: r.name, lat: r.lat, lon: r.lon, country: (r.country === "US" || r.country === "CA") && r.admin1 && /^[A-Z]{2}$/.test(r.admin1) ? `${r.admin1}, ${r.country}` : r.country }));
      return Response.json({ towns }, { headers });
    }
  } catch {}
  return Response.json({ towns: searchTowns(q, 8).map((c) => ({ name: c.name, lat: c.lat, lon: c.lon, country: c.country })) }, { headers });
}
