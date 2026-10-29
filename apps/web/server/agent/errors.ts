// One plain sentence per failure, with what to do next. Raw messages go to logs/trace data only.
export function friendlyError(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (/anthropic|api[_ ]?key|authentication|401/i.test(m) && !/qloo/i.test(m)) return "The AI planner isn't set up on this server (Anthropic key missing or invalid).";
  if (/artist not found|not in qloo|no .* named/i.test(m)) return "We couldn't find that act on Qloo. Add one to three acts you sound like and try again.";
  if (/ECONNREFUSED|database|postgres|connect/i.test(m)) return "The database is unreachable. If you run this locally, start it with docker compose up -d.";
  if (/qloo|\b429\b|\b5\d\d\b|timeout|timed out|fetch failed|ECONNRESET/i.test(m)) return "Qloo didn't answer in time. Try again in a minute.";
  if (/declined|refusal/i.test(m)) return "The AI declined this request. Try a different act or settings.";
  if (/without finalizing|truncated|max_tokens/i.test(m)) return "The planner stopped before finishing. Retry usually works.";
  return "Something went wrong while planning. Retry, or change the settings.";
}
