"use client";

/**
 * Central definitions for Stage-1 routing output.
 *
 * Primary = capability bucket (what the system can do).
 * Secondary = tasks/operations layered on top of the primary (what to do with the result).
 * Constraints = structured parameters extracted from the prompt (count, recency, etc).
 */

export const PRIMARY_CAPABILITIES = [
  "RAG_SEARCH",
  "ML_NO_RAG",
  "FOLLOW_UP",
  "WEBSITE",
  "AMBIGUOUS",
  "UNRELATED",
] as const;

export type PrimaryCapability = (typeof PRIMARY_CAPABILITIES)[number];

export const SECONDARY_TASKS = [
  // RAG-y tasks
  "RETRIEVE",
  "RERANK",
  "SUMMARIZE",
  "CITE",

  // Generic data-ish tasks (mostly for retrieval flows)
  "FILTER_BY_DATE",
  "COUNT",
  "COMPARE",

  // WEBSITE tasks (template-driven help; no internal details)
  "WEBSITE_NAVIGATE",
  "WEBSITE_LOGIN",
  "WEBSITE_PROFILE",
  "WEBSITE_BOOKMARKS",
  "WEBSITE_PAPERS",
  "WEBSITE_BENCHMARK",
  "WEBSITE_CONFERENCE",
  "WEBSITE_AI_CHAT",
  "WEBSITE_DATA_SOURCES",
  "WEBSITE_PRIVACY",
  "WEBSITE_TERMS",
  "WEBSITE_TROUBLESHOOT",
] as const;

export type SecondaryTask = (typeof SECONDARY_TASKS)[number];

export type RecencyConstraint = "recent" | "any";

export type RouteConstraints = {
  count?: number | null; // e.g. "5"
  recency?: RecencyConstraint | null; // e.g. "recent"
  domain?: string | null; // short query/domain phrase extracted from prompt
  year_min?: number | null;
  year_max?: number | null;
};

export type RoutePlan = {
  primary: PrimaryCapability;
  secondary: SecondaryTask[];
  constraints?: RouteConstraints;
};

export function isPrimaryCapability(x: unknown): x is PrimaryCapability {
  return typeof x === "string" && (PRIMARY_CAPABILITIES as readonly string[]).includes(x);
}

export function isSecondaryTask(x: unknown): x is SecondaryTask {
  return typeof x === "string" && (SECONDARY_TASKS as readonly string[]).includes(x);
}

export function buildRoutePlanSchemaJson(): string {
  // Keep this JSON schema small and robust.
  // IMPORTANT: Avoid union types like `type: ["object","null"]` — some local model runtimes
  // may not support them reliably and can throw hard-to-debug errors.
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    properties: {
      primary: { type: "string", enum: [...PRIMARY_CAPABILITIES] },
      secondary: {
        type: "array",
        items: { type: "string", enum: [...SECONDARY_TASKS] },
      },
      constraints: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "integer", minimum: 1, maximum: 20 },
          recency: { type: "string", enum: ["recent", "any"] },
          domain: { type: "string", maxLength: 240 },
          year_min: { type: "integer", minimum: 1900, maximum: 2100 },
          year_max: { type: "integer", minimum: 1900, maximum: 2100 },
        },
      },
    },
    required: ["primary", "secondary"],
  });
}

export function normalizeRoutePlan(plan: RoutePlan): RoutePlan {
  const primary = plan.primary;
  const secondary = Array.from(new Set(plan.secondary || []));
  const constraints = plan.constraints ? { ...plan.constraints } : undefined;

  // Ensure RAG_SEARCH always includes RETRIEVE (even if the model forgot).
  if (primary === "RAG_SEARCH" && !secondary.includes("RETRIEVE")) secondary.unshift("RETRIEVE");

  // Clamp count if present.
  if (constraints && typeof constraints.count === "number") {
    const c = Math.max(1, Math.min(20, Math.trunc(constraints.count)));
    constraints.count = Number.isFinite(c) ? c : null;
  }

  // Normalize recency values.
  if (constraints?.recency && constraints.recency !== "recent" && constraints.recency !== "any") {
    constraints.recency = "any";
  }

  // Basic year range sanity.
  if (constraints?.year_min && constraints?.year_max && constraints.year_min > constraints.year_max) {
    const tmp = constraints.year_min;
    constraints.year_min = constraints.year_max;
    constraints.year_max = tmp;
  }

  return { primary, secondary, constraints };
}


