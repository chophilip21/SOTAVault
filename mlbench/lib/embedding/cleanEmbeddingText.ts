/** Normalize user query text before embedding (matches legacy TEI path). */
export function cleanEmbeddingText(text: string): string {
  return (text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[`*#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}
