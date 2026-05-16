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

/** Clean metric text from DB: strip trailing source URLs and citation brackets like [2, 13]. */
export function cleanMetricDescription(desc: string): string {
  let s = (desc || "").trim();
  if (!s) return s;

  const sourceRe = /\s*(?:source)\s*:?\s*https?:\/\/\S+\s*$/i;
  while (sourceRe.test(s)) s = s.replace(sourceRe, "").trim();

  const citeRe = /\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]\s*$/;
  while (citeRe.test(s)) s = s.replace(citeRe, "").trim();

  return s.trim();
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
