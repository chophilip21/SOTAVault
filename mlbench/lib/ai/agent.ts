"use client";

import { config } from "@/lib/config";
import { normalizeRoutePlan, type PrimaryCapability, type RoutePlan, type SecondaryTask } from "@/lib/routerSpec";
import type { RouterMemoryContext } from "@/lib/ai/types";
import {
  embedText,
  getChatPipeline,
  getEmbedPipeline,
  getRouterPipeline,
  loadChatPipelineFromCache,
  loadEmbedPipelineFromCache,
  loadRouterPipelineFromCache,
  clearWllamaModelCache,
  resetLocalPipelines,
  type InitProgressCallback,
} from "@/lib/ai/wllamaRuntime";
import { routeWithLocalModel, routerLayer1, routerLayer2 } from "@/lib/ai/chains";

export type { RoutePlan, PrimaryCapability, RouterMemoryContext, InitProgressCallback };

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

export async function warmupLocalChatModel(initProgressCallback?: InitProgressCallback) {
  return await getChatPipeline(initProgressCallback);
}

/** Load all required models from cache into memory (no download). Call when cache is already complete; greenlight chat only after this. */
export async function warmupAllModels(initProgressCallback?: InitProgressCallback): Promise<void> {
  const report = (p: number, text: string) => {
    try {
      initProgressCallback?.({ progress: p, text });
    } catch {
      /* ignore */
    }
  };
  const hasRouter = !!(config.wllamaRouterModelId?.trim() && config.wllamaRouterFile?.trim());
  if (hasRouter) {
    await getRouterPipeline((r) => {
      report(Math.min(0.25, r.progress * 0.25), `Router: ${r.text}`);
    });
  }
  await getChatPipeline((r) => {
    report(hasRouter ? 0.25 + Math.min(0.5, r.progress * 0.5) : Math.min(0.9, r.progress * 0.85), `Chat: ${r.text}`);
  });
  await getEmbedPipeline((r) => {
    report(0.75 + Math.min(0.25, r.progress * 0.25), `Embed: ${r.text}`);
  });
}

/** Unload all models from memory. Call when user leaves the AI chat tab so models are freed until they return. */
export function unloadLocalModels(): void {
  resetLocalPipelines();
}

export async function probeLocalModelsFromCache(): Promise<{
  chatCached: boolean;
  embedCached: boolean;
  routerCached: boolean;
}> {
  // Checks the browser's Cache API directly — no ONNX init, no network requests.
  const [chatCached, embedCached, routerCached] = await Promise.all([
    loadChatPipelineFromCache(),
    loadEmbedPipelineFromCache(),
    loadRouterPipelineFromCache(),
  ]);
  return { chatCached, embedCached, routerCached };
}

export async function downloadLocalModels(initProgressCallback?: InitProgressCallback) {
  // Download/load router first (small), then chat, then embeddings.
  const report = (p: number, text: string) => {
    try {
      initProgressCallback?.({ progress: p, text });
    } catch {
      /* ignore */
    }
  };
  const hasRouter = !!(config.wllamaRouterModelId?.trim() && config.wllamaRouterFile?.trim());
  if (hasRouter) {
    const { getRouterPipeline } = await import("@/lib/ai/wllamaRuntime");
    await getRouterPipeline((r) => {
      report(Math.min(0.25, r.progress * 0.25), `Router: ${r.text}`);
    });
  }
  await getChatPipeline((r) => {
    report(hasRouter ? 0.25 + Math.min(0.5, r.progress * 0.5) : Math.min(0.9, r.progress * 0.85), `Chat: ${r.text}`);
  });
  await getEmbedPipeline((r) => {
    report(0.75 + Math.min(0.25, r.progress * 0.25), `Embed: ${r.text}`);
  });
}

export async function removeCachedLocalModels() {
  return await clearWllamaModelCache();
}

export async function embedQuery(text: string, opts?: { initProgressCallback?: InitProgressCallback }): Promise<number[]> {
  return await embedText(text, { initProgressCallback: opts?.initProgressCallback });
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

  // Performance fast-paths: avoid calling the local router model for common cases.
  // The local LLM is the slowest step; routing + answering would otherwise run two generations per message.
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

  // Two-layer router (Qwen3 with /no_think) when configured and cached.
  const routerConfigured = !!(config.wllamaRouterModelId?.trim() && config.wllamaRouterFile?.trim());
  if (routerConfigured) {
    try {
      const routerCached = await loadRouterPipelineFromCache();
      if (routerCached) {
        const tRouteStart = performance.now();
        if (typeof console !== "undefined" && console.log) {
          console.log("[LangChain] routePrompt: starting two-layer router");
        }

        const layer1 = await routerLayer1(prompt);
        const tAfterLayer1 = performance.now();
        if (typeof console !== "undefined" && console.log) {
          console.log("[LangChain] routePrompt: Layer 1 done in", Math.round(tAfterLayer1 - tRouteStart), "ms");
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
            console.log("[LangChain] routePrompt: Layer 2 done in", Math.round(performance.now() - tLayer2Start), "ms");
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
      }
    } catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[LangChain] routePrompt: two-layer router failed, falling back to legacy routing", err);
      }
    }
  }

  // Legacy: if no prior context, treat as normal ML question (no need to route).
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

