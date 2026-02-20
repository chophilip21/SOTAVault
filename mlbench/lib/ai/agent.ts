"use client";

import { normalizeRoutePlan, type PrimaryCapability, type RoutePlan, type SecondaryTask } from "@/lib/routerSpec";
import type { RouterMemoryContext } from "@/lib/ai/types";
import { embedText, getChatPipeline, type InitProgressCallback } from "@/lib/ai/transformersRuntime";
import { routeWithLocalModel } from "@/lib/ai/chains";

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

  const plan = await routeWithLocalModel(prompt, opts?.memory);

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

