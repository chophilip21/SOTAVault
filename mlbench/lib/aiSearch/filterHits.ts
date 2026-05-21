import type { VectorSearchHit } from "@/lib/aiSearch/types";

/** Keep only hits with a known cosine distance at or below the configured maximum. */
export function filterHitsByMaxDistance(
  hits: VectorSearchHit[],
  maxCosineDistance: number,
): VectorSearchHit[] {
  return hits.filter(
    (h) => typeof h.distance === "number" && h.distance <= maxCosineDistance,
  );
}
