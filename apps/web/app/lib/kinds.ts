import { useRouteLoaderData } from "react-router";

import { labelMap, registryKinds, type ActKind } from "@tourbo/core/disciplines/labels.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";

// Kind-of-act display names from the root loader (act_kinds table), registry when absent
// (prerendered `/`, error pages). `kinds` is every kind in display order, enabled or not.
const FALLBACK = registryKinds();

export function useKinds(): ActKind[] {
  const root = useRouteLoaderData("root") as { kinds?: ActKind[] } | undefined;
  return root?.kinds?.length ? root.kinds : FALLBACK;
}

export function useKindLabels(): Record<PerformerKind, string> {
  return labelMap(useKinds());
}
