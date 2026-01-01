import { useEffect, useState } from "react";
import { getWebLLMEngine, type RouterMemoryContext } from "@/lib/webllmAgent";
import type { ChatMessage, MemoryState, RagMemoryEntry } from "./types";

const MEMORY_STORAGE_KEY = "mltree-ai-chat-memory-v1";
const MEMORY_RECENT_TURNS_LIMIT = 10;
const MEMORY_RAG_LIMIT = 3;
const MEMORY_SUMMARIZE_THRESHOLD = 12;
const MEMORY_SUMMARIZE_GAP = 4;
const EMPTY_MEMORY: MemoryState = { summary: null, recentTurns: [], ragHistory: [], lastSummarizedCount: 0 };

async function summarizeConversation(
  currentMessages: ChatMessage[],
  currentSummary: string | null,
  ragHistory: RagMemoryEntry[]
): Promise<string> {
  const engine = await getWebLLMEngine();
  const recentTurns = currentMessages.slice(-10).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
  const ragText =
    ragHistory
      .slice(0, 2)
      .map((r, idx) => {
        const titles = r.hits
          .slice(0, 5)
          .map((h, i) => `${i + 1}. ${h.title}${h.year ? ` (${h.year})` : ""}`)
          .join("; ");
        return `Recent RAG ${idx + 1}: query="${r.query}". Papers: ${titles}`;
      })
      .join("\n") || "No recent RAG results.";

  const system = [
    "You are a memory compressor for a chat assistant.",
    "Produce a concise summary (<= 180 words) of the conversation so far.",
    "Preserve key user intents, assistant answers, and any referenced papers.",
    "Prefer bullet-ish sentences separated by newline. Do not fabricate.",
  ].join("\n");

  const user = [
    currentSummary ? `Existing summary:\n${currentSummary}\n` : "No existing summary.",
    "Recent turns:",
    recentTurns.join("\n"),
    "",
    "Recent RAG context:",
    ragText,
    "",
    "Return only the updated summary text.",
  ].join("\n");

  const res = await (engine as any).chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    top_p: 0.9,
    max_tokens: 220,
  });

  return res.choices?.[0]?.message?.content?.trim() || currentSummary || "";
}

function buildRouterMemorySnapshotBase(
  memory: MemoryState,
  extraTurn?: { role: "user" | "assistant"; content: string }
): RouterMemoryContext {
  const recent = extraTurn ? [...memory.recentTurns, extraTurn].slice(-MEMORY_RECENT_TURNS_LIMIT) : memory.recentTurns;
  return {
    summary: memory.summary,
    recentTurns: recent,
    recentRag: memory.ragHistory.map((r) => ({
      query: r.query,
      titles: r.hits.slice(0, 5).map((h) => h.title),
    })),
  };
}

export function useChatMemory(messages: ChatMessage[]) {
  const [memory, setMemory] = useState<MemoryState>(EMPTY_MEMORY);
  const [isSummarizingMemory, setIsSummarizingMemory] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<MemoryState>;
      setMemory((prev) => ({
        ...prev,
        ...parsed,
        summary: parsed.summary ?? null,
        recentTurns: Array.isArray(parsed.recentTurns) ? parsed.recentTurns.slice(-MEMORY_RECENT_TURNS_LIMIT) : [],
        ragHistory: Array.isArray(parsed.ragHistory) ? parsed.ragHistory.slice(0, MEMORY_RAG_LIMIT) : [],
        lastSummarizedCount: parsed.lastSummarizedCount ?? 0,
      }));
    } catch (err) {
      console.warn("Failed to load chat memory from storage", err);
    }
  }, []);

  // Persist to storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memory));
    } catch (err) {
      console.warn("Failed to persist chat memory", err);
    }
  }, [memory]);

  // Summarize when chat grows
  useEffect(() => {
    const shouldSummarize =
      messages.length >= MEMORY_SUMMARIZE_THRESHOLD &&
      messages.length >= memory.lastSummarizedCount + MEMORY_SUMMARIZE_GAP &&
      !isSummarizingMemory;
    if (!shouldSummarize) return;

    let cancelled = false;
    setIsSummarizingMemory(true);
    summarizeConversation(messages, memory.summary, memory.ragHistory)
      .then((summary) => {
        if (cancelled) return;
        setMemory((prev) => ({
          ...prev,
          summary,
          lastSummarizedCount: messages.length,
        }));
      })
      .catch((err) => console.warn("Failed to summarize conversation", err))
      .finally(() => {
        if (!cancelled) setIsSummarizingMemory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [messages, memory.lastSummarizedCount, memory.ragHistory, memory.summary, isSummarizingMemory]);

  const addTurnToMemory = (turn: { role: "user" | "assistant"; content: string }) => {
    setMemory((prev) => {
      const recent = [...prev.recentTurns, turn].slice(-MEMORY_RECENT_TURNS_LIMIT);
      return { ...prev, recentTurns: recent };
    });
  };

  const recordRagMemory = (entry: RagMemoryEntry) => {
    setMemory((prev) => {
      const next = [entry, ...prev.ragHistory].slice(0, MEMORY_RAG_LIMIT);
      return { ...prev, ragHistory: next };
    });
  };

  const buildRouterMemorySnapshot = (extraTurn?: { role: "user" | "assistant"; content: string }) =>
    buildRouterMemorySnapshotBase(memory, extraTurn);

  return {
    memory,
    addTurnToMemory,
    recordRagMemory,
    buildRouterMemorySnapshot,
  };
}

