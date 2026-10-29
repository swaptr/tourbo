// Stories 1+2 end to end with Claude (opt-in, costs a few cents): STORY_LLM=1 npm run test:stories
import assert from "node:assert/strict";
import { test } from "node:test";
import { appUp, BASE } from "./_mcp.ts";

const enabled = process.env.STORY_LLM === "1" && (await appUp());

test("Maya end to end: wizard → Claude plan with money, notes and emails", { skip: !enabled && "set STORY_LLM=1 with the app running", timeout: 600_000 }, async () => {
  const body = new URLSearchParams({ kind: "musician", artist: "Japanese Breakfast", lat: "41.88", lon: "-87.63", radiusKm: "600", startDate: "2027-03-01", shows: "4", room: "club", promoBudget: "2000", jobs: "prep,outreach" });
  const res = await fetch(`${BASE}/start`, { method: "POST", body, redirect: "manual" });
  const id = res.headers.get("location")?.match(/plan\/([0-9a-f-]{36})/)?.[1];
  assert.ok(id, "redirected to the plan");
  let status = "";
  for (let i = 0; i < 120 && !["done", "failed", "interrupted"].includes(status); i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const html = await (await fetch(`${BASE}/plan/${id}`)).text();
    // Read the rendered status badge: page data is turbo-stream encoded. The plan shows up
    // before the jobs (notes, emails) finish, so wait for the badge, not the plan.
    status = />done<\/span>/.test(html) ? "done" : /The planner (couldn|was interrupted)/.test(html) ? "failed" : "";
  }
  assert.equal(status, "done");
  const prep = await (await fetch(`${BASE}/plan/${id}/prep`)).text();
  assert.match(prep, /Critic|Qloo city brief/);
});
