import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { WORKER_MODEL } from "../agent/models.ts";
import { recordUsage } from "../agent/usage.ts";
import type { Artist, CityPlan, Venue } from "@tourbo/core/shared/types.ts";

let client: Anthropic | undefined;

const Draft = z.object({ subject: z.string(), body: z.string() });
export type Draft = z.infer<typeof Draft>;

const DRAFT_SYSTEM = `You write booking inquiry emails from a touring artist's team to a venue. Short, specific, professional: the date, the artist, why this city (quote the Qloo fan numbers given), the proposed opener, and a clear ask (hold the date, share the rate card). Use only the facts given. Plain text, no placeholders except the sign-off "Tourbo booking team".`;

export async function draftInquiry(artist: Artist, stop: CityPlan, venue: Venue): Promise<Draft> {
  client ??= new Anthropic();
  const facts = {
    artist: { name: artist.name, genres: artist.tags.map((t) => t.name).slice(0, 4) },
    venue: { name: venue.name, neighborhood: venue.neighborhood, qlooAffinity: venue.affinity, qlooPopularity: venue.popularity },
    city: stop.city.name,
    date: stop.date,
    cityScore: stop.score,
    capacityEstimate: stop.capacity && `${stop.capacity.min}–${stop.capacity.max}`,
    opener: stop.opener?.name,
    angle: stop.angle,
    evidence: stop.evidence.slice(0, 4).map((e) => `${e.claim} (${e.ref}${e.value ? `, ${e.value}` : ""})`),
  };
  const response = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Draft) },
    system: DRAFT_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  recordUsage(WORKER_MODEL, response.usage);
  if (response.parsed_output) return response.parsed_output;
  // Refusal or truncation: a plain template keeps the pipeline moving.
  return {
    subject: `Hold request: ${artist.name}, ${stop.date ?? "date tbd"}`,
    body: `Hi ${venue.name} team,\n\nWe're routing ${artist.name} through ${stop.city.name} on ${stop.date ?? "a date to be confirmed"} and would love to hold your room. Could you share availability and your rate card?\n\nTourbo booking team`,
  };
}

const Reply = z.object({
  intent: z.enum(["interested", "hold", "pass"]),
  summary: z.string().describe("one short sentence"),
  offer: z
    .object({
      deal: z.enum(["door_split", "guarantee", "versus", "bar_deal"]),
      price: z.number().nullable().describe("ticket price"),
      capacity: z.number().nullable(),
      guarantee: z.number().nullable(),
      split: z.number().nullable().describe("artist share of net door as 0–1 (70% = 0.7)"),
    })
    .nullable()
    .describe("money terms only if the reply states them; null otherwise"),
});
export type ReplyOffer = NonNullable<z.infer<typeof Reply>["offer"]>;
export type ReplyIntent = z.infer<typeof Reply>["intent"];

const CLASSIFY_SYSTEM = `Classify a venue's reply to a booking inquiry. interested = they want the show or are sending terms; hold = tentative, need more info, or offering a different date; pass = declining or unavailable. Summarize the reply in one short sentence. If the reply states money terms, extract them: deal = guarantee (flat fee), door_split (percentage of door), versus (guarantee vs a percentage, whichever is higher) or bar_deal (free entry, paid from the bar); copy only numbers the reply states.`;

export async function classifyReply(text: string): Promise<z.infer<typeof Reply>> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low", format: zodOutputFormat(Reply) },
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: text.slice(0, 6000) }],
  });
  recordUsage(WORKER_MODEL, response.usage);
  return response.parsed_output ?? { intent: "hold", summary: "Could not classify; review manually.", offer: null };
}

const NEGOTIATE_SYSTEM = `You write a touring act's reply to a venue's money offer, from "Tourbo booking team". You receive the offer, a deterministic assessment (accept / counter / walk_away, with numbers) and the show facts. accept: thank them, confirm the terms and date, ask for the contract. counter: be warm, explain briefly with the fan-demand facts given, propose exactly the counter terms given (deal, guarantee, split, price). walk_away: decline the headline terms politely and offer a support slot or another date. Never change the numbers. Plain text, short.`;

export async function draftNegotiation(facts: Record<string, unknown>): Promise<Draft> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: WORKER_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(Draft) },
    system: NEGOTIATE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  recordUsage(WORKER_MODEL, response.usage);
  if (!response.parsed_output) throw new Error(`negotiation draft failed (${response.stop_reason})`);
  return response.parsed_output;
}
