"use client";

import { Playfair_Display } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import { classifyPrompt, getWebLLMEngine, type ScenarioCategory } from "@/lib/webllmAgent";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const CATEGORY_BADGE: Record<ScenarioCategory, { label: string; color: string; help: string }> = {
  RAG_SEARCH: {
    label: "RAG_SEARCH",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    help: "ML paper search / citations / retrieval needed",
  },
  ML_NO_RAG: {
    label: "ML_NO_RAG",
    color: "bg-green-50 text-green-700 border-green-200",
    help: "ML question, no paper retrieval needed",
  },
  WEBSITE: {
    label: "WEBSITE",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    help: "Question about this website/app",
  },
  UNRELATED: {
    label: "UNRELATED",
    color: "bg-gray-50 text-gray-700 border-gray-200",
    help: "Not ML or not about this site (or uncertain)",
  },
};

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [engineState, setEngineState] = useState<
    | { state: "idle" }
    | { state: "loading"; progress: number; text: string }
    | { state: "ready" }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

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
    // Keep view pinned to bottom when new messages arrive.
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || isSending) return;

    setIsSending(true);
    setInput("");

    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt };
    setMessages((m) => [...m, userMsg]);

    try {
      const result = await classifyPrompt(prompt);
      const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: result.category };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err: unknown) {
      // Even on error, do NOT surface model output; keep response bounded.
      const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "UNRELATED" };
      setMessages((m) => [...m, assistantMsg]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-gray-50 rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className={`text-4xl sm:text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>
                AI Chat
              </h1>
              <p className="text-gray-600 mt-2">
                Beta router: the assistant will respond with exactly one category only.
              </p>
            </div>

            <div className="text-right">
              {engineState.state === "loading" && (
                <div className="min-w-[220px]">
                  <div className="text-xs text-gray-600 mb-2">{engineState.text}</div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-green-500 transition-all"
                      style={{ width: `${Math.round(engineState.progress * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {Math.round(engineState.progress * 100)}%
                  </div>
                </div>
              )}
              {engineState.state === "ready" && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-white text-sm text-gray-700">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Model ready
                </div>
              )}
              {engineState.state === "error" && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-red-50 text-sm text-red-700 border-red-200">
                  WebLLM error: {engineState.message}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col min-h-[520px]">
              <div className="flex-1 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6">
                    <div className="mb-5">
                      <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <div className="text-gray-900 font-semibold">Try asking something</div>
                    <div className="text-gray-600 text-sm mt-1">
                      The assistant will only output one of: RAG_SEARCH, ML_NO_RAG, WEBSITE, UNRELATED.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isUser = m.role === "user";
                      const isAssistant = m.role === "assistant";
                      const asCategory = isAssistant ? (m.content as ScenarioCategory) : null;

                      return (
                        <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 border shadow-sm ${
                              isUser
                                ? "bg-green-600 text-white border-green-700"
                                : "bg-white text-gray-900 border-gray-200"
                            }`}
                          >
                            {isUser ? (
                              <div className="whitespace-pre-wrap">{m.content}</div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${CATEGORY_BADGE[asCategory!]?.color ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
                                  {asCategory ?? "UNRELATED"}
                                </span>
                                <span className="text-sm text-gray-700">
                                  {CATEGORY_BADGE[asCategory ?? "UNRELATED"].help}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={scrollRef} />
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    disabled={engineState.state === "error" || engineState.state === "loading"}
                    placeholder={
                      engineState.state === "loading"
                        ? "Loading model…"
                        : engineState.state === "error"
                        ? "WebLLM failed to load"
                        : "Type your message and press Enter"
                    }
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!canSend || engineState.state !== "ready"}
                    className="px-5 py-3 rounded-xl bg-green-600 text-white font-semibold shadow-sm hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                  >
                    {isSending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-900">Output categories</div>
              <div className="text-xs text-gray-600 mt-1">
                The model is forced to output a strict JSON object with an enum category. The UI will only ever render these categories.
              </div>

              <div className="mt-4 space-y-3">
                {(Object.keys(CATEGORY_BADGE) as ScenarioCategory[]).map((k) => (
                  <div key={k} className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${CATEGORY_BADGE[k].color}`}>
                      {CATEGORY_BADGE[k].label}
                    </span>
                    <div className="text-sm text-gray-700">{CATEGORY_BADGE[k].help}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-200 my-4" />

              <div className="text-xs text-gray-600">
                Model: <span className="font-mono">{`Llama-3.2-3B-Instruct-q4f16_1-MLC`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

