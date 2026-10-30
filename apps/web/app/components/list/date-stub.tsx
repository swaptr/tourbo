// A show's date as a little ticket stub: month on top, the day big, a perforated right edge.
// Multi-day shows add the last day ("1–3"); no date yet shows a dash.
export function DateStub({ start, end }: { start?: string; end?: string }) {
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const month = start ? d(start).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) : "Date";
  const day = start ? d(start).getUTCDate() : undefined;
  const last = end && end !== start ? d(end) : undefined;
  const span = last ? (last.getUTCMonth() === d(start!).getUTCMonth() ? `–${last.getUTCDate()}` : "+") : "";
  return (
    <span className="relative flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-foreground/30 bg-card leading-none" aria-hidden data-testid="date-stub">
      <span className="text-xs font-semibold tracking-wide text-foreground/70 uppercase">{month}</span>
      <span className="num mt-0.5 font-heading text-lg">{day ?? "–"}<span className="font-sans text-xs">{span}</span></span>
    </span>
  );
}
