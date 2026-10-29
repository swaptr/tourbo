import type { TraceEvent } from "../shared/types.ts";

// Engine steps report progress through this; the agent layer persists + streams it.
export type Emit = (
  kind: TraceEvent["kind"],
  message: string,
  data?: Record<string, unknown>,
) => void;

export const noopEmit: Emit = () => {};
