// WCAG 2.2 A/AA gate (DESIGN.md "UI standard"): axe-core on every main route, light + dark,
// 1440 + 390. One musician profile, tour and show are seeded once per run and handed to each
// scenario's fresh browser context through localStorage, as the creating browser would hold them.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { AxeBuilder } from "@axe-core/playwright";
import { Given, Then, When } from "@cucumber/cucumber";

import { createEvent } from "@tourbo/core/events/events.server.ts";
import { newOwnerKey } from "../../../apps/web/server/owner.server.ts";
import { BASE } from "../support/harness.ts";
import { seedPlan } from "../support/runs.ts";
import type { TourboWorld } from "../support/world.ts";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// DESIGN.md "Semantics" beyond the WCAG tags: one h1, ordered headings, landmarks.
const STRUCTURE = ["page-has-heading-one", "heading-order", "landmark-one-main", "landmark-no-duplicate-main", "landmark-unique", "region"];
const OUT = process.env.BDD_A11Y_OUT; // optional: one JSON per scenario, for tallying by rule

type Fixture = { tour: string; event: string; profile: unknown; work: unknown[] };
let fixture: Promise<Fixture> | undefined;

async function seed(): Promise<Fixture> {
  const res = await fetch(`${BASE}/api/profile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Nobody A11y", kinds: ["musician"], listed: false, basis: "city", peers: [], styles: [], home: { name: "Chicago", lat: 41.88, lon: -87.63 } }),
  });
  const body = await res.json();
  assert.ok(res.ok, `profile: ${JSON.stringify(body)}`);
  const tour = await seedPlan("musician", "Test Act 3");
  const owner = newOwnerKey();
  const event = await createEvent(
    { title: "Hideout night", artist: "Test Act 3", kind: "musician", city: { name: "Chicago", lat: 41.88, lon: -87.63 }, startDate: "2027-03-05", endDate: undefined },
    { ownerHash: owner.hash, profileId: body.profile.id },
  );
  const now = new Date().toISOString();
  return {
    tour: tour.id,
    event: event.id,
    profile: { ...body.profile, ownerKey: body.ownerKey },
    work: [
      { id: tour.id, kind: "plan", title: tour.title, status: "done", ownerKey: tour.ownerKey, updatedAt: now },
      { id: event.id, kind: "event", title: "Hideout night", ownerKey: owner.key, updatedAt: now },
    ],
  };
}

type W = TourboWorld & { a11y?: Fixture; theme?: string };

Given("a musician with a tour and a show", async function (this: W) {
  fixture ??= seed();
  this.a11y = await fixture;
});

Given(/^I use the (light|dark) theme on a (\d+) px wide screen$/, async function (this: W, theme: string, width: string) {
  this.theme = theme;
  await this.page.setViewportSize({ width: Number(width), height: Number(width) < 600 ? 844 : 900 });
});

When("I open the accessible page {string}", async function (this: W, path: string) {
  const f = this.a11y!;
  const newcomer = path.startsWith("/start");
  await this.context.addInitScript(
    ([theme, profile, work, newcomer]) => {
      try {
        localStorage.setItem("theme", theme as string);
        if (newcomer) {
          localStorage.removeItem("tourbo:profile");
          localStorage.removeItem("tourbo:work");
        } else {
          localStorage.setItem("tourbo:profile", JSON.stringify(profile));
          localStorage.setItem("tourbo:work", JSON.stringify(work));
        }
      } catch {}
    },
    [this.theme, f.profile, f.work, newcomer] as const,
  );
  await this.open(path.replace("{tour}", f.tour).replace("{event}", f.event));
  // Tour pages replace the URL once hydrated (?night=1); wait through that navigation.
  for (let i = 0; ; i++) {
    try {
      await this.page.waitForFunction(() => document.documentElement.dataset.hydrated !== undefined);
      break;
    } catch (e) {
      if (i > 2 || !/context was destroyed|navigat/i.test(String(e))) throw e;
      await this.page.waitForLoadState("networkidle");
    }
  }
  await this.page.waitForTimeout(400); // client fetches after hydration, then settle
  await this.page.waitForLoadState("networkidle");
});

Then("the accessibility check finds no WCAG 2.2 A or AA problems", async function (this: W) {
  // A late client-side URL replace (filters, ?night=) can reload the frame mid-scan: settle, scan again.
  const scan = async () => {
    for (let i = 0; ; i++) {
      try {
        return [await new AxeBuilder({ page: this.page }).withTags(TAGS).analyze(), await new AxeBuilder({ page: this.page }).withRules(STRUCTURE).analyze()];
      } catch (e) {
        if (i > 2 || !/context was destroyed|navigat/i.test(String(e))) throw e;
        await this.page.waitForLoadState("networkidle");
      }
    }
  };
  const [wcag, structure] = await scan();
  const v = [...wcag.violations, ...structure.violations];
  const h1s = await this.page.locator("h1").filter({ visible: true }).count();
  if (h1s > 1) v.push({ id: "single-h1", impact: "moderate", help: `${h1s} visible h1 elements`, nodes: [] } as never);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    const name = `${new URL(this.page.url()).pathname.replace(/\W+/g, "_")}${new URL(this.page.url()).search.replace(/\W+/g, "_")}-${this.theme}-${this.page.viewportSize()!.width}`;
    writeFileSync(`${OUT}/${name}.json`, JSON.stringify(v.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 200), summary: n.failureSummary })) })), null, 1));
  }
  const report = v
    .map((x) => `${x.id} (${x.impact}, ${x.nodes.length}): ${x.help}\n${x.nodes.slice(0, 4).map((n) => `    ${n.target.join(" ")}\n      ${(n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim()}`).join("\n")}`)
    .join("\n  ");
  assert.equal(v.length, 0, `${this.page.url()} [${this.theme}, ${this.page.viewportSize()!.width}px]\n  ${report}`);
});

// 1.4.10 Reflow: at 320 px nothing scrolls sideways; on failure, name the widest offenders.
Then("the page reflows without sideways scrolling", async function (this: W) {
  const res = await this.page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const vw = window.innerWidth + 1;
    const sticks = (el: HTMLElement) => {
      if (el.getBoundingClientRect().right <= vw || !el.getClientRects().length) return false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return a.getBoundingClientRect().right > vw;
      return true;
    };
    const all = [...document.querySelectorAll<HTMLElement>("body *")].filter(sticks);
    const wide = all
      .filter((el) => !all.includes(el.parentElement!))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 8).join(".")} w=${Math.round(el.getBoundingClientRect().width)} right=${Math.round(el.getBoundingClientRect().right)} "${(el.innerText || "").slice(0, 40).replace(/\s+/g, " ")}"`);
    return { over, wide };
  });
  assert.ok(res.over <= 1, `the page scrolls sideways by ${res.over} px at ${this.page.url()}\n  ${res.wide.join("\n  ")}`);
});
