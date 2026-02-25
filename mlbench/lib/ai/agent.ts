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

/**
 * Pre-LLM heuristic: detect obviously off-topic queries so we never waste a
 * router LLM call on them. The 1.2B LFM model is weak at zero-shot classification
 * of non-ML content, so a deterministic guard here is much more reliable.
 *
 * Catches:
 *   - "Who is <person>?" style questions about celebrities / public figures
 *   - Sports, music, movies, TV, politics, cooking, travel, geography, weather
 *   - Pure arithmetic / riddles / jokes
 *   - Historical / general knowledge questions unrelated to ML/AI/CS
 */
/**
 * Returns true when the prompt contains at least one meaningful ML-related
 * term. Used as a final safety gate before calling the LLM router.
 */
function hasAnyMlSignal(raw: string): boolean {
  return /\b(machine learning|deep learning|neural|transformer|bert|gpt|llm|model|paper|dataset|benchmark|algorithm|training|inference|nlp|computer vision|reinforcement|embedding|attention|gradient|loss|fine.?tun|pre.?train|rag|retrieval|diffusion|generative|ai|artificial intelligence|language model|classification|regression|cluster|encoder|decoder|autoencoder|convolution|recurrent|lstm|gan|vae|stable diffusion|resnet|vit|llama|mistral|qwen|gemma|falcon|phi|mamba|ssm|rlhf|lora|peft|quantiz|compression|pruning|distill|zero-shot|few-shot|prompt|token|vocab|softmax|activation|backprop|latent|vector|similarity|cosine|euclidean|faiss|hnswlib|milvus|weaviate|pinecone|langchain|hugging.?face|pytorch|tensorflow|jax|cuda|gpu|tpu|rcnn|faster.?rcnn|yolo|ssd|mobilenet|efficientnet|inception|alexnet|vgg|squeezenet|densenet|unet|detr|clip|dalle|stable.?diffusion|imagenet|coco|pascal|ade20k|glue|squad|mmlu|hellaswag|winogrande|arc|truthfulqa|bigbench|openai|anthropic|deepmind|mistral|gemini|whisper|wav2vec|hubert|clip|dino|sam|segment|object detection|image classification|text generation|speech recognition|question answering|named entity|sentiment|summarization|translation|multimodal|vision.?language|reward model|policy gradient|dqn|ppo|a3c|actor.?critic)\b/i.test(raw);
}

function looksLikeOffTopic(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();

  // ── Guard 1: Pure numbers / phone numbers / PINs / random digit strings ─────
  // e.g. "7789890916", "(555) 123-4567" — zero ML signal.
  // Allow things like "top 5" or "3 papers" which are numeric but have words.
  if (/^[\d\s\-().+#*]+$/.test(p)) return true;

  // ── Guard 2: No alphabetic characters at all (emoji-only, symbols, etc.) ────
  if (!/[a-z]/.test(p)) return true;

  // ── Guard 3: Very short input that is clearly not ML (single junk word) ─────
  // e.g. "lol", "haha", "ok", "hi", pure gibberish
  const stripped = p.replace(/[^a-z\s]/g, "").trim();
  if (stripped.length <= 6 && !hasAnyMlSignal(p)) return true;

  // ── Guard 4: "Who is X?" pattern — person biography queries ─────────────────
  // Only applies to "who" questions ("who is X?", "who was X?"), NOT "what is X?"
  // "what is X?" is too often a valid ML concept question ("what is Faster RCNN?").
  const mlPersons = /\b(turing|lecun|bengio|hinton|hochreiter|schmidhuber|vaswani|goodfellow|ng|karpathy|sutton|silver|mnih|fei.?fei|hassabis|dean|vinyals|devlin|bert|openai|deepmind|anthropic)\b/;
  const whoIsPattern = /^(who is|who was|who are|who were)\s+.{2,}/;  // ← 'what is/was' intentionally removed
  if (whoIsPattern.test(p) && !mlPersons.test(p) && !hasAnyMlSignal(p)) return true;

  // ── Guard 5: Explicit off-topic domain keywords ───────────────────────────────
  const offTopicPatterns = [
    // Celebrities, sports, music, entertainment
    /\b(taylor swift|beyonce|kanye|rihanna|drake|adele|elon musk|jeff bezos|kim kardashian|brad pitt|angelina|celebrity|singer|actor|actress|musician|pop star|rapper)\b/,
    // Sports
    /\b(nba|nfl|mlb|nhl|fifa|soccer|football|basketball|baseball|tennis|golf|cricket|f1|formula one|olympics|super bowl|world cup|quarterback|striker|goalkeeper)\b/,
    // Cooking / food
    /\b(recipe|cooking|baking|chef|restaurant|cuisine|ingredient|calorie|diet|nutrition|vegetarian|vegan)\b/,
    // Travel / geography
    /\b(travel|vacation|holiday|hotel|flight|airport|visa|passport|tourism|weather forecast|temperature outside)\b/,
    // Pure arithmetic expression
    /^(what is|calculate|solve|compute)\s+[\d\s\+\-\*\/\^()]+[\d\s\+\-\*\/\^()\.]*\??$/,
    // Jokes / entertainment queries
    /\b(tell me a joke|tell a joke|riddle|celebrity gossip|horoscope)\b/,
    // Medical / health (not ml-in-healthcare)
    /\b(symptom|prescription|drug dosage|doctor visit|hospital|surgery|diagnosis|vaccination|vitamin supplement)\b/,
    // Finance (narrow — avoid blocking "ML in finance" questions)
    /\b(stock price today|bitcoin price|buy stocks|mortgage rate|tax return|credit card limit)\b/,
  ];

  for (const pattern of offTopicPatterns) {
    if (pattern.test(p)) return true;
  }

  return false;
}


export async function routePrompt(
  prompt: string,
  opts?: {
    initProgressCallback?: InitProgressCallback;
    signal?: AbortSignal;
    memory?: RouterMemoryContext;
  }
): Promise<RoutePlan> {
  // Fast-path 0: deterministically catch obviously off-topic queries.
  // The 1.2B model is unreliable at classifying celebrities / sports / jokes,
  // so we short-circuit here before any LLM call.
  if (looksLikeOffTopic(prompt)) {
    return normalizeRoutePlan({ primary: "UNRELATED", secondary: [], constraints: { domain: prompt.slice(0, 240) } });
  }

  // Fast-path 1: data source questions should never route to retrieval.
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
    // Detect any summarisation intent: "summaries", "summarize", "summary", "one-line", "one liner", "brief", "synopsis", "tl;dr"
    if (/\b(summar(y|ize|izes|ized|ies)|one[- ]?line|one[- ]?liner|brief overview|synopsis|tl;?dr)\b/.test(p)) secondary.push("SUMMARIZE");
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
