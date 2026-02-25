"use client";

import { normalizeRoutePlan, type PrimaryCapability, type RoutePlan, type SecondaryTask } from "@/lib/routerSpec";
import type { RouterMemoryContext } from "@/lib/ai/types";
import {
  embedText,
  checkVllmHealth,
  checkTeiHealth,
  resetLocalPipelines,
  clearTransformersModelCache,
  type InitProgressCallback,
} from "@/lib/ai/localServerRuntime";
import { routeWithLocalModel, routerLayer1, routerLayer2 } from "@/lib/ai/chains";

export type { RoutePlan, PrimaryCapability, RouterMemoryContext, InitProgressCallback };

export type ServerStatus = {
  vllmReady: boolean;
  teiReady: boolean;
};

/** Check both local model servers. Returns their ready status. */
export async function probeLocalServers(): Promise<ServerStatus> {
  const [vllmReady, teiReady] = await Promise.all([checkVllmHealth(), checkTeiHealth()]);
  return { vllmReady, teiReady };
}

/** No-op: Server models are always loaded. Kept for API compatibility. */
export async function warmupAllModels(_initProgressCallback?: InitProgressCallback): Promise<void> {
  // No-op: models are served remotely; no in-browser warmup needed.
}

/** No-op: Models live on the server. */
export function unloadLocalModels(): void {
  resetLocalPipelines();
}

/** No-op: No browser cache involved. */
export async function removeCachedLocalModels(): Promise<{ cachesDeleted: string[]; idbDeleted: string[] }> {
  return clearTransformersModelCache();
}

/** Embed text using the TEI server. */
export async function embedQuery(text: string): Promise<number[]> {
  return await embedText(text);
}

// ─── Routing helpers (unchanged from original) ───────────────────────────────

function hasPriorContext(memory?: RouterMemoryContext): boolean {
  if (!memory) return false;
  const turns = memory.recentTurns || [];
  const rag = memory.recentRag || [];
  return Boolean(memory.summary) || turns.length >= 2 || rag.length > 0;
}

function looksLikeWebsiteDataSourceQuestion(prompt: string): boolean {
  const p = prompt.toLowerCase();
  const asksHowData = /\b(where|how)\b[\s\S]{0,80}\b(data|dataset|source|collected|collection|gather|gathered)\b/.test(p);
  const aboutUs = /\b(mlbench|mltree|this website|this site|your website|your site|your app|this app)\b/.test(p);
  const aboutYou = /\b(you|your)\b/.test(p);
  return asksHowData && (aboutUs || aboutYou);
}

function websiteSecondaryFromPrompt(prompt: string) {
  const p = prompt.toLowerCase();
  const sec: SecondaryTask[] = [];
  if (p.includes("privacy")) sec.push("WEBSITE_PRIVACY");
  if (p.includes("terms")) sec.push("WEBSITE_TERMS");
  if (p.includes("data")) sec.push("WEBSITE_DATA_SOURCES");
  if (p.includes("bookmark")) sec.push("WEBSITE_BOOKMARKS");
  if (p.includes("profile")) sec.push("WEBSITE_PROFILE");
  if (p.includes("login") || p.includes("sign in") || p.includes("log in")) sec.push("WEBSITE_LOGIN");
  if (p.includes("papers")) sec.push("WEBSITE_PAPERS");
  if (p.includes("benchmark")) sec.push("WEBSITE_BENCHMARK");
  if (p.includes("conference")) sec.push("WEBSITE_CONFERENCE");
  if (p.includes("ai chat") || p.includes("webgpu") || p.includes("gpu")) sec.push("WEBSITE_AI_CHAT");
  if (sec.length === 0) sec.push("WEBSITE_NAVIGATE");
  return Array.from(new Set(sec));
}

function heuristicFallback(prompt: string): PrimaryCapability {
  const p = prompt.toLowerCase();
  const website = /\b(mlbench|this site|this website|page|login|log in|sign in|profile|bookmark|privacy|terms|ai chat)\b/.test(p);
  if (website) return "WEBSITE";
  const search = /\b(find|search|papers?|cite|references?|recommend)\b/.test(p);
  if (search) return "RAG_SEARCH";
  return "ML_NO_RAG";
}

