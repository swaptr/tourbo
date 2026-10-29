// Ticket pace: is a show on track, and what to do about it. Deterministic so the advice
// never rests on the model's arithmetic. The sales curve is a rule of thumb for small
// shows (half the tickets sell in the last ~10 days), labelled as such.

export type PaceInput = {
  expectedTickets: number; // the plan's estimate for show night
  capacity: number;
  sold: number;
  daysToShow: number;
  promoLeft?: number; // unspent promo for this city
  hasSmallerRoom?: boolean; // a smaller backup room exists
  currency?: string;
};

export type Pace = {
  status: "ahead" | "on track" | "behind" | "well behind";
  expectedByNow: number;
  projected: number; // show-night estimate at the current pace
  ratio: number;
  actions: string[];
  basis: string;
};

// Share of final sales sold `d` days before the show.
export const soldShare = (d: number) => 1 / (1 + Math.max(0, d) / 10);

export function ticketPace(p: PaceInput): Pace {
  const share = soldShare(p.daysToShow);
  const expectedByNow = Math.max(1, Math.round(p.expectedTickets * share));
  const ratio = Math.round((p.sold / expectedByNow) * 100) / 100;
  const projected = Math.min(p.capacity, Math.round(p.sold / share));
  const status = ratio >= 1.3 ? "ahead" : ratio >= 0.8 ? "on track" : ratio >= 0.5 ? "behind" : "well behind";
  const actions: string[] = [];
  const money = (n: number) => `${Math.round(n)}${p.currency ? ` ${p.currency}` : ""}`;

  if (status === "ahead") {
    if (projected >= p.capacity * 0.95) actions.push("Likely sell-out: raise the price on the last tier or ask the venue about a second night.");
    else actions.push("Ahead of pace: hold promo spend here and move it to a slower city.");
  }
  if (status === "behind" || status === "well behind") {
    if (p.promoLeft && p.promoLeft > 0) actions.push(`Spend the remaining ${money(p.promoLeft)} promo now on geo-ads in the fan hotspots.`);
    actions.push("Ask the opener to post the show to their local fans; they were picked for local pull.");
    if (status === "well behind" && p.hasSmallerRoom) actions.push("Talk to the backup (smaller) room before the venue's cancellation deadline.");
    if (status === "well behind" && p.daysToShow <= 14) actions.push("Consider moving to a support slot on a bigger local bill instead of headlining.");
  }
  if (status === "on track") actions.push("On track: keep the current plan; check again in a week.");

  return {
    status,
    expectedByNow,
    projected,
    ratio,
    actions,
    basis: `expected by now = plan estimate ${p.expectedTickets} × ${Math.round(share * 100)}% (rule of thumb: half of small-show tickets sell in the last 10 days)`,
  };
}
