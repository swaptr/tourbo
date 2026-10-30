// One error model for the web app and the MCP server: a kind, one plain sentence, and whether a
// retry can help. Pure constants (client-safe); the classifiers live in web and mcp.

export const ERROR_KINDS = ["data_limit", "ai_limit", "data_busy", "ai_busy", "ai_off", "data_off", "db_down", "not_found", "bad_input", "forbidden", "unknown"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];
export type Classified = { kind: ErrorKind; message: string; retry: boolean };

export const AI_LIMIT = "AI provider limit reached.";
export const DATA_LIMIT = "Data provider limit reached.";

// Default sentence per kind (vendor-neutral). Callers may swap in a more specific one of the same kind.
export const ERROR_TEXT: Record<ErrorKind, string> = {
  data_limit: DATA_LIMIT,
  ai_limit: AI_LIMIT,
  data_busy: "Fan data is busy right now. Try again in a minute.",
  ai_busy: "Your AI assistant is busy right now. Try again in a minute.",
  ai_off: "The AI assistant isn't set up on this server. Ask whoever runs this Tourbo to add the AI key.",
  data_off: "Fan data isn't set up on this server. Ask whoever runs this Tourbo to add the fan-data key.",
  db_down: "The database is unreachable. Restart the app and try again.",
  not_found: "That isn't here any more. It may have been deleted.",
  bad_input: "Something in the request isn't right. Check it and try again.",
  forbidden: "Only the browser that made this can change or delete it. Open it from that browser, or import your work there.",
  unknown: "Something went wrong. Try again in a moment.",
};

// Retry only helps when the cause is transient.
export const RETRYABLE: Record<ErrorKind, boolean> = {
  data_limit: false,
  ai_limit: false,
  data_busy: true,
  ai_busy: true,
  ai_off: false,
  data_off: false,
  db_down: true,
  not_found: false,
  bad_input: false,
  forbidden: false,
  unknown: true,
};

export const isErrorKind = (v: unknown): v is ErrorKind => typeof v === "string" && (ERROR_KINDS as readonly string[]).includes(v);

// A message that is one of the two limit sentences (or starts with one, e.g. the MCP variant).
export function limitKindOf(message: string | undefined): "data_limit" | "ai_limit" | undefined {
  if (!message) return undefined;
  if (message.startsWith(DATA_LIMIT.slice(0, -1))) return "data_limit";
  if (message.startsWith(AI_LIMIT.slice(0, -1))) return "ai_limit";
  return undefined;
}
