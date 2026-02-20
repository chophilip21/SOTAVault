import { useEffect, useRef, useState } from "react";
import type { RouterMemoryContext } from "@/lib/ai/types";
import { summarizeMemory } from "@/lib/ai/chains";
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
  const summary = await summarizeMemory({
    existingSummary: currentSummary,
    recentTurns: currentMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    ragText,
  });
  return summary || currentSummary || "";
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
  const isSummarizingRef = useRef(false);

  // Load from storage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<MemoryState>;
      queueMicrotask(() => {
        setMemory((prev) => ({
          ...prev,
          ...parsed,
          summary: parsed.summary ?? null,
          recentTurns: Array.isArray(parsed.recentTurns) ? parsed.recentTurns.slice(-MEMORY_RECENT_TURNS_LIMIT) : [],
          ragHistory: Array.isArray(parsed.ragHistory) ? parsed.ragHistory.slice(0, MEMORY_RAG_LIMIT) : [],
          lastSummarizedCount: parsed.lastSummarizedCount ?? 0,
        }));
      });
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
      !isSummarizingRef.current;
    if (!shouldSummarize) return;

    let cancelled = false;
    isSummarizingRef.current = true;
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
        if (!cancelled) isSummarizingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [messages, memory.lastSummarizedCount, memory.ragHistory, memory.summary]);

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

