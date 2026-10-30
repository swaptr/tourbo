import { shortDate } from "~/lib/tour-tabs";
import { Suspense } from "react";
import { Await, Link, useRevalidator } from "react-router";

import { AudienceBars } from "~/components/charts/audience-bars";
import { DivergingBars, Key, RankedBars } from "~/components/charts/bars";
import { ChartCard, ChartEmpty, ChartSkeleton } from "~/components/charts/chart-card";
import { FanMoneyMap } from "~/components/charts/fan-money-map";
import { Meter } from "~/components/charts/figures";
import { PaceChart } from "~/components/charts/pace-chart";
import { Insight } from "~/components/insight";
import { keepOnViewChange } from "~/lib/plan-nav";
import { ErrorLine } from "~/components/state";
import { audienceOf, fansByCity, mapTakeaway, funnel, legs, money, moneyByNight, num, pace, signed, takings, type Checkin } from "~/lib/analytics";
import { db } from "@tourbo/core/db/client.server.ts";
import { takeawayItem } from "@tourbo/core/engine/explain-facts.ts";
import type { Outreach, Plan } from "@tourbo/core/shared/types.ts";
import { getRun } from "../../server/agent/runs.server";
import { logError } from "../../server/agent/errors";
import { listOutreach } from "../../server/outreach/outreach.server";
import { nightOf } from "../../server/agent/edits.server";
import type { Route } from "./+types/plan.$id.insights";

const UUID = /^[0-9a-f-]{36}$/i;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: loaderData ? `${loaderData.artistName} numbers — Tourbo` : "Tourbo" }];
}

// Check-ins follow their night by stable key (PLAN Q19: nights move, swap, drop); rows made before
// any edit have no key and keep their night number. A changed night's old check-ins are not shown.
async function checkinsOf(runId: string, plan: Plan | null | undefined): Promise<Checkin[]> {
  const sql = await db();
  const rows = await sql<{ stop_index: number; stop_key: string | null; sold: number; created_at: Date }[]>`
    select stop_index, stop_key, sold, created_at from checkins where run_id = ${runId} order by created_at`;
  const night = nightOf(plan);
  return rows.flatMap((r) => {
    const i = night(r);
    return i >= 0 ? [{ stopIndex: i, sold: r.sold, at: r.created_at.toISOString() }] : [];
  });
}

// The plan arrives with the page; emails and ticket check-ins stream in after (skeletons meanwhile).
// A DB hiccup on either shows that card's plain error, never a broken page.
export async function loader({ params }: Route.LoaderArgs) {
  const run = UUID.test(params.id) ? await getRun(params.id) : undefined;
  if (!run) throw new Response("Not found", { status: 404 });
  return {
    id: run.id,
    artistName: run.plan?.artist.name ?? run.artistName,
    status: run.status,
    plan: run.plan as Plan | null,
    outreach: listOutreach(run.id).then((rows) => rows.map((o) => ({ status: o.status, city: o.city })) as Pick<Outreach, "status" | "city">[]).catch((e) => (logError("insights emails", e), null)),
    checkins: checkinsOf(run.id, run.plan).catch((e) => (logError("insights checkins", e), null)),
  };
}

const T = {
  map: "Where are your fans, and which nights pay?",
  fans: "Where are your fans strongest?",
  money: "Which nights make money?",
  costs: "How much of what you take goes on costs?",
  drives: "How far is each drive?",
  pace: "Are ticket sales on pace?",
  emails: "How are the venue emails going?",
  audience: "Who are your fans?",
};

export const shouldRevalidate = keepOnViewChange;

export default function Insights({ loaderData }: Route.ComponentProps) {
  const { id, artistName, plan, status } = loaderData;
  const live = status === "pending" || status === "running";
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-lg tracking-tight">Numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your tour at a glance. Money figures are estimates.</p>
      </div>
      {!plan?.stops.length ? (
        <ChartEmpty title="Nothing to chart yet">
          {live ? "The plan is still being made. Charts appear when it's done." : "This plan has no nights to chart."}{" "}
          <Link to={`/plan/${id}`} className="underline underline-offset-4">
            Back to the tour
          </Link>
        </ChartEmpty>
      ) : (
        <Charts plan={plan} id={id} outreach={loaderData.outreach} checkins={loaderData.checkins} />
      )}
    </div>
  );
}

