import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { Baseline, REGION_NAMES, type TourParams } from "@tourbo/core/shared/types.ts";
import { ORCHESTRATOR_MODEL } from "./models.ts";
import { recordUsage } from "./usage.ts";

// Deliberately the plain prompt a user would type into a chatbot: no Qloo data, no tools.
const SYSTEM = "You are a tour planner for musicians and comedians. Plan tours from your own knowledge.";

let client: Anthropic | undefined;

export async function planBaseline(params: TourParams): Promise<Baseline> {
  client ??= new Anthropic();
  const region = REGION_NAMES[params.region];
  const response = await client.messages.parse({
    model: ORCHESTRATOR_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Baseline) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Plan a ${params.shows}-city ${region} ${params.kind === "comedian" ? "stand-up comedy" : "concert"} tour for ${params.artist}, starting ${params.startDate}${
          params.homeBase ? ` from ${params.homeBase}` : ""
        }, in rooms of ${params.roomMin}–${params.roomMax} capacity. For each stop in tour order give the city, a venue, a local opener and why.`,
      },
    ],
  });
  recordUsage(ORCHESTRATOR_MODEL, response.usage);
  if (!response.parsed_output) throw new Error(`Baseline returned no plan (${response.stop_reason})`);
  return response.parsed_output;
}
