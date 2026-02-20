"use client";
import { Playfair_Display } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { routePrompt, warmupLocalChatModel } from "@/lib/ai/agent";
import { routerDebugGroup, routerDebugLog } from "@/lib/routerDebug";
import Image from "next/image";
import { useChatMemory } from "./useChatMemory";
import type { ChatMessage } from "./types";
import { RagHitsBubble } from "./components/RagHitsBubble";
import { useRagSearch } from "./useRagSearch";
import { answerWebsiteQuestion, looksLikeWebsiteQuestion } from "./websiteNavigator";
import { answerFollowUpFromMemory, answerMlQuestion, clarifyAmbiguity } from "@/lib/ai/chains";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const VECTOR_SEARCHING_TOKEN = "__VECTOR_SEARCHING__";
const THINKING_TOKEN = "__THINKING__";

function deriveInitStage(progress: number, text: string): string {
  const t = (text || "").toLowerCase();
  if (t.includes("secure context") || t.includes("https")) return "Checking HTTPS / secure context";
  if (t.includes("webgpu") || t.includes("gpu adapter") || t.includes("requesting gpu")) return "Checking WebGPU";
  if (t.includes("download") || t.includes("fetch") || t.includes("retriev")) return "Downloading model";
  if (t.includes("cache") || t.includes("indexeddb")) return "Loading from cache";
  if (t.includes("compil") || t.includes("shader") || t.includes("kernel")) return "Compiling shaders";
  if (t.includes("warm") || t.includes("prefill") || t.includes("final")) return "Warming up";

  // Fallback by progress when the engine doesn't provide descriptive text.
  if (progress < 0.08) return "Starting";
  if (progress < 0.6) return "Downloading model";
  if (progress < 0.9) return "Compiling & warming up";
  return "Finalizing";
}

