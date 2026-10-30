// One browser for the run, a fresh context (own localStorage) per scenario.
import { After, AfterAll, Before, BeforeAll, setDefaultTimeout, setWorldConstructor, Status, World, type IWorldOptions } from "@cucumber/cucumber";
import type { Browser, BrowserContext, Page } from "playwright-core";

import { browser as launch } from "../../stories/_browser.ts";
import { appReady, BASE, fanData, LLM, startHarness, stopHarness } from "./harness.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";

setDefaultTimeout(LLM ? 600_000 : 120_000);

let browser: Browser;

export class TourboWorld extends World {
  context!: BrowserContext;
  page!: Page;
  consoleErrors: string[] = [];
  kind: PerformerKind = "musician";
  artist = "";
  runId = "";
  mcp?: Awaited<ReturnType<typeof import("../../stories/_mcp.ts").mcp>>;
  last: any; // last tool result (assistant scenarios)
  projectId = "";
  ownerKey = "";
  constructor(options: IWorldOptions) {
    super(options);
  }
  url(path: string) {
    return BASE + path;
  }
  // What the creating browser holds after "Start planning": the plan in "Your work" with its owner key.
  async remember(id: string, ownerKey: string, title: string) {
    if (!this.page.url().startsWith(BASE)) await this.page.goto(this.url("/help"), { waitUntil: "domcontentloaded" });
    await this.page.evaluate(([id, ownerKey, title]) => {
      const list = JSON.parse(localStorage.getItem("tourbo:work") ?? "[]");
      list.unshift({ id, kind: "plan", title, status: "done", ownerKey, updatedAt: new Date().toISOString() });
      localStorage.setItem("tourbo:work", JSON.stringify(list));
    }, [id, ownerKey, title]);
  }
  async open(path: string) {
    await this.page.goto(this.url(path), { waitUntil: "networkidle" }); // hydrated: React handlers attached
  }
}
setWorldConstructor(TourboWorld);

BeforeAll({ timeout: 600_000 }, async function () {
  await startHarness();
  browser = await launch();
});

AfterAll({ timeout: 60_000 }, async function () {
  await browser?.close();
  await stopHarness();
});

// Unbuilt features: tagged @pending in the feature file with the reason in a comment.
Before({ tags: "@pending" }, function () {
  return "pending";
});
// Needs a real AI run (BDD_LLM=1); no-AI scenarios only make sense without the key.
Before({ tags: "@llm" }, function () {
  return LLM ? undefined : "skipped";
});
Before({ tags: "@no-ai" }, function () {
  return LLM ? "skipped" : undefined;
});

Before({ timeout: 120_000 }, async function (this: TourboWorld) {
  await appReady();
  fanData().reset();
  this.context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(LLM ? 120_000 : 45_000);
  this.page.on("console", (m) => {
    if (m.type() === "error") this.consoleErrors.push(`${m.text()} @ ${m.location().url}`);
  });
  this.page.on("pageerror", (e) => this.consoleErrors.push(`pageerror: ${e.message}`));
});

After(async function (this: TourboWorld, { result }) {
  if (result?.status === Status.FAILED && this.page) {
    const png = await this.page.screenshot({ fullPage: false }).catch(() => undefined);
    if (png) this.attach(png, "image/png");
    const text = await this.page.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    this.attach(`url: ${this.page.url()}\n\n${text.slice(0, 2000)}`);
    if (process.env.BDD_DEBUG) console.error(`\n--- ${this.page.url()}\n${text.slice(0, 1500)}`);
  }
  await this.mcp?.close().catch(() => {});
  await this.context?.close();
  fanData().reset();
});
