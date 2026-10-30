import type { Backend, Entry } from "./index.ts";

// Per-process LRU: a Map keeps insertion order, so re-inserting on read moves a key to the end and
// the first key is always the least recently used.
export function memoryBackend(max = 5000): Backend & { size(): number; clear(): void } {
  const map = new Map<string, Entry>();
  const id = (ns: string, key: string) => `${ns}\u0000${key}`;
  return {
    name: "memory",
    async get(ns, key) {
      const k = id(ns, key);
      const hit = map.get(k);
      if (!hit) return undefined;
      map.delete(k);
      map.set(k, hit);
      return hit;
    },
    async set(ns, key, entry) {
      const k = id(ns, key);
      map.delete(k);
      while (map.size >= max) map.delete(map.keys().next().value!);
      map.set(k, entry);
    },
    async delete(ns, key) {
      map.delete(id(ns, key));
    },
    async deleteByTag(tag) {
      for (const [k, e] of map) if (e.tags?.includes(tag)) map.delete(k);
    },
    size: () => map.size,
    clear: () => map.clear(),
  };
}
