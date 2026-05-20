/** Remove HTML tags/entities from paper titles (e.g. PWC span markers). */
export function stripHtmlTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripWrappingQuotes(s: string): string {
  const t = (s || "").trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

/** Normalize a paper title from the API for display. */
export function cleanPaperTitle(raw: string | null | undefined): string {
  return stripWrappingQuotes(stripHtmlTags(raw ?? ""));
}
