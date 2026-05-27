import type { DatasetSeriesVectorSearchHit } from "@/lib/aiSearch/types";

export function sortDatasetHitsByDistance(
  hits: DatasetSeriesVectorSearchHit[],
): DatasetSeriesVectorSearchHit[] {
  return [...hits].sort((a, b) => {
    const da = a.distance ?? Number.POSITIVE_INFINITY;
    const db = b.distance ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.series.id.localeCompare(b.series.id);
  });
}
