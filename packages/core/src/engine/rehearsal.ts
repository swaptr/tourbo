import type { Reference } from "../shared/types.ts";
import { normalizeRef, type CityBrief } from "./brief.ts";

// Rehearsal panel: simulated audience members, each a small slice of one city's Qloo brief.
// No LLM here. The web agent (or the caller's own Claude through MCP) role-plays each persona
// against a draft set; a reaction only counts if it cites something from that persona's slice.
// It's a rehearsal, not a prediction.

export type Persona = { id: string; name: string; who: string; slice: Reference[] };

export type Reaction = { item: number; reaction: "loves" | "meh" | "misfire"; why: string; refs: string[] };

const take = (list: Reference[], n: number) => list.filter((r) => r.name).slice(0, n);

export function personas(brief: CityBrief, city = brief.city): Persona[] {
  const all: Persona[] = [
    {
      id: "superfan",
      name: "The superfan",
      who: `Came for the act. Loves what the act's fans love most, travels across ${city} for shows.`,
      slice: [...take(brief.fanTaste, 4), ...take(brief.fanTags, 2)],
    },
    {
      id: "scene",
      name: "The scene regular",
      who: `Goes out in ${city} every week; knows the local acts and the spots this crowd hangs out in.`,
      slice: [...take(brief.localArtists, 4), ...take(brief.localSpots, 2)],
    },
    {
      id: "local",
      name: "The born-and-raised local",
      who: `Grew up in ${city}. Proud of what the city watches, follows and buys; came with a friend.`,
      slice: take(brief.cityCulture, 6),
    },
    {
      id: "plus-one",
      name: "The plus-one",
      who: `Doesn't know the act. Lives near the venue, shops at the brands this crowd likes, judges in the first five minutes.`,
      slice: [...take(brief.sponsors, 3), ...take(brief.localSpots.slice(2), 2)],
    },
  ];
  return all.filter((p) => p.slice.length >= 2);
}

// Deterministic grounding: drop reactions that cite nothing, or cite names outside this
// persona's slice, or point at an item that doesn't exist.
export function groundReactions(reactions: Reaction[], persona: Persona, itemCount: number): { kept: Reaction[]; dropped: number } {
  const known = new Set(persona.slice.map((r) => normalizeRef(r.name)));
  const kept = reactions.filter(
    (r) => Number.isInteger(r.item) && r.item >= 0 && r.item < itemCount && r.refs.length > 0 && r.refs.every((ref) => known.has(normalizeRef(ref))),
  );
  return { kept, dropped: reactions.length - kept.length };
}

// Per item: how many personas loved / shrugged / winced.
export function tally(results: { persona: Persona; reactions: Reaction[] }[], itemCount: number) {
  return Array.from({ length: itemCount }, (_, item) => {
    const hits = results.flatMap((r) => r.reactions.filter((x) => x.item === item).map((x) => ({ persona: r.persona.name, ...x })));
    return {
      item,
      loves: hits.filter((h) => h.reaction === "loves").length,
      meh: hits.filter((h) => h.reaction === "meh").length,
      misfire: hits.filter((h) => h.reaction === "misfire").length,
      hits,
    };
  });
}

// Plain-text instructions for an external Claude role-playing the panel (MCP has no inference).
export const ROLEPLAY_INSTRUCTIONS =
  "Role-play each persona in turn against the draft set. For every set item a persona reacts to, give reaction loves | meh | misfire, one sentence why, and refs: exact names from THAT persona's slice that explain the reaction. Drop any reaction you can't tie to the slice. Label the result a rehearsal with simulated fans from Qloo data, not a prediction.";