function Charts({ plan, id, outreach, checkins }: { plan: Plan; id: string; outreach: Promise<Pick<Outreach, "status" | "city">[] | null>; checkins: Promise<Checkin[] | null> }) {
  const fans = fansByCity(plan);
  const nights = moneyByNight(plan);
  const take = takings(plan);
  const route = legs(plan);
  const audience = audienceOf(plan);
  const cur = nights.currency;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 @xl:grid-cols-2">
        <ChartCard
          className="@xl:col-span-2"
          title={T.map}
          takeaway={mapTakeaway(plan)}
          rows={plan.stops.map((s) => [s.city.name, `fans ${Math.round(s.score)} · ${s.money ? (s.money.verdict === "skip" ? "dropped" : signed(s.money.profit, s.money.currency)) : "no estimate"}`])}
          note="Fan strength 0–100 across the tour's candidate cities (fan data)."
          testId="chart-map"
        >
          <FanMoneyMap stops={plan.stops} />
        </ChartCard>

        <ChartCard
          title={T.fans}
          takeaway={fans.takeaway}
          rows={fans.bars.map((b) => [b.city, `${b.score}${b.fanIndex !== undefined ? ` · fan index ${Math.round(b.fanIndex)}` : ""}${b.thin ? " · thin data" : ""}`])}
          note="Fan strength 0–100 (fan data); dropped nights in grey."
          testId="chart-fans"
          insight={<Insight runId={id} item={takeawayItem({ id: "chart:fans", title: T.fans, series: fans.bars.filter((b) => !b.dropped).map((b) => ({ label: b.city, value: b.score })), unit: "score", measure: "fan strength" })} />}
        >
          <RankedBars
            max={100}
            testId="fans-bars"
            bars={fans.bars.map((b) => ({ label: b.city, value: b.score, display: String(b.score), color: `var(--score-${Math.min(4, Math.max(1, Math.floor(b.score / 25) + 1))})`, dim: b.dropped, sub: b.dropped ? "dropped" : b.thin ? "little fan data" : undefined, tip: `${b.city}: fan strength (fan data)` }))}
          />
        </ChartCard>

        {nights.bars.length ? (
          <ChartCard
            title={T.money}
            takeaway={nights.takeaway}
            rows={[...nights.bars.map((b): [string, string] => [b.city, b.dropped ? `${signed(b.profit, cur)} (dropped)` : signed(b.profit, cur)]), ["Tour total", signed(nights.total, cur)]]}
            note="Your take after the venue's share, minus travel, rooms and promo. Estimates."
            testId="chart-money"
            insight={<Insight runId={id} item={takeawayItem({ id: "chart:money", title: T.money, series: nights.bars.filter((b) => !b.dropped).map((b) => ({ label: b.city, value: b.profit })), unit: "money", currency: cur, measure: "profit" })} />}
          >
            <DivergingBars
              testId="money-bars"
              bars={nights.bars.map((b) => ({ label: b.city, sub: b.date, value: b.profit, display: signed(b.profit, cur), dim: b.dropped, tip: `${b.city}: ${b.profit >= 0 ? "profit" : "loss"}${b.dropped ? " (dropped)" : ""}` }))}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="flex gap-3">
                <Key color="var(--viz-2)" label="Makes money" />
                <Key color="var(--viz-1)" label="Loses money" />
              </span>
              <span className="text-sm">
                Tour total <span className="num font-semibold">{signed(nights.total, cur)}</span>
              </span>
            </div>
          </ChartCard>
        ) : (
          <ChartEmpty title={T.money}>This plan has no money estimate. Plan again to get one.</ChartEmpty>
        )}

        {take ? (
          <ChartCard
            title={T.costs}
            takeaway={take.takeaway}
            rows={[
              ["You take (all nights)", money(take.take, take.currency)],
              ...(take.sponsor ? ([["of which sponsors", money(take.sponsor, take.currency)]] as [string, string][]) : []),
              ["Costs", money(take.costs, take.currency)],
              ["You keep", signed(take.take - take.costs, take.currency)],
              ["Tickets", num(take.tickets)],
            ]}
            note="Nights you play only. Estimates."
            testId="chart-costs"
          >
            <Meter
              share={take.share}
              label={take.takeaway}
              fillLabel={money(take.costs, take.currency)}
              restLabel={money(Math.max(0, take.take - take.costs), take.currency)}
            />
          </ChartCard>
        ) : (
          <ChartEmpty title={T.costs}>No money estimate for these nights yet.</ChartEmpty>
        )}

        {route.bars.length ? (
          <ChartCard
            title={T.drives}
            takeaway={route.takeaway}
            rows={route.bars.map((b) => [`${b.from} → ${b.to}`, `${num(b.km)} km${b.days !== undefined ? ` · ${b.days} ${b.days === 1 ? "day" : "days"}` : ""}`])}
            note="Distance between cities on the planned route."
            testId="chart-drives"
            insight={<Insight runId={id} why={false} item={takeawayItem({ id: "chart:drives", title: T.drives, series: route.bars.map((b) => ({ label: `${b.from} → ${b.to}`, value: b.km })), unit: "km", measure: "distance" })} />}
          >
            <RankedBars
              testId="drive-bars"
              bars={route.bars.map((b) => ({
                label: `${b.from} → ${b.to}`,
                sub: b.days !== undefined ? `${b.days} ${b.days === 1 ? "day" : "days"} to get there` : undefined,
                value: b.km,
                display: `${num(b.km)} km`,
                color: b.longest ? "var(--viz-2)" : "color-mix(in oklab, var(--viz-2) 40%, var(--card))",
                tip: `${b.from} → ${b.to}${b.longest ? " (longest)" : ""}`,
              }))}
            />
          </ChartCard>
        ) : (
          <ChartEmpty title={T.drives}>One city, no drives.</ChartEmpty>
        )}

        <Suspense fallback={<ChartSkeleton title={T.emails} />}>
          <Await resolve={outreach}>{(rows) => <EmailsChart rows={rows} id={id} />}</Await>
        </Suspense>

        <Suspense fallback={<ChartSkeleton title={T.pace} rows={3} />}>
          <Await resolve={checkins}>{(rows) => <PaceCard plan={plan} rows={rows} id={id} />}</Await>
        </Suspense>

        {audience && (
          <ChartCard title={T.audience} takeaway={audience.why[0]} rows={audience.why.map((w, i) => [i ? "City" : "Fans", w])} testId="chart-audience" className="md:col-span-2">
            <div className="grid gap-6 @xl:grid-cols-2">
              {audience.act && <AudienceBars side={audience.act} title="Your fans" />}
              {audience.city && <AudienceBars side={audience.city} title="The city" />}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

function EmailsChart({ rows, id }: { rows: Pick<Outreach, "status" | "city">[] | null; id: string }) {
  const revalidator = useRevalidator();
  if (!rows) return <ChartEmpty title={T.emails}><ErrorLine message="Couldn't load the venue emails." retry busy={revalidator.state !== "idle"} onRetry={() => void revalidator.revalidate()} /></ChartEmpty>;
  if (!rows.length)
    return (
      <ChartEmpty title={T.emails}>
        No venue emails yet.{" "}
        <Link to={`/plan/${id}/pipeline`} className="underline underline-offset-4">
          Write them on Venue emails
        </Link>
      </ChartEmpty>
    );
  const f = funnel(rows);
  const steps = ["var(--viz-o1)", "var(--viz-o2)", "var(--viz-o3)", "var(--viz-o4)"];
  return (
    <ChartCard title={T.emails} takeaway={f.takeaway} rows={[...f.stages.map((s): [string, string] => [s.label, String(s.count)]), ["Said no", String(f.passed)]]} note="Each stage counts venues that got at least that far." testId="chart-emails">
      <RankedBars testId="funnel-bars" max={f.stages[0].count} bars={f.stages.map((s, i) => ({ label: s.label, value: s.count, display: String(s.count), color: steps[i], tip: `${s.label}: venues`}))} />
    </ChartCard>
  );
}

function PaceCard({ plan, rows, id }: { plan: Plan; rows: Checkin[] | null; id: string }) {
  const revalidator = useRevalidator();
  if (!rows) return <ChartEmpty title={T.pace}><ErrorLine message="Couldn't load ticket check-ins." retry busy={revalidator.state !== "idle"} onRetry={() => void revalidator.revalidate()} /></ChartEmpty>;
  const p = pace(plan, rows);
  if (!p.shows.length)
    return (
      <ChartEmpty title={T.pace}>
        No ticket numbers yet.{" "}
        <Link to={`/plan/${id}/live`} className="underline underline-offset-4">
          Log tickets sold on Ticket sales
        </Link>
      </ChartEmpty>
    );
  return (
    <ChartCard
      title={T.pace}
      takeaway={p.takeaway}
      rows={p.shows.map((s) => [s.city, `${num(s.last)} sold · plan ${num(s.expectedNow)} by now · ${s.status}`])}
      note="Rule of thumb: half of small-show tickets sell in the last 10 days."
      testId="chart-pace"
    >
      <div className="space-y-5">
        {p.shows.map((s) => (
          <div key={s.stopIndex}>
            <p className="mb-1 text-sm">
              <span className="font-medium">{s.city}</span> <span className="text-muted-foreground">· {shortDate(s.date, true)} · {s.status}</span>
            </p>
            <PaceChart show={s} />
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
