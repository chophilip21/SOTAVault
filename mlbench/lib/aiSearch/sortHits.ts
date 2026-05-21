import type { VectorSearchHit } from "@/lib/aiSearch/types";

export function sortHitsByDistance(hits: VectorSearchHit[]): VectorSearchHit[] {
  return [...hits].sort((a, b) => {
    const da = a.distance ?? Number.POSITIVE_INFINITY;
    const db = b.distance ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.paper.id.localeCompare(b.paper.id);
  });
}
