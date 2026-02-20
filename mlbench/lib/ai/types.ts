"use client";

export type RouterMemoryContext = {
  summary?: string | null;
  recentTurns?: { role: "user" | "assistant"; content: string }[];
  recentRag?: { query: string; titles: string[] }[];
};

