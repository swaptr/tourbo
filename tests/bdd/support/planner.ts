// No-AI stand-in for the hosted planner agent. With no AI key the app's run fails at the agent
// step by design (story 7); the suite then finishes that same run with the deterministic engine
// (`buildPlan`, the code `tourbo_plan_tour` uses) plus the show-economics model, and writes it
// to the run, so every screen after "Plan" can be checked for every kind of act.
// Money as tourbo_plan_tour (place price nudge included); the ShowMoney mapping mirrors apps/web/server/agent/tools.ts toMoney()/tourPnl() (kept in sync by
// hand: that module pulls in the AI SDK).
import { buildPlan } from "@tourbo/core/engine/plan.ts";
import { defaultCapacity, estimateDemand, legCosts, median, optimise } from "@tourbo/core/engine/economics.ts";
import { roomType } from "@tourbo/core/engine/venues.ts";
import { priceAdjust } from "@tourbo/core/places/hooks.server.ts";
import { candidateCities } from "@tourbo/core/engine/cities.ts";
import { signalIds } from "@tourbo/core/engine/resolve.ts";
import { scoreCities } from "@tourbo/core/engine/score.ts";
import type { PoolRows } from "@tourbo/core/engine/edit.ts";
import type { CityPlan, Plan, ShowMoney, TourParams } from "@tourbo/core/shared/types.ts";

export async function standInPlan(params: TourParams): Promise<Plan> {
  const plan = await buildPlan(params);
  const med = Math.max(median(plan.stops.map((s) => s.fanIndex ?? 0)), 0.1);
  const stops: CityPlan[] = plan.stops.map((s, i) => {
    const demand = estimateDemand({ fanIndex: s.fanIndex ?? 0, medianFanIndex: med, roomMin: params.roomMin, roomMax: params.roomMax });
    const rooms = [s.venue, s.backupVenue].filter((v) => !!v).map((v) => ({ name: v!.name, capacity: defaultCapacity(roomType(v!.tag)) }));
    const rec = optimise({ region: params.region, kind: params.kind, demand, rooms, costs: legCosts(plan.legs[i - 1]?.km ?? 0, 3, !!s.opener), ...priceAdjust(s.place) }); // as tourbo_plan_tour
    const b = rec.best as typeof rec.best & { room?: string };
    const money: ShowMoney = {
      verdict: rec.verdict,
      why: rec.why,
      currency: rec.currency,
      deal: b.scenario.deal,
      price: b.scenario.price,
      capacity: b.scenario.capacity,
      room: b.room,
      guarantee: b.scenario.guarantee,
      tickets: b.tickets,
      sellThrough: b.sellThrough,
      gross: b.gross,
      artistTake: b.artistTake,
      costs: b.costs,
      profit: b.profit,
      breakEvenPrice: b.breakEvenPrice,
      promo: b.scenario.promo,
      sponsor: b.scenario.sponsor,
      relDemand: rec.demand.relDemand,
      draw: rec.demand.draw,
      basis: rec.demand.basis,
      estimate: true,
    };
    return { ...s, money };
  });
  const played = stops.filter((s) => s.money && s.money.verdict !== "skip");
  const sum = (k: "gross" | "artistTake" | "costs" | "profit") => played.reduce((a, s) => a + (s.money?.[k] ?? 0), 0);
  return {
    ...plan,
    stops,
    summary: "Planned by the test stand-in (no AI): the deterministic engine on synthetic fan data.",
    money: { currency: played[0]?.money?.currency ?? "", gross: sum("gross"), artistTake: sum("artistTake"), costs: sum("costs"), profit: sum("profit"), promoBudget: params.money?.promoBudget },
    medianFanIndex: med,
  };
}

// The candidate pool the agent keeps while planning (run_steps "pool" / "cities", tools.ts
// score_cities): the plan workspace offers these cities in "Change city" without new fan-data calls.
export async function standInPool(plan: Plan): Promise<PoolRows> {
  const tags = plan.basis === "styles" ? (plan.artist.styles ?? []).map((t) => t.id) : [];
  const ids = signalIds(plan.artist);
  const scores = await scoreCities(tags.length ? { entities: ids, tags } : ids, candidateCities(plan.params));
  return {
    medianFanIndex: plan.medianFanIndex,
    cities: scores.map((c) => ({ city: c.city.name, lat: c.city.lat, lon: c.city.lon, score: c.score, heatmapCells: c.cells, fanIndex: c.fanIndex, thinData: c.thinData, hotspots: c.hotspots })),
  };
}
