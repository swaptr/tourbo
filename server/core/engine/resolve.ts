import { searchEntities } from "../qloo/api.server.ts";
import type { Artist } from "../shared/types.ts";

export async function resolveArtist(query: string): Promise<Artist | undefined> {
  const [top] = await searchEntities(query, {
    types: ["urn:entity:artist"],
    take: 1,
  });
  if (!top) return undefined;
  const image = (top.properties?.image as { url?: string } | undefined)?.url;
  const tags = (top.tags ?? [])
    .filter((tag) => tag.type === "urn:tag:genre")
    .flatMap((tag) => {
      const id = tag.tag_id ?? tag.id;
      return id ? [{ id, name: tag.name }] : [];
    });
  return {
    id: top.entity_id,
    name: top.name,
    popularity: top.popularity,
    image,
    tags,
  };
}
