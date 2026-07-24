import { getDomainLabel } from "@/lib/domain";

/** Deck.gl RGBA color, 0-255 per channel. */
export type RgbaColor = [number, number, number, number];

const DOMAIN_COLOR_HEX: Record<string, string> = {
  cv: "#3B82F6",
  nlp: "#10B981",
  audio: "#F59E0B",
  robots: "#EF4444",
  time_series_tabular: "#06B6D4",
  graph: "#8B5CF6",
  multimodal: "#EC4899",
  theory: "#84CC16",
  efficient: "#F97316",
  other: "#6B7280",
};

const FALLBACK_COLOR_HEX = "#9CA3AF";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

const DOMAIN_COLOR_RGB: Record<string, [number, number, number]> = Object.fromEntries(
  Object.entries(DOMAIN_COLOR_HEX).map(([domain, hex]) => [domain, hexToRgb(hex)]),
);
const FALLBACK_COLOR_RGB = hexToRgb(FALLBACK_COLOR_HEX);

export function getDomainColorHex(domain?: string | null): string {
  if (!domain) return FALLBACK_COLOR_HEX;
  return DOMAIN_COLOR_HEX[domain] || FALLBACK_COLOR_HEX;
}

export function getDomainColorRgb(domain?: string | null, alpha = 255): RgbaColor {
  const [r, g, b] = (domain && DOMAIN_COLOR_RGB[domain]) || FALLBACK_COLOR_RGB;
  return [r, g, b, alpha];
}

export const KNOWN_DOMAINS = Object.keys(DOMAIN_COLOR_HEX);

/** Neutral color for unclustered ("noise") points. */
const CLUSTER_NOISE_RGB: [number, number, number] = [107, 114, 128];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color);
  };
  return [f(0), f(8), f(4)];
}

/**
 * Deterministic, evenly-spaced color for a discovered topic cluster.
 * Hue is rotated by the golden angle so adjacent cluster ids never look alike.
 */
export function getClusterColorRgb(clusterId: number, alpha = 255): RgbaColor {
  if (clusterId < 0) return [...CLUSTER_NOISE_RGB, alpha * 0.5];
  const hue = (clusterId * 137.508) % 360;
  const [r, g, b] = hslToRgb(hue, 0.65, 0.55);
  return [r, g, b, alpha];
}

export function getDomainLegendEntries(): { domain: string; label: string; color: string }[] {
  return KNOWN_DOMAINS.map((domain) => ({
    domain,
    label: getDomainLabel(domain) || domain,
    color: getDomainColorHex(domain),
  }));
}
