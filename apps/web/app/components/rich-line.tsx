import type { Part } from "@tourbo/core/engine/ideas-rank.ts";
import { cn } from "~/lib/utils";

export type { Part };

// A line of text with proper nouns (acts, cities, places, shows) in bold. Parts come from
// structured data (see `segments()` in @tourbo/core/engine/ideas-rank.ts), never from regex over prose.
export function RichLine({ parts, className }: { parts: Part[]; className?: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) => ("b" in p ? <strong key={i} className={cn("font-semibold text-foreground")}>{p.b}</strong> : <span key={i}>{p.t}</span>))}
    </span>
  );
}
