// Tour plan as clean markdown (paste into Notion, Asana, a doc). Pure; projects reuse
// projectMarkdown from core.
import type { Plan } from "@tourbo/core/shared/types.ts";

const money = (n: number | undefined, currency: string) => (n === undefined ? "" : `${currency} ${Math.round(n).toLocaleString("en-US")}`);
const cell = (s: string | undefined) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function planMarkdown(plan: Plan, opts: { url?: string; status?: string } = {}): string {
  const p = plan.params;
  const lines = [`# ${plan.artist.name}: ${plan.stops.length}-night tour`];
  lines.push(`Kind: ${plan.artist.kind.replace("_", " ")} · Region: ${p.region} · From ${p.startDate} · ${plan.totalKm} km total`);
  if (opts.status && opts.status !== "done") lines.push(`Status: ${opts.status}`);
  if (opts.url) lines.push(`Plan: ${opts.url}`);
  if (plan.summary) lines.push("", plan.summary);
  lines.push("", "## Nights", "", "| # | Date | City | Venue | Opener | Verdict | Profit (estimate) |", "|---|---|---|---|---|---|---|");
  plan.stops.forEach((s, i) => {
    const m = s.money;
    lines.push(`| ${i + 1} | ${s.date ?? ""} | ${cell(s.city.name)} | ${cell(s.venue?.name)} | ${cell(s.opener?.name)} | ${m?.verdict ?? ""} | ${m ? money(m.profit, m.currency) : ""} |`);
  });
  if (plan.money) {
    const t = plan.money;
    lines.push("", "## Money (estimate)", `- Gross: ${money(t.gross, t.currency)}`, `- Your take: ${money(t.artistTake, t.currency)}`, `- Costs: ${money(t.costs, t.currency)}`, `- Profit: ${money(t.profit, t.currency)}`);
  }
  if (plan.legs.length) {
    lines.push("", "## Route");
    for (const l of plan.legs) lines.push(`- ${l.from} → ${l.to}: ${l.km} km`);
  }
  const notes = plan.stops.filter((s) => s.angle || s.fit || s.venue?.address);
  if (notes.length) {
    lines.push("", "## Notes per night");
    for (const s of notes) {
      lines.push("", `### ${s.city.name}${s.date ? ` (${s.date})` : ""}`);
      if (s.venue?.address) lines.push(`- Address: ${s.venue.address}`);
      if (s.backupVenue) lines.push(`- Backup room: ${s.backupVenue.name}`);
      if (s.fit) lines.push(`- Why this room: ${s.fit}`);
      if (s.angle) lines.push(`- Promo angle: ${s.angle}`);
      if (s.money?.why) lines.push(`- Money: ${s.money.why}`);
    }
  }
  lines.push("", "_Money figures are estimates._");
  return lines.join("\n");
}
