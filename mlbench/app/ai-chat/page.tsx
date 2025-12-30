"use client";

import { Playfair_Display } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { getWebLLMEngine } from "@/lib/webllmAgent";
import Image from "next/image";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const SAMPLE_QUERIES = [
  "Find 5 recent papers on retrieval-augmented generation for code (with short one-line summaries).",
  "Explain the difference between LoRA and full fine-tuning, and when you'd choose each.",
  "How do I use MLBench to find conferences and bookmark papers I like?",
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

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending && engineState.state === "ready",
    [input, isSending, engineState.state]
  );

  const webGpuUnavailable = engineState.state === "error";
  const isLoadingModel = engineState.state === "loading";
  const isReady = engineState.state === "ready";

  useEffect(() => {
    // Preload the model on page entry so first response feels snappy.
    let cancelled = false;
    setEngineState({ state: "loading", progress: 0, text: "Initializing..." });
    getWebLLMEngine((report) => {
      if (cancelled) return;
      setEngineState({ state: "loading", progress: report.progress, text: report.text });
    })
      .then(() => {
        if (cancelled) return;
        setEngineState({ state: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to initialize WebLLM.";
        setEngineState({ state: "error", message: msg });
      });

    return () => {
      cancelled = true;
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

  async function handleSend(nextPrompt?: string) {
    const prompt = (nextPrompt ?? input).trim();
    if (!prompt || isSending || engineState.state !== "ready") return;

    setIsSending(true);
    setInput("");

    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt };
    setMessages((m) => [...m, userMsg]);

    try {
      const engine = await getWebLLMEngine();

      const system =
        "You are MLBench AI Chat, a helpful assistant for machine learning researchers. " +
        "Be concise, practical, and specific. If the user asks for papers, provide a short curated list. " +
        "If you are unsure, ask one clarifying question.";

      const history = messages
        .slice(-12) // keep context bounded for latency
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const res = await engine.chat.completions.create({
        messages: [{ role: "system" as const, content: system }, ...history, { role: "user" as const, content: prompt }],
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 600,
      });

      const text = res.choices?.[0]?.message?.content?.trim() || "I couldn’t generate a response. Please try again.";
      const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: text };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong while generating a response. Please try again.";
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: `Sorry — I couldn’t run the model.\n\n${msg}`,
      };
      setMessages((m) => [...m, assistantMsg]);
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
            <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-4 border-b border-white/60">
              <div className="flex flex-col items-center text-center">
                {/* Center bubble */}
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
                      <path
                        d="M12 15.75h.01"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <span className="text-sm font-semibold text-gray-900">MLTree AI Chat</span>
                </div>

                <h1 className={`mt-4 text-2xl sm:text-4xl font-bold text-gray-900 ${playfairDisplay.className}`}>
                  Hi, I’m MLTree LLM Agent
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
                      onClick={() => {
                        setInput(q);
                        if (engineState.state === "ready") {
                          void handleSend(q);
                        }
                      }}
                      className={`text-left rounded-2xl border border-white/70 bg-gradient-to-br ${gradient} hover:brightness-[1.02] transition shadow-sm px-4 py-3`}
                    >
                      <div className="text-sm font-semibold text-gray-900 line-clamp-2">{q}</div>
                      <div className="text-xs text-gray-700/80 mt-1">Try this</div>
                    </button>
                  );
                })}
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
                      return (
                        <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className={[
                              "max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
                              isUser
                                ? "text-white bg-gradient-to-br from-emerald-500 to-teal-500"
                                : "text-gray-900 bg-white/80 border border-white/70",
                            ].join(" ")}
                          >
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
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
                          <div className="text-sm font-semibold text-gray-900">Loading MLTree…</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Initializing the local model
                            <span className="inline-flex w-6 justify-start">
                              <span className="animate-pulse">…</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[11px] text-gray-600">
                          <span className="truncate">{engineState.text}</span>
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

              <div className="flex gap-2 items-end">
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
                    className="w-full px-4 py-3 rounded-2xl border border-white/70 bg-white/75 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-white placeholder:text-gray-400 disabled:bg-white/50"
                  />
                </div>

                <button
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className={[
                    "shrink-0 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-sm transition-all",
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

