"use client";
import { Playfair_Display } from "next/font/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { probeLocalServers, routePrompt, type ServerStatus } from "@/lib/ai/agent";
import { routerDebugGroup, routerDebugLog } from "@/lib/routerDebug";
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

const PREPARING_SEARCH_TOKEN = "__PREPARING_SEARCH__";
const VECTOR_SEARCHING_TOKEN = "__VECTOR_SEARCHING__";
const THINKING_TOKEN = "__THINKING__";

function renderBoldMarkdown(text: string) {
  const parts = text.split("**");
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
      out.push(full);
    }

    last = end;
  }

  const tail = text.slice(last);
  if (tail) out.push(tail);

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

// ─── Status pill component ─────────────────────────────────────────────────────
function StatusPill({ label, ready, checking }: { label: string; ready: boolean; checking: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/70 bg-white/60 text-xs font-medium text-gray-700">
      {checking ? (
        <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
      ) : ready ? (
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-red-500" />
      )}
      {label}
    </span>
  );
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Server status — 'checking' is only true during the very first probe.
  // Background polls update vllmReady/teiReady silently so the input never
  // gets disabled mid-type (which would cause focus loss every 5 s).
  const [serverStatus, setServerStatus] = useState<{ checking: boolean } & ServerStatus>({
    checking: true,
    vllmReady: false,
    teiReady: false,
  });
  const hasCompletedInitialCheck = useRef(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sendInProgressRef = useRef(false);

  const bothReady = serverStatus.vllmReady && serverStatus.teiReady;
  const canChat = !serverStatus.checking && bothReady;
  const canSend = useMemo(() => input.trim().length > 0 && !isSending && canChat, [input, isSending, canChat]);

  const hasConversation = messages.length > 0;

  const { memory, addTurnToMemory, recordRagMemory, buildRouterMemorySnapshot } = useChatMemory(messages);

  // ─── Poll server health every 5 s ─────────────────────────────────────────────
  const pollServers = useCallback(async (isInitial = false) => {
    // Only show the 'checking' spinner on the very first probe.
    // Background polls update status silently — this is critical to avoid
    // disabling the input on every tick (which would steal focus from the user).
    if (isInitial) {
      setServerStatus((s) => ({ ...s, checking: true }));
    }
    const status = await probeLocalServers();
    hasCompletedInitialCheck.current = true;
    setServerStatus({ checking: false, ...status });
  }, []);

  useEffect(() => {
    void pollServers(true); // initial — show loading
    const id = setInterval(() => void pollServers(false), 5000); // background — silent
    return () => clearInterval(id);
  }, [pollServers]);


  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: messages.length <= 2 ? "auto" : "smooth" });
  }, [messages.length]);

  function upsertMessage(id: string, next: Partial<ChatMessage>) {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }

  const { runRagSearch } = useRagSearch({ newId, setMessages, upsertMessage, addTurnToMemory, recordRagMemory });

  async function handleSend(nextPrompt?: string) {
    const prompt = (nextPrompt ?? input).trim();
    if (!prompt || !canChat) return;
    if (sendInProgressRef.current) return;
    sendInProgressRef.current = true;
    setIsSending(true);
    setInput("");

    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt };
    const pendingId = newId();
    const pendingAssistant: ChatMessage = { id: pendingId, role: "assistant", content: THINKING_TOKEN };
    setMessages((m) => [...m, userMsg, pendingAssistant]);
    addTurnToMemory({ role: "user", content: prompt });

    try {
      const routerMemory = buildRouterMemorySnapshot();
      const tRouteStart = performance.now();
      const plan = await routePrompt(prompt, { memory: routerMemory });
      const tRouteMs = performance.now() - tRouteStart;
      if (typeof console !== "undefined" && console.log) {
        console.log("[RAG timing] A. Thinking / routing:", Math.round(tRouteMs), "ms");
      }
      routerDebugGroup(`[router] stage2 execute primary=${plan.primary}`, () => {
        routerDebugLog("plan:", plan);
      });

      let reply = "";

      if (plan.primary === "RAG_SEARCH") {
        await runRagSearch({
          prompt,
          plan,
          preparingSearchToken: PREPARING_SEARCH_TOKEN,
          vectorSearchingToken: VECTOR_SEARCHING_TOKEN,
          pendingId,
        });
        return;
      } else if (plan.primary === "FOLLOW_UP") {
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
                    .map((h, i) => {
                      const titleLine = `${i + 1}. ${h.title}${h.year ? ` (${h.year})` : ""}`;
                      const absSnippet = (h.abstract ?? "").slice(0, 220).replace(/\n+/g, " ").trim();
                      return absSnippet ? `${titleLine}\n   Abstract: ${absSnippet}` : titleLine;
                    })
                    .join("\n\n");
                  return `RAG ${idx + 1}: query="${r.query}".\nPapers:\n${items}`;
                })
                .join("\n\n");

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
          const history = [...messages, userMsg]
            .slice(-10)
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

          reply = await answerMlQuestion({ history });
          upsertMessage(pendingId, { content: reply });
          addTurnToMemory({ role: "assistant", content: reply });
          return;
        } catch {
          const fallback = "Sorry — I couldn't complete that request.";
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
        reply = `I'm sorry, but I cannot answer your question "${prompt}" because it is not related to ML 😔 Could you please ask different questions?`;
        upsertMessage(pendingId, { content: reply });
        addTurnToMemory({ role: "assistant", content: reply });
        return;
      }
    } catch {
      const fallback = "Sorry — I couldn't complete that request.";
      upsertMessage(pendingId, { content: fallback });
      addTurnToMemory({ role: "assistant", content: fallback });
    } finally {
      sendInProgressRef.current = false;
      setIsSending(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] flex flex-col overflow-hidden px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex-1 min-h-0 mx-auto w-full max-w-6xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] flex flex-col">
        {/* Background gradient */}
        <div className="flex-1 min-h-0 rounded-[28px] bg-gradient-to-br from-slate-50 via-rose-50 to-violet-100 p-4 sm:p-6 border border-white/60 shadow-[0_20px_60px_rgba(15,23,42,0.10)] flex flex-col">
          {/* Glass card */}
          <div className="relative flex-1 min-h-0 rounded-[24px] bg-white/65 backdrop-blur-xl border border-white/70 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div
              className={[
                "flex-shrink-0 border-b border-white/60 transition-all duration-500 ease-in-out",
                hasConversation ? "px-4 sm:px-6 py-3" : "px-5 sm:px-7 pt-5 sm:pt-7 pb-4",
              ].join(" ")}
            >
              {/* Compact top bar */}
              <div className="grid grid-cols-3 items-center gap-3">
                <div />
                <div className="flex justify-center">
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

                    {/* Status pills */}
                    <div className="flex items-center gap-1.5 ml-1">
                      <StatusPill label="LFM2.5" ready={serverStatus.vllmReady} checking={serverStatus.checking} />
                      <StatusPill label="Embed" ready={serverStatus.teiReady} checking={serverStatus.checking} />
                    </div>
                  </div>
                </div>
                <div />
              </div>

              {/* Intro content (collapses when chat starts) */}
              <div
                className={[
                  "overflow-hidden transition-all duration-500 ease-in-out",
                  hasConversation ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none" : "max-h-[520px] opacity-100 translate-y-0",
                ].join(" ")}
              >
                <div className="flex flex-col items-center text-center">
                  <h1 className={`mt-4 text-2xl sm:text-4xl font-bold text-gray-900 ${playfairDisplay.className}`}>
                    Hi, I'm MLTree LLM Agent (Beta Mode)
                  </h1>
                  <p className="text-sm text-gray-600 mt-2 max-w-2xl">
                    Ask about papers, concepts, or how to use MLBench.
                  </p>

                  {/* Server status panel (shown only when not ready) */}
                  {!bothReady && (
                    <div className="mt-4 w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="text-sm font-semibold text-gray-900">
                          {serverStatus.checking ? "Checking model servers…" : "Waiting for model servers to be ready"}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            {serverStatus.checking ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 animate-pulse" />
                            ) : serverStatus.vllmReady ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                            )}
                            VLLM (LFM2.5)
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                            {serverStatus.checking ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 animate-pulse" />
                            ) : serverStatus.teiReady ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                            )}
                            TEI (Snowflake)
                          </div>
                        </div>
                        {!serverStatus.checking && !bothReady && (
                          <p className="text-xs text-gray-600">
                            Run <code className="font-mono bg-white/70 px-1 rounded">bash local.sh</code> to start the model stack, then wait for GPU warmup.
                          </p>
                        )}
                        <button
                          onClick={() => void pollServers(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-300 bg-white/60 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 12a8 8 0 0 1 14.93-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M20 12a8 8 0 0 1-14.93 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          Refresh status
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sample queries */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SAMPLE_QUERIES.map((q, idx) => {
                    const samplesDisabled = !canChat;
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
                        <div className="text-xs text-gray-700/80 mt-1">Try this</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="relative flex-1 min-h-0 px-4 sm:px-7 py-4 overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="min-h-full flex items-center justify-center py-4">
                    {bothReady ? (
                      <div className="text-center max-w-lg">
                        <div className="text-sm font-semibold text-gray-900">Start with a question</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Click a sample above, or ask your own. Messages scroll inside the card.
                        </div>
                      </div>
                    ) : (
                      <div className="text-center max-w-lg">
                        <div className="text-sm text-gray-500">Waiting for model servers to come online…</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isUser = m.role === "user";
                      const isPreparingSearch = m.role === "assistant" && m.content === PREPARING_SEARCH_TOKEN;
                      const isVectorSearching = m.role === "assistant" && m.content === VECTOR_SEARCHING_TOKEN;
                      const isThinking = m.role === "assistant" && m.content === THINKING_TOKEN;
                      const hasRagHits = m.role === "assistant" && Array.isArray(m.ragHits) && m.ragHits.length > 0;
                      return (
                        <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className={[
                              "w-fit max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm break-words text-[15px] sm:text-[16px] leading-7",
                              isUser
                                ? "text-white bg-gradient-to-br from-emerald-500 to-teal-500 font-bold"
                                : "text-gray-950 bg-gray-100 border border-gray-200",
                            ].join(" ")}
                          >
                            {isPreparingSearch ? (
                              <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 2a10 10 0 1 0 10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                                Preparing search…
                                <span className="inline-flex w-6 justify-start">
                                  <span className="animate-pulse">…</span>
                                </span>
                              </div>
                            ) : isVectorSearching ? (
                              <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 2a10 10 0 1 0 10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                                Searching papers
                                <span className="inline-flex w-6 justify-start">
                                  <span className="animate-pulse">…</span>
                                </span>
                              </div>
                            ) : isThinking ? (
                              <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M12 2a10 10 0 1 0 10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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
              </div>
            </div>

            {/* Composer */}
            <div className="flex-shrink-0 px-4 sm:px-7 py-4 border-t border-white/60 bg-white/50">
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
                    disabled={!canChat}
                    placeholder={
                      serverStatus.checking
                        ? "Checking model servers…"
                        : !bothReady
                          ? "Waiting for model servers to start…"
                          : "Ask MLBench anything…"
                    }
                    className="w-full h-12 px-4 rounded-2xl border border-white/70 bg-white/75 text-gray-900 font-normal text-[15px] leading-none focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-white placeholder:text-gray-500 disabled:bg-white/50"
                  />
                </div>

                <button
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className={[
                    "shrink-0 h-12 px-5 rounded-2xl text-sm leading-none font-semibold text-white shadow-sm transition-all",
                    canChat
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                      : "bg-gradient-to-r from-slate-400 to-slate-400",
                    !canSend ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {isSending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
