export const DOMAIN_ICONS: Record<string, string> = {
  cv: "/icons/cv.png",
  nlp: "/icons/nlp.png",
  audio: "/icons/audio.png",
  robots: "/icons/robotics.png",
  time_series_tabular: "/icons/timeseries.png",
  graph: "/icons/graph.png",
  multimodal: "/icons/multi.png",
  theory: "/icons/theory.png",
  efficient: "/icons/efficiency.png",
  other: "/icons/others.png",
};

export const DOMAIN_OPTIONS = [
  { value: "", label: "All Domains" },
  { value: "cv", label: "Computer Vision" },
  { value: "nlp", label: "Natural Language Processing" },
  { value: "audio", label: "Audio" },
  { value: "robots", label: "Robotics" },
  { value: "time_series_tabular", label: "Time Series & Tabular" },
  { value: "graph", label: "Graph" },
  { value: "multimodal", label: "Multimodal" },
  { value: "theory", label: "Theory" },
  { value: "efficient", label: "Efficient ML" },
  { value: "other", label: "Other" },
];

export function getDomainIcon(domain?: string): string {
  if (!domain) return "/icons/cv.png";
  return DOMAIN_ICONS[domain] || "/icons/cv.png";
}

export function getDomainLabel(domain?: string): string | null {
  if (!domain) return null;
  const match = DOMAIN_OPTIONS.find((o) => o.value === domain);
  return match?.label ?? domain;
}
