// Stdio smoke test: spawns the server like Claude Desktop would and calls a few tools.
// Usage: npm run test -w @tourbo/mcp   (needs QLOO_API_KEY)
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../src/bin/stdio.ts", import.meta.url).pathname],
  env: { ...(process.env as Record<string, string>), QLOO_CACHE: "memory" },
  stderr: "inherit",
});
const client = new Client({ name: "tourbo-smoke", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`${tools.length} tools:`, tools.map((t) => t.name).join(", "));

const call = async (name: string, args: Record<string, unknown>) => {
  let events = 0;
  const res = await client.callTool({ name, arguments: args }, { onprogress: () => void events++, timeout: 120_000 });
  const text = res.content?.[0]?.type === "text" ? res.content[0].text : "";
  console.log(`\n${name} ${res.isError ? "ERROR" : "ok"} (${events} progress events): ${text.slice(0, 400)}`);
  return JSON.parse(text || "{}");
};

const act = await call("tourbo_resolve_act", { name: "Japanese Breakfast" });
const scores = await call("tourbo_score_cities", { act_id: act.id, region: "na", shows: 4 });
const top = scores.cities[0];
await call("tourbo_show_economics", {
  region: "na", city: top.city, fan_index: top.fanIndex, median_fan_index: scores.medianFanIndex, room_min: 500, room_max: 1500,
  rooms: [{ name: "Thalia Hall", capacity: 800 }, { name: "Metro", capacity: 1100 }], travel_km: 450,
});
await call("qloo_recommend", { target_type: "brand", signals: ["Japanese Breakfast"], signal_location: "Chicago", limit: 5 });
await call("qloo_find_tags", { query: "qawwali", limit: 3 });
await call("tourbo_find_markets", { genres: ["qawwali"], regions: ["in"], limit: 5 });
await client.close();
