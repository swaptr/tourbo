import type { PerformerKind } from "@tourbo/core/shared/types.ts";
import type { LocalProfile } from "~/lib/profile";

// The act profile as hidden fields for the /new action (tour or show): who, which kind, and the
// profile's owner key so the new work is filed under it.
export function ProfileInputs({
  profile,
  kind,
}: {
  profile: LocalProfile;
  kind: PerformerKind;
}) {
  const listed = profile.listed !== false;
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="artist" value={profile.name ?? ""} />
      <input type="hidden" name="profile" value={profile.id ?? ""} />
      <input type="hidden" name="profileKey" value={profile.ownerKey ?? ""} />
      <input
        type="hidden"
        name="peers"
        value={
          listed || profile.basis !== "peers"
            ? ""
            : profile.peers.map((p) => p.name.replace(/,/g, " ")).join(",")
        }
      />
      <input
        type="hidden"
        name="styles"
        value={
          listed && profile.basis !== "styles"
            ? ""
            : profile.styles.map((t) => t.id).join(",")
        }
      />
      <input
        type="hidden"
        name="basis"
        value={listed ? "" : (profile.basis ?? "city")}
      />
      <input type="hidden" name="notInQloo" value={String(!listed)} />
    </>
  );
}
