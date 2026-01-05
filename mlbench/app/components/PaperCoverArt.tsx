import Image from "next/image";

type PaperCoverArtProps = {
  seed: string;
  title?: string | null;
  authors?: string[] | null;
  year?: number | string | null;
  className?: string;
  /** Passed to Next/Image for the legacy fallback icon. */
  sizes?: string;
  /** Tooltip/accessibility label. */
  ariaLabel?: string;
};

// Stable, fast string hash (32-bit).
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const PAPER_GRADIENTS = [
  // Intentionally similar spirit to the conference tab (simple, crisp, no SVG edges).
  "from-green-50 to-green-100 text-green-800",
  "from-blue-50 to-blue-100 text-blue-800",
  "from-purple-50 to-purple-100 text-purple-800",
  "from-amber-50 to-amber-100 text-amber-800",
  "from-rose-50 to-rose-100 text-rose-800",
  "from-teal-50 to-teal-100 text-teal-800",
] as const;

function authorMark(authors?: string[] | null): string | null {
  if (!authors || authors.length === 0) return null;
  const first = (authors[0] || "").trim();
  if (!first) return null;

  // Prefer the last token as a “last name”, but keep it robust for single-token names.
  const parts = first.split(/\s+/).filter(Boolean);
  const last = (parts[parts.length - 1] || first).replace(/[,.;:]+$/g, "");
  if (!last) return null;

  // Use a compact label: `Last` or `Last et al.` (kept short so it works at 48px/96px).
  const base = authors.length > 1 ? `${last} et al.` : last;
  return base.length > 18 ? `${base.slice(0, 18)}…` : base;
}

export function PaperCoverArt({
  seed,
  title,
  authors,
  year: _year,
  className,
  sizes,
  ariaLabel,
}: PaperCoverArtProps) {
  const h = hashString(seed || "paper");
  const gradient = PAPER_GRADIENTS[h % PAPER_GRADIENTS.length];
  const mark = authorMark(authors);
  const titleText = ariaLabel || (title ? `Paper cover: ${title}` : "Paper cover");

  // Fallback: if authors are missing (should be rare), show legacy arXiv icon.
  if (!mark) {
    return (
      <div
        className={["relative w-full h-full", className].filter(Boolean).join(" ")}
        aria-label={titleText}
        title={titleText}
        role="img"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100" />
        <Image
          src="/ArXiv_logo_2022.png"
          alt="arXiv"
          fill
          sizes={sizes || "96px"}
          className="object-contain p-2"
        />
      </div>
    );
  }
  return (
    <div
      className={["relative w-full h-full", className].filter(Boolean).join(" ")}
      aria-label={titleText}
      title={titleText}
      role="img"
    >
      {/* Full-bleed background: parent container owns rounding via overflow-hidden */}
      <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}>
        <span className="px-2 text-xs font-semibold tracking-wide text-center leading-tight select-none">
          {mark}
        </span>
      </div>
    </div>
  );
}