function renderBoldMarkdown(text: string) {
  // Minimal, safe subset: only supports **bold** (no HTML).
  const parts = text.split("**");
  // If no bold tokens, or an unmatched token count, render as plain text.
  if (parts.length < 3 || parts.length % 2 === 0) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-extrabold">
        {p}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function renderChatRichText(text: string) {
  // Safe, tiny subset:
  // - **bold**
  // - markdown links: [label](/path) or [label](https://...)
  const out: Array<string | React.ReactElement> = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null = null;

  while ((m = re.exec(text)) !== null) {
    const [full, label, hrefRaw] = m;
    const start = m.index;
    const end = start + full.length;
    const before = text.slice(last, start);
    if (before) out.push(before);

    const href = String(hrefRaw || "").trim();
    const safe = href.startsWith("/") || href.startsWith("https://") || href.startsWith("http://");
    if (safe) {
      out.push(
        <a
          key={`link-${start}-${end}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 text-emerald-700 hover:text-emerald-800"
        >
          {label}
        </a>
      );
    } else {
      // If href is not safe, render as plain text.
      out.push(full);
    }

    last = end;
  }

  const tail = text.slice(last);
  if (tail) out.push(tail);

  // Apply bold rendering to non-link text chunks.
  return out.map((chunk, idx) => {
    if (typeof chunk !== "string") return chunk;
    return <span key={`t-${idx}`}>{renderBoldMarkdown(chunk)}</span>;
  });
}

const SAMPLE_QUERIES = [
  "Find 5 recent papers on retrieval-augmented generation for code (with short one-line summaries).",
  "Explain the difference between LoRA and full fine-tuning, and when you'd choose each.",
  "Where did your website gather the data for the papers and conferences?",
] as const;

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showWebGpuDetails, setShowWebGpuDetails] = useState(false);

  const [engineState, setEngineState] = useState<
    | { state: "idle" }
    | { state: "loading"; progress: number; text: string }
    | { state: "ready" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const { memory, addTurnToMemory, recordRagMemory, buildRouterMemorySnapshot } = useChatMemory(messages);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending && engineState.state === "ready",
    [input, isSending, engineState.state]
  );

  const webGpuUnavailable = engineState.state === "error";
  const isLoadingModel = engineState.state === "loading";
  const isReady = engineState.state === "ready";
  const hasConversation = messages.length > 0;

  useEffect(() => {
    // Preload the model on page entry so first response feels snappy.
    let cancelled = false;
    setEngineState({ state: "loading", progress: 0, text: "Initializing..." });

    // Some model loaders do heavy synchronous work; yield one tick so the loading UI can paint.
    let heartbeat: number | null = null;
    const start = () => {
      // Fallback progress ticker: keeps UI alive even if the runtime reports no granular progress.
      let lastProgress = 0;
      let lastText = "Initializing...";
      heartbeat = window.setInterval(() => {
        setEngineState((s) => {
          if (s.state !== "loading") return s;
          // Smoothly creep upward until real progress updates arrive.
          const next = Math.min(0.92, Math.max(lastProgress, s.progress) + 0.01);
          const text = s.text || lastText || "Loading model…";
          lastProgress = Math.max(lastProgress, next);
          lastText = text;
          return { state: "loading", progress: next, text };
        });
      }, 400);

      warmupLocalChatModel((report) => {
        if (cancelled) return;
        // Real progress overrides heartbeat.
        setEngineState((s) => (s.state === "loading" ? { state: "loading", progress: report.progress, text: report.text } : s));
      })
        .then(() => {
          if (cancelled) return;
          setEngineState({ state: "ready" });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : "Failed to initialize local model.";
          setEngineState({ state: "error", message: msg });
        })
        .finally(() => {
          if (heartbeat) window.clearInterval(heartbeat);
          heartbeat = null;
        });
    };

    const t = window.setTimeout(start, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (heartbeat) window.clearInterval(heartbeat);
    };
  }, []);

  useEffect(() => {
    // Reset details panel whenever the state changes.
    if (!webGpuUnavailable) setShowWebGpuDetails(false);
  }, [webGpuUnavailable]);

  useEffect(() => {
    // Keep view pinned to bottom when new messages arrive.
    scrollRef.current?.scrollIntoView({ behavior: messages.length <= 2 ? "auto" : "smooth" });
  }, [messages.length]);
  
  function upsertMessage(id: string, next: Partial<ChatMessage>) {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }

  const { runRagSearch } = useRagSearch({ newId, setMessages, upsertMessage, addTurnToMemory, recordRagMemory });

  async function handleSend(nextPrompt?: string) {
    const prompt = (nextPrompt ?? input).trim();
    if (!prompt || isSending || engineState.state !== "ready") return;

    setIsSending(true);
    setInput("");

    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt };
    const pendingId = newId();
    // Show immediate feedback while stage-1 routes (avoid blank gap).
    const pendingAssistant: ChatMessage = { id: pendingId, role: "assistant", content: THINKING_TOKEN };
    setMessages((m) => [...m, userMsg, pendingAssistant]);
    addTurnToMemory({ role: "user", content: prompt });

    try {
      // Stage 1: router plan (primary capability + secondary tasks + constraints)
      // IMPORTANT: do NOT include the current prompt as an "extra turn" in router memory.
      // At this point the memory state update from addTurnToMemory() may not have committed yet,
      // and including the current prompt can make stage-1 think this is a FOLLOW_UP.
      const routerMemory = buildRouterMemorySnapshot();
      const plan = await routePrompt(prompt, { memory: routerMemory });
      routerDebugGroup(`[router] stage2 execute primary=${plan.primary}`, () => {
        routerDebugLog("plan:", plan);
      });

      // Stage 2: execute based on the route
      let reply = "";

      if (plan.primary === "RAG_SEARCH") {
        await runRagSearch({ prompt, plan, vectorSearchingToken: VECTOR_SEARCHING_TOKEN, pendingId });
        return; // IMPORTANT: avoid also appending a second assistant message below
      } else if (plan.primary === "FOLLOW_UP") {
        // If the user is asking about site usage/policies, answer via the deterministic website navigator
        // instead of the follow-up LLM (which is constrained to memory and can respond incorrectly).
        if (looksLikeWebsiteQuestion(prompt)) {
          reply = answerWebsiteQuestion(prompt, plan);
        } else {
        const recentTurns = [...memory.recentTurns, { role: "user" as const, content: prompt }].slice(-10);
        const ragContext =
          memory.ragHistory.length === 0
            ? "No stored RAG results."
            : memory.ragHistory
                .slice(0, 2)
                .map((r, idx) => {
                  const items = r.hits
                    .slice(0, 5)
                    .map(
                      (h, i) =>
                        `${i + 1}. ${h.title}${h.year ? ` (${h.year})` : ""}${
                          typeof h.distance === "number" ? ` [dist=${h.distance.toFixed(4)}]` : ""
                        }`
                    )
                    .join("; ");
                  return `RAG ${idx + 1}: query="${r.query}". Papers: ${items}`;
                })
                .join("\n");

        reply = await answerFollowUpFromMemory({
          prompt,
          summary: memory.summary,
          recentTurns,
          ragContext,
        });
        }
        upsertMessage(pendingId, { content: reply });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      } else if (plan.primary === "ML_NO_RAG") {
        try {
          // Keep minimal context: last few user+assistant messages (excluding the current prompt which we'll add).
          const history = [...messages, userMsg]
            .slice(-10)
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

          reply = await answerMlQuestion({ history });
          upsertMessage(pendingId, { content: reply });
          addTurnToMemory({ role: "assistant", content: reply });
          return; // IMPORTANT: avoid also appending a second assistant message below
        } catch {
          const fallback = "Sorry — I couldn’t complete that request.";
          upsertMessage(pendingId, { content: fallback });
          addTurnToMemory({ role: "assistant", content: fallback });
          return;
        }
      } else if (plan.primary === "WEBSITE") {
        reply = answerWebsiteQuestion(prompt, plan);
        upsertMessage(pendingId, { content: reply });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      } else if (plan.primary === "AMBIGUOUS") {
        try {
          reply = await clarifyAmbiguity(prompt);
        } catch {
          reply =
            "Could you clarify whether you want paper recommendations, an ML explanation, a follow-up on prior results, or help using this site?";
        }
        upsertMessage(pendingId, { content: reply });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      } else {
        // UNRELATED (no LLM)
        reply = `I'm sorry, but I cannot answer your question "${prompt}" because it is not related to ML 😔 Could you please ask different questions?`;
        upsertMessage(pendingId, { content: reply });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      }
    } catch {
      // Never disclose error details in chat.
      const fallback = "Sorry — I couldn’t complete that request.";
      upsertMessage(pendingId, { content: fallback });
      addTurnToMemory({ role: "assistant", content: fallback });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="h-[calc(100vh-5rem)] overflow-hidden px-4 sm:px-6 lg:px-8 py-6">
      <div className="h-full mx-auto w-full max-w-6xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px]">
        {/* Background gradient */}
        <div className="h-full rounded-[28px] bg-gradient-to-br from-slate-50 via-rose-50 to-violet-100 p-4 sm:p-6 border border-white/60 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          {/* Glass card */}
          <div className="relative h-full rounded-[24px] bg-white/65 backdrop-blur-xl border border-white/70 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div
              className={[
                "border-b border-white/60 transition-all duration-500 ease-in-out",
                hasConversation ? "px-4 sm:px-6 py-3" : "px-5 sm:px-7 pt-5 sm:pt-7 pb-4",
              ].join(" ")}
            >
              {/* Compact top bar (always visible) */}
              <div className={["flex items-center justify-between gap-3", hasConversation ? "" : "justify-center"].join(" ")}>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/70 border border-white/80 shadow-sm">
                  <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-sm">
                    <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 21s-7-4.35-7-11a7 7 0 1 1 14 0c0 6.65-7 11-7 11Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9.5 10.5c.9-1.3 1.9-2 2.5-2 .8 0 1.5.7 1.5 1.5 0 1.2-1.5 1.7-1.5 3"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path d="M12 15.75h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <span className="text-sm font-semibold text-gray-900">MLTree AI Chat</span>
                </div>

                {hasConversation && (
                  <div className="flex items-center gap-2 shrink-0">
                    {engineState.state === "ready" && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/70 bg-white/60 text-xs text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Ready
                      </div>
                    )}
                    {engineState.state === "loading" && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/70 bg-white/60 text-xs text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Loading…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Intro content (collapses away once a conversation starts) */}
              <div
                className={[
                  "overflow-hidden transition-all duration-500 ease-in-out",
                  hasConversation ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none" : "max-h-[520px] opacity-100 translate-y-0",
                ].join(" ")}
              >
                <div className="flex flex-col items-center text-center">
                  <h1 className={`mt-4 text-2xl sm:text-4xl font-bold text-gray-900 ${playfairDisplay.className}`}>
                    Hi, I’m MLTree LLM Agent (Beta Mode)
                  </h1>
                  <p className="text-sm text-gray-600 mt-2 max-w-2xl">
                    Ask about papers, concepts, or how to use MLBench. Responses run locally in your browser via WebGPU.
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    {engineState.state === "ready" && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/70 bg-white/60 text-xs text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Ready
                      </div>
                    )}
                    {engineState.state === "loading" && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/70 bg-white/60 text-xs text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Loading…
                      </div>
                    )}
                  </div>
                </div>

                {/* Samples */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SAMPLE_QUERIES.map((q, idx) => {
                    const samplesDisabled = engineState.state !== "ready";
                    const gradient =
                      idx === 0
                        ? "from-emerald-400/25 via-teal-400/15 to-sky-400/20"
                        : idx === 1
                        ? "from-violet-400/25 via-fuchsia-400/15 to-rose-400/20"
                        : "from-amber-300/30 via-orange-400/15 to-rose-400/20";

                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={samplesDisabled}
                        onClick={() => {
                          if (samplesDisabled) return;
                          setInput(q);
                          void handleSend(q);
                        }}
                        className={[
                          "text-left rounded-2xl border border-white/70 bg-gradient-to-br transition shadow-sm px-4 py-3",
                          gradient,
                          samplesDisabled ? "opacity-60 cursor-not-allowed" : "hover:brightness-[1.02]",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold text-gray-900 line-clamp-2">{q}</div>
                        <div className="text-xs text-gray-700/80 mt-1">
                          {samplesDisabled ? "Loading model…" : "Try this"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden">
              <div className="relative h-full px-4 sm:px-7 py-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    {webGpuUnavailable ? (
                      <div className="text-center max-w-lg">
                        <div className="flex items-center justify-center">
                          <Image
                            src="/warning.png"
                            alt="WebGPU unavailable"
                            width={220}
                            height={220}
                            className="opacity-90"
                            priority
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center max-w-lg">
                        <div className="text-sm font-semibold text-gray-900">Start with a question</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Click a sample above, or ask your own. Messages scroll inside the card.
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isUser = m.role === "user";
                      const isVectorSearching = m.role === "assistant" && m.content === VECTOR_SEARCHING_TOKEN;
                      const isThinking = m.role === "assistant" && m.content === THINKING_TOKEN;
                      const hasRagHits = m.role === "assistant" && Array.isArray(m.ragHits) && m.ragHits.length > 0;
                      return (
                        <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className={[
                              // Unify bubble sizing/typography so 1-line vs multi-line messages stay visually consistent.
                              "w-fit max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm break-words text-[15px] sm:text-[16px] leading-7",
                              isUser
                                ? "text-white bg-gradient-to-br from-emerald-500 to-teal-500 font-bold"
                                : "text-gray-950 bg-gray-100 border border-gray-200",
                            ].join(" ")}
                          >
                            {isVectorSearching ? (
                              <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path
                                    d="M12 2a10 10 0 1 0 10 10"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                Searching papers
                                <span className="inline-flex w-6 justify-start">
                                  <span className="animate-pulse">…</span>
                                </span>
                              </div>
                            ) : isThinking ? (
                              <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path
                                    d="M12 2a10 10 0 1 0 10 10"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                Thinking
                                <span className="inline-flex w-6 justify-start">
                                  <span className="animate-pulse">…</span>
                                </span>
                              </div>
                            ) : hasRagHits ? (
                              <RagHitsBubble title={m.content} hits={m.ragHits!} />
                            ) : (
                              <div
                                className={[
                                  "whitespace-pre-wrap",
                                  isUser ? "text-white" : "text-gray-950",
                                ].join(" ")}
                              >
                                {renderChatRichText(m.content)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={scrollRef} />
                  </div>
                )}

                {/* Obvious loading overlay (only before first message) */}
                {isLoadingModel && messages.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white/75 backdrop-blur px-5 py-5 shadow-sm text-center">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-sm">
                          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M12 2a10 10 0 1 0 10 10"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-semibold text-gray-900">Loading LLM Agent to your browser...</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Stage:{" "}
                            <span className="font-semibold text-gray-800">
                              {deriveInitStage(engineState.progress, engineState.text)}
                            </span>
                            <span className="inline-flex w-6 justify-start">
                              <span className="animate-pulse">…</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[11px] text-gray-600">
                          <span className="truncate">Details: {engineState.text}</span>
                          <span className="tabular-nums">{Math.round(engineState.progress * 100)}%</span>
                        </div>
                        <div className="mt-2 h-2 bg-white/70 rounded-full overflow-hidden">
                          <div
                            className="h-2 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                            style={{ width: `${Math.round(engineState.progress * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="px-4 sm:px-7 py-4 border-t border-white/60 bg-white/50">
              {engineState.state === "loading" && (
                <div className="mb-3">
                  <div className="text-[11px] text-gray-600 mb-1">{engineState.text}</div>
                  <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                      style={{ width: `${Math.round(engineState.progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-stretch">
                <div className="flex-1">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={engineState.state === "loading"}
                    placeholder={engineState.state === "loading" ? "Loading model…" : "Ask MLBench anything…"}
                    className="w-full h-12 px-4 rounded-2xl border border-white/70 bg-white/75 text-gray-900 font-normal text-[15px] leading-none focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-white placeholder:text-gray-500 disabled:bg-white/50"
                  />
                </div>

                <button
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className={[
                    "shrink-0 h-12 px-5 rounded-2xl text-sm leading-none font-semibold text-white shadow-sm transition-all",
                    // Change color when model becomes ready (even if input is empty, it will appear "armed").
                    isReady
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                      : "bg-gradient-to-r from-slate-400 to-slate-400",
                    !canSend ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {isSending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>

            {/* Single WebGPU warning: lower-center */}
            {webGpuUnavailable && (
              <div className="pointer-events-none absolute left-1/2 bottom-4 -translate-x-1/2 px-3">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  {showWebGpuDetails && (
                    <div className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-red-200/70 bg-white/80 backdrop-blur px-4 py-3 shadow-sm">
                      <div className="text-xs font-semibold text-red-700">WebGPU troubleshooting</div>
                      <div className="mt-2 text-[11px] text-gray-700 space-y-1.5">
                        <div className="rounded-xl bg-red-50/60 border border-red-100 px-3 py-2 text-red-700 whitespace-pre-wrap">
                          {engineState.state === "error" ? engineState.message : "WebGPU unavailable."}
                        </div>
                        <div className="text-gray-700">
                          Try:
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            <li>Use the latest Chrome/Edge (WebGPU enabled by default).</li>
                            <li>
                              Check <span className="font-mono">chrome://gpu</span> for WebGPU status and blocklist reasons.
                            </li>
                            <li>Update GPU drivers (Linux: Mesa / NVIDIA proprietary drivers).</li>
                            <li>If in a VM/remote desktop, enable GPU acceleration / passthrough.</li>
                            <li>Ensure you’re in a secure context (HTTPS or localhost).</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="inline-flex items-center gap-2 rounded-full border border-red-200/70 bg-white/70 backdrop-blur px-3 py-1.5 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs font-semibold text-red-700">
                      WebGPU unavailable — AI Chat requires WebGPU. Send is disabled.
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowWebGpuDetails((v) => !v)}
                      className="ml-1 text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-800"
                    >
                      {showWebGpuDetails ? "Hide" : "Details"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

