/** Strip ``(ours)`` and trailing ``+Ours``; bare ``ours`` becomes ``base model``. */
const OURS_IN_PARENS_RE = /\s*\(\s*ours\s*\)\s*/gi;
const OURS_PLUS_SUFFIX_RE = /\s*\+\s*ours\s*$/i;

export function formatLeaderboardModelVariant(
  raw: string | null | undefined,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let label = trimmed
    .replace(OURS_IN_PARENS_RE, " ")
    .replace(OURS_PLUS_SUFFIX_RE, "+")
    .replace(/\s+/g, " ")
    .trim();
  if (!label || /^ours$/i.test(label) || label === "+") {
    return "base model";
  }
  return label;
}
