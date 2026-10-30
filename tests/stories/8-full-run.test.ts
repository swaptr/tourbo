// Stories 1, 2, 10, 12 end to end with Claude (opt-in, costs a few cents): STORY_LLM=1 npm run test:stories
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
  assert.match(prep, /Critic|City brief/);

  // Save to a new project, rehearse night 1, and see the plan on the project page.
  const save = await fetch(`${BASE}/plan/${id}.data`, { method: "POST", body: new URLSearchParams({ intent: "project", project: "new" }) });
  assert.ok(save.ok);
  const planHtml = await (await fetch(`${BASE}/plan/${id}`)).text();
  const projectId = planHtml.match(/\/projects\/([0-9a-f-]{36})/)?.[1];
  assert.ok(projectId, "plan page links its project");
  const reh = await fetch(`${BASE}/plan/${id}/prep.data`, { method: "POST", body: new URLSearchParams({ intent: "rehearse", stop: "0" }) });
  assert.match(await reh.text(), /personas/);
  assert.match(await (await fetch(`${BASE}/plan/${id}/prep`)).text(), /Rehearsal with simulated fans/);
  assert.match(await (await fetch(`${BASE}/projects/${projectId}`)).text(), new RegExp(id));
});
