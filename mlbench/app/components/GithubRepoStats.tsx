import React from "react";

function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
}

function StarIcon({ className }: { className?: string }) {
  // Octicon-ish star outline
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M8 0.25a.75.75 0 0 1 .673.418l1.83 3.705 4.09.595a.75.75 0 0 1 .416 1.279l-2.96 2.884.699 4.073a.75.75 0 0 1-1.088.791L8 12.347l-3.66 1.923a.75.75 0 0 1-1.088-.79l.699-4.074L.99 6.252a.75.75 0 0 1 .416-1.279l4.09-.595L7.327.668A.75.75 0 0 1 8 .25Zm0 2.44L6.86 5.0a.75.75 0 0 1-.565.41l-2.55.37 1.845 1.799a.75.75 0 0 1 .216.664l-.435 2.53 2.28-1.198a.75.75 0 0 1 .698 0l2.28 1.198-.435-2.53a.75.75 0 0 1 .216-.664l1.845-1.799-2.55-.37A.75.75 0 0 1 9.14 5L8 2.69Z"
      />
    </svg>
  );
}

function ForkIcon({ className }: { className?: string }) {
  // Octicon-ish repo-forked
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M5 3.25a2.25 2.25 0 1 1-1.5-2.12 2.25 2.25 0 0 1 1.5 2.12Zm0 0A2.25 2.25 0 0 0 5 3.25Zm8 0a2.25 2.25 0 1 1-1.5-2.12A2.25 2.25 0 0 1 13 3.25ZM8.75 13.0a2.25 2.25 0 1 1-1.5-2.12A2.25 2.25 0 0 1 8.75 13ZM4.25 5.34a.75.75 0 0 1 .75.75v1.02c0 .62.25 1.21.69 1.65l1.0 1.0c.44.44 1.03.69 1.65.69h.0c.62 0 1.21-.25 1.65-.69l1.0-1.0c.44-.44.69-1.03.69-1.65V6.09a.75.75 0 0 1 1.5 0v1.02c0 1.02-.41 2-1.13 2.72l-1.0 1.0a3.85 3.85 0 0 1-2.72 1.13h-.0a3.85 3.85 0 0 1-2.72-1.13l-1.0-1.0A3.85 3.85 0 0 1 3.5 7.11V6.09a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

export function GithubRepoStats(props: {
  stars?: number | null;
  forks?: number | null;
  status?: "ok" | "pending" | "unreachable" | "invalid";
  className?: string;
}) {
  const status = props.status || "pending";
  const disabled = status !== "ok";
  const label =
    status === "unreachable" ? "Unavailable" : status === "invalid" ? "Invalid" : "Loading…";

  return (
    <span className={props.className}>
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
          disabled
            ? "bg-gray-50 border-gray-200 text-gray-400"
            : "bg-gray-100 border-gray-200 text-gray-700"
        }`}
        title={disabled ? label : "Stars"}
      >
        <StarIcon className="h-3.5 w-3.5" />
        <span className="font-medium">Star</span>
        <span className="ml-1 tabular-nums">
          {disabled ? "—" : formatCount(props.stars)}
        </span>
      </span>

      <span
        className={`ml-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
          disabled
            ? "bg-gray-50 border-gray-200 text-gray-400"
            : "bg-gray-100 border-gray-200 text-gray-700"
        }`}
        title={disabled ? label : "Forks"}
      >
        <ForkIcon className="h-3.5 w-3.5" />
        <span className="font-medium">Fork</span>
        <span className="ml-1 tabular-nums">
          {disabled ? "—" : formatCount(props.forks)}
        </span>
      </span>
    </span>
  );
}

