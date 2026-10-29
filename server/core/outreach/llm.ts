import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { WORKER_MODEL } from "../agent/models.ts";
import { recordUsage } from "../agent/usage.ts";
import type { Artist, CityPlan, Venue } from "../shared/types.ts";

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
});
export type ReplyIntent = z.infer<typeof Reply>["intent"];

const CLASSIFY_SYSTEM = `Classify a venue's reply to a booking inquiry. interested = they want the show or are sending terms; hold = tentative, need more info, or offering a different date; pass = declining or unavailable. Summarize the reply in one short sentence.`;

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
  return response.parsed_output ?? { intent: "hold", summary: "Could not classify; review manually." };
}
