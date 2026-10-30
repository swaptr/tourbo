import type { Basis, Plan } from "../shared/types.ts";

// One plain line for the plan page: what the fan signal was built from. Client-safe.
const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const styleName = (s: string) => (s.startsWith("urn:tag:") ? s.split(":").at(-1)!.replace(/_/g, " ") : s);

export function planBasis(plan: Pick<Plan, "artist" | "params"> & { basis?: Basis }): Basis {
  const a = plan.artist as Plan["artist"] & { unknown?: boolean };
  if (plan.basis ?? a.basis ?? plan.params.basis) return (plan.basis ?? a.basis ?? plan.params.basis)!;
  if (plan.params.styles?.length) return "styles";
  // Older plans: an unknown act is anchored on its first peer.
  const unknown = a.unknown ?? (plan.params.notInQloo || (a.peers.length > 0 && a.peers[0].id === a.id));
  return unknown ? "peers" : "act";
}

export function basisLine(plan: Pick<Plan, "artist" | "params"> & { basis?: Basis }): string {
  const a = plan.artist;
  const peers = a.peers.map((p) => p.name).slice(0, 3);
  switch (planBasis(plan)) {
    case "styles": {
      const styles = a.styles?.map((s) => s.name) ?? (plan.params.styles ?? []).map(styleName);
      return styles.length ? `Planned from fans of ${and(styles.slice(0, 3))}` : `Planned from fans of ${and(peers)}`;
    }
    case "city":
      return "Planned from what people in this area like";
    case "peers":
      return peers.length ? `Planned from fans of ${and(peers)}` : "Planned from what people in this area like";
    default:
      return peers.length ? `Planned from your fans and fans of ${and(peers)}` : "Planned from your fans";
  }
}
