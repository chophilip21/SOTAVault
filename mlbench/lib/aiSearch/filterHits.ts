type HitWithDistance = { distance?: number | null };

/** Keep only hits with a known cosine distance at or below the configured maximum. */
export function filterHitsByMaxDistance<T extends HitWithDistance>(
  hits: T[],
  maxCosineDistance: number,
): T[] {
  return hits.filter(
    (h) => typeof h.distance === "number" && h.distance <= maxCosineDistance,
  );
}
