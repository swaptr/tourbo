import type { ReactNode } from "react";

import { Hint } from "~/components/hint";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

export type Row = [label: string, value: string];

// One chart = one plain question (title), one-line takeaway, the numbers behind "why?" (the
// table view: every value is readable without hovering), then the chart itself.
export function ChartCard({
  title,
  takeaway,
  rows,
  note,
  insight,
  children,
  className,
  testId,
}: {
  title: string;
  takeaway?: ReactNode;
  rows?: Row[];
  note?: string; // one line under the numbers: where they come from
  insight?: ReactNode; // <Insight> chip (+ AI line when evidence is strong) under the takeaway
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)} data-testid={testId ?? "chart"}>
      <CardHeader className="gap-1">
        <h2 className="font-heading text-xl leading-tight" data-chart-title="">
          {title}
        </h2>
        {takeaway && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground" data-chart-takeaway="">
            <span className="min-w-0">{takeaway}</span>
            {rows && rows.length > 0 && (
              <Hint text="why?" align="end">
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map(([k, v], i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <th scope="row" className="py-1 pr-3 text-left font-normal text-muted-foreground">
                          {k}
                        </th>
                        <td className="num py-1 text-right font-medium">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {note && <p className="mt-2 text-muted-foreground">{note}</p>}
              </Hint>
            )}
          </p>
        )}
        {insight}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Loading: the card's shape, so nothing jumps when the chart lands.
export function ChartSkeleton({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <Card className="min-w-0" role="status" aria-live="polite">
      <CardHeader className="gap-2">
        <h2 className="font-heading text-xl leading-tight text-muted-foreground">{title}</h2>
        <Skeleton className="h-3.5 w-2/3" />
      </CardHeader>
      <CardContent className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 15}%` }} />
        ))}
        <span className="sr-only">Loading…</span>
      </CardContent>
    </Card>
  );
}

// Empty: one plain sentence and what to do next.
export function ChartEmpty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="min-w-0" data-testid="chart-empty">
      <CardHeader className="gap-1">
        <h2 className="font-heading text-xl leading-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </CardHeader>
    </Card>
  );
}
