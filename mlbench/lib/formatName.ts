/** Capitalize the first character for display titles (series, datasets, etc.). */
export function capitalizeSeriesName(name: string): string {
  const s = (name || "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
