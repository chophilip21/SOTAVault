/** Matches API ``direction`` on datasets.metrics and leaderboards. */
export type MetricDirection =
  | "higher"
  | "lower"
  | "zero_centered"
  | "target_centered"
  | "neutral"
  | "constraint";

/** Short ranking hint from API ``direction`` (not paraphrased into description text). */
export function directionSummary(direction: MetricDirection): string {
  switch (direction) {
    case "lower":
      return "Lower values are favoured.";
    case "zero_centered":
      return "Values closer to zero are favoured.";
    case "target_centered":
      return "Values closer to target are favoured.";
    case "neutral":
      return "Neutral ranking";
    case "constraint":
      return "Constraint metric";
    default:
      return "Higher values are favoured.";
  }
}

export function cleanMetricDescription(desc: string): string {
  let s = (desc || "").trim();
  if (!s) return s;

  const sourceRe = /\s*(?:source)\s*:?\s*https?:\/\/\S+\s*$/i;
  while (sourceRe.test(s)) s = s.replace(sourceRe, "").trim();

  // Strip citations like [2, 5] or [1] from anywhere in the string
  const citeRe = /\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g;
  s = s.replace(citeRe, "");

  // Clean up any double spaces that might be left over (excluding newlines)
  s = s.replace(/[ \t]{2,}/g, " ");

  return s.trim();
}

/**
 * Return true when a leaderboard entry value is plausible given the metric's
 * known ``rangeMax`` and ``direction``.
 *
 * Rules applied in order:
 * 1. Non-finite numbers are always rejected.
 * 2. When ``rangeMax`` is known and positive:
 *    a. ``zero_centered`` direction: check |value| ≤ rangeMax *or* |value| ≤ rangeMax×100
 *       (handles percentage ↔ ratio mismatch that slipped through ingestion).
 *    b. All other directions: value must be ≥ 0 (benchmark scores are non-negative
 *       in the bounded [0, rangeMax] space) and ≤ rangeMax *or* ≤ rangeMax×100.
 * 3. When ``rangeMax`` is unknown (null / invalid):
 *    Fall back to an absolute-magnitude sanity cap: |value| ≤ 1 000 000.
 *    This catches obviously bogus values (e.g. 1e18) while leaving real metrics
 *    like high-perplexity LM scores unconstrained.
 */
export function isPlausibleLeaderboardMetricValue(
  value: number,
  rangeMax: number | null | undefined,
  direction?: MetricDirection,
): boolean {
  if (!Number.isFinite(value)) return false;

  if (rangeMax != null && Number.isFinite(rangeMax) && rangeMax > 0) {
    const unitCap = rangeMax;
    const percentCap = rangeMax * 100;

    if (direction === "zero_centered") {
      const abs = Math.abs(value);
      return abs <= unitCap || abs <= percentCap;
    }

    // For all bounded [0, rangeMax] metrics, negative values are nonsensical.
    if (value < 0) return false;
    return value <= unitCap || value <= percentCap;
  }

  // No rangeMax available — accept anything within a generous absolute cap.
  return Math.abs(value) <= 1_000_000;
}

export function formatMetricSubtitle(
  metricDescription: string | null | undefined,
  direction: MetricDirection,
): string {
  const body = cleanMetricDescription(metricDescription || "");
  const hint = directionSummary(direction);
  if (!body) return hint;
  if (!hint) return body;
  const sep = body.endsWith(".") ? " " : ". ";
  return `${body}${sep}${hint}`;
}