export async function routePrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
    memory?: RouterMemoryContext;
  }
): Promise<RoutePlan> {
  // Deterministic fast-path: data source questions should never route to retrieval.
  if (looksLikeWebsiteDataSourceQuestion(prompt)) {
    return normalizeRoutePlan({
      primary: "WEBSITE",
      secondary: Array.from(new Set(websiteSecondaryFromPrompt(prompt).concat(["WEBSITE_DATA_SOURCES"]))),
      constraints: { domain: prompt.slice(0, 240) },
    });
  }

  const p = prompt.toLowerCase();
  const memory = opts?.memory;
  const hasMemory = hasPriorContext(memory);

  const isWebsite =
    /\b(website|this site|mlbench|mltree|page|login|log in|sign in|profile|bookmark|privacy|terms|ai chat)\b/.test(p);
  if (isWebsite) {
    return normalizeRoutePlan({
      primary: "WEBSITE",
      secondary: websiteSecondaryFromPrompt(prompt),
      constraints: { domain: prompt.slice(0, 240) },
    });
  }

  const wantsSearch = /\b(find|search|papers?|cite|citation|references?|recommend|top\s*\d+|latest|recent)\b/.test(p);
  if (wantsSearch) {
    const secondary: SecondaryTask[] = ["RETRIEVE"];
    if (/\b(rerank|most relevant|best match|prioriti[sz]e)\b/.test(p)) secondary.push("RERANK");
    if (/\b(summary|summarize|one[- ]?liners?|tl;dr)\b/.test(p)) secondary.push("SUMMARIZE");
    const m = p.match(/\btop\s*(\d+)\b/);
    const count = m ? Math.max(1, Math.min(50, Number(m[1] || 0))) : undefined;
    const recency = /\b(latest|recent|newest)\b/.test(p) ? ("recent" as const) : undefined;
    return normalizeRoutePlan({
      primary: "RAG_SEARCH",
      secondary: Array.from(new Set(secondary)),
      constraints: {
        ...(count ? { count } : {}),
        ...(recency ? { recency } : {}),
        domain: prompt.slice(0, 240),
      },
    });
  }

  // Two-layer router using VLLM (LFM2.5, same model for everything).
  try {
    const tRouteStart = performance.now();
    if (typeof console !== "undefined" && console.log) {
      console.log("[Router] routePrompt: starting two-layer router via VLLM");
    }

    const layer1 = await routerLayer1(prompt);
    const tAfterLayer1 = performance.now();
    if (typeof console !== "undefined" && console.log) {
      console.log("[Router] routePrompt: Layer 1 done in", Math.round(tAfterLayer1 - tRouteStart), "ms");
    }

    if (layer1 === "unrelated") {
      return normalizeRoutePlan({ primary: "UNRELATED", secondary: [], constraints: { domain: prompt.slice(0, 240) } });
    }
    if (layer1 === "website_related") {
      return normalizeRoutePlan({
        primary: "WEBSITE",
        secondary: websiteSecondaryFromPrompt(prompt),
        constraints: { domain: prompt.slice(0, 240) },
      });
    }
    if (layer1 === "ambiguous") {
      return normalizeRoutePlan({ primary: "AMBIGUOUS", secondary: [], constraints: { domain: prompt.slice(0, 240) } });
    }
    if (layer1 === "ml_related") {
      const tLayer2Start = performance.now();
      const layer2 = await routerLayer2(prompt);
      if (typeof console !== "undefined" && console.log) {
        console.log("[Router] routePrompt: Layer 2 done in", Math.round(performance.now() - tLayer2Start), "ms");
      }
      if (layer2.action === "no_rag") {
        return normalizeRoutePlan({ primary: "ML_NO_RAG", secondary: [], constraints: { domain: prompt.slice(0, 240) } });
      }
      const domain = (layer2.rag_keyword && layer2.rag_keyword.trim()) || prompt.slice(0, 240);
      const countMatch = prompt.toLowerCase().match(/\btop\s*(\d+)\b/);
      const count = countMatch ? Math.min(20, Math.max(1, parseInt(countMatch[1], 10))) : undefined;
      return normalizeRoutePlan({
        primary: "RAG_SEARCH",
        secondary: ["RETRIEVE"],
        constraints: { domain, ...(count != null ? { count } : {}) },
      });
    }
  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[Router] routePrompt: two-layer router failed, falling back to heuristic", err);
    }
  }

  // Fallback: if no prior context, treat as normal ML question.
  const followUpHint =
    hasMemory &&
    /\b(above|earlier|previous|that|those|it|them|the paper|the results|your answer|as you said)\b/.test(p);
  if (!followUpHint) {
    return normalizeRoutePlan({
      primary: "ML_NO_RAG",
      secondary: [],
      constraints: { domain: prompt.slice(0, 240) },
    });
  }

  const plan = await routeWithLocalModel(prompt, memory);

  // Guardrail: FOLLOW_UP requires actual prior context.
  if (plan.primary === "FOLLOW_UP" && !hasPriorContext(opts?.memory)) {
    const corrected = normalizeRoutePlan({
      primary: heuristicFallback(prompt),
      secondary: plan.secondary,
      constraints: plan.constraints,
    });
    return corrected;
  }

  return plan;
}
