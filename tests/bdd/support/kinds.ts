// What the registry promises per kind of act; the steps check the screens against it.
import { DISCIPLINES } from "@tourbo/core/disciplines/index.ts";
import { CATEGORY_LABEL } from "@tourbo/core/engine/ideas-rank.ts";
import { ideaPlan } from "@tourbo/core/engine/ideas.ts";
import { localBudget } from "@tourbo/core/context/budget.ts";
import { defaultSlot } from "@tourbo/core/context/slots.ts";
import type { PerformerKind } from "@tourbo/core/shared/types.ts";

export const KINDS = Object.keys(DISCIPLINES) as PerformerKind[];

export function kindOf(key: string): PerformerKind {
  if (!(key in DISCIPLINES)) throw new Error(`Unknown kind of act "${key}" (registry has ${KINDS.join(", ")})`);
  return key as PerformerKind;
}
export const labelOf = (kind: PerformerKind) => DISCIPLINES[kind].label;
export const setOrder = (kind: PerformerKind) => DISCIPLINES[kind].setOrder;
export const ideaLabels = (kind: PerformerKind) => ideaPlan(kind).map((s) => CATEGORY_LABEL[s.category]);
// Local touches allowed in the default slot at the default flavour ("a touch"). Same inputs as
// engine/set.ts: a local item lasts 4 min where the act plays covers (artist peers), else 2.
export const defaultBudget = (kind: PerformerKind) => localBudget(defaultSlot(kind), "touch", DISCIPLINES[kind].peerType === "urn:entity:artist" ? 4 : 2).max;
