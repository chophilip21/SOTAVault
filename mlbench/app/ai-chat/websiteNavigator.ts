"use client";

import type { RoutePlan } from "@/lib/webllmAgent";

type WebsiteTopic =
  | "NAVIGATE"
  | "LOGIN"
  | "PROFILE"
  | "BOOKMARKS"
  | "PAPERS"
  | "BENCHMARK"
  | "CONFERENCE"
  | "AI_CHAT"
  | "DATA_SOURCES"
  | "PRIVACY"
  | "TERMS"
  | "TROUBLESHOOT"
  | "UNKNOWN";

function norm(s: string) {
  return s.toLowerCase();
}

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

function isSensitiveOrInternal(prompt: string): boolean {
  const p = norm(prompt);
  // Keep this conservative: refuse anything that looks like code/security/internal access.
  const sensitive = [
    "source code",
    "repo",
    "repository",
    "github",
    "gitlab",
    "internal",
    "architecture",
    "database schema",
    "schema",
    "api key",
    "secret",
    "token",
    "credentials",
    "password",
    "vulnerability",
    "exploit",
    "bypass",
    "hack",
    "security flaw",
    "pentest",
    "admin",
    "root access",
    "business model",
    "revenue",
    "profit",
    "pricing strategy",
  ];
  return includesAny(p, sensitive);
}

function topicFromSecondary(plan?: RoutePlan): WebsiteTopic {
  const sec = plan?.secondary || [];
  if (sec.includes("WEBSITE_PRIVACY")) return "PRIVACY";
  if (sec.includes("WEBSITE_TERMS")) return "TERMS";
  if (sec.includes("WEBSITE_DATA_SOURCES")) return "DATA_SOURCES";
  if (sec.includes("WEBSITE_BOOKMARKS")) return "BOOKMARKS";
  if (sec.includes("WEBSITE_PROFILE")) return "PROFILE";
  if (sec.includes("WEBSITE_LOGIN")) return "LOGIN";
  if (sec.includes("WEBSITE_PAPERS")) return "PAPERS";
  if (sec.includes("WEBSITE_BENCHMARK")) return "BENCHMARK";
  if (sec.includes("WEBSITE_CONFERENCE")) return "CONFERENCE";
  if (sec.includes("WEBSITE_AI_CHAT")) return "AI_CHAT";
  if (sec.includes("WEBSITE_TROUBLESHOOT")) return "TROUBLESHOOT";
  if (sec.includes("WEBSITE_NAVIGATE")) return "NAVIGATE";
  return "UNKNOWN";
}

function topicHeuristic(prompt: string): WebsiteTopic {
  const p = norm(prompt);
  if (includesAny(p, ["privacy", "gdpr", "data retention", "cookies"])) return "PRIVACY";
  if (includesAny(p, ["terms", "conditions", "tos", "license"])) return "TERMS";
  if (includesAny(p, ["where does the data", "data source", "how did you get the data", "scrape", "crawl"])) return "DATA_SOURCES";
  if (includesAny(p, ["bookmark", "saved", "save this", "favorites"])) return "BOOKMARKS";
  if (includesAny(p, ["profile", "account settings", "edit profile"])) return "PROFILE";
  if (includesAny(p, ["login", "log in", "sign in", "sign-in", "auth"])) return "LOGIN";
  if (includesAny(p, ["papers page", "papers", "search papers", "filter papers"])) return "PAPERS";
  if (includesAny(p, ["benchmark", "benchmarks"])) return "BENCHMARK";
  if (includesAny(p, ["conference", "conferences"])) return "CONFERENCE";
  if (includesAny(p, ["ai chat", "chat", "webgpu"])) return "AI_CHAT";
  if (includesAny(p, ["error", "not working", "can't", "cannot", "issue", "broken"])) return "TROUBLESHOOT";
  if (includesAny(p, ["how do i use", "how to use", "where is", "navigate", "find"])) return "NAVIGATE";
  return "UNKNOWN";
}

function linksBlock(lines: Array<{ label: string; path: string }>): string {
  return lines.map((l) => `- **${l.label}**: \`${l.path}\``).join("\n");
}

export function answerWebsiteQuestion(prompt: string, plan?: RoutePlan): string {
  if (isSensitiveOrInternal(prompt)) {
    return [
      "I can help with **how to use MLBench**, but I can’t help with requests for internal code, secrets, vulnerabilities, or non-public business logic.",
      "",
      "If you’re looking for official policies, please see:",
      linksBlock([
        { label: "Privacy Policy", path: "/privacy" },
        { label: "Terms & Conditions", path: "/terms" },
      ]),
    ].join("\n");
  }

  const topic = topicFromSecondary(plan) !== "UNKNOWN" ? topicFromSecondary(plan) : topicHeuristic(prompt);

  const nav = [
    "Here’s the quickest way to get around MLBench:",
    "",
    linksBlock([
      { label: "Home", path: "/" },
      { label: "Papers", path: "/papers" },
      { label: "Benchmark", path: "/benchmark" },
      { label: "Conference", path: "/conference" },
      { label: "AI Chat", path: "/ai-chat" },
      { label: "Profile (bookmarks/account)", path: "/profile" },
    ]),
    "",
    "If a page says **login required**, click the **Login** button (top-right) first.",
  ].join("\n");

  const clarify = [
    "I can help — which part of MLBench are you asking about?",
    "",
    linksBlock([
      { label: "Papers (search/filter papers)", path: "/papers" },
      { label: "Benchmark (browse benchmarks)", path: "/benchmark" },
      { label: "Conference (browse conferences)", path: "/conference" },
      { label: "AI Chat (ask for papers / ML Q&A)", path: "/ai-chat" },
      { label: "Profile (bookmarks/account)", path: "/profile" },
      { label: "Privacy Policy", path: "/privacy" },
      { label: "Terms & Conditions", path: "/terms" },
    ]),
    "",
    "Reply with one of: **papers**, **benchmark**, **conference**, **ai chat**, **profile**, **privacy**, or **terms**.",
  ].join("\n");

  switch (topic) {
    case "PRIVACY":
      return [
        "For privacy and data-handling details, please refer to the official policy page:",
        "",
        linksBlock([{ label: "Privacy Policy", path: "/privacy" }]),
      ].join("\n");
    case "TERMS":
      return [
        "For usage terms and restrictions, please refer to:",
        "",
        linksBlock([{ label: "Terms & Conditions", path: "/terms" }]),
      ].join("\n");
    case "DATA_SOURCES":
      return [
        "At a high level, MLBench indexes research metadata from **publicly available sources**.",
        "For policy details (data collection/retention, third-party links, etc.), the authoritative references are:",
        "",
        linksBlock([
          { label: "Privacy Policy", path: "/privacy" },
          { label: "Terms & Conditions", path: "/terms" },
        ]),
        "",
        "If you tell me whether you mean **paper metadata** vs **your account data**, I can point you to the right section.",
      ].join("\n");
    case "LOGIN":
      return [
        "To access protected pages, you’ll need to log in:",
        "- Click **Login** (top-right).",
        "- After logging in, retry the page (Papers/Benchmark/Conference/AI Chat).",
        "",
        "If login seems stuck, try refreshing the page.",
      ].join("\n");
    case "PROFILE":
      return [
        "Your account settings and saved items live under **Profile**:",
        "",
        linksBlock([{ label: "Profile", path: "/profile" }]),
        "",
        "Inside Profile you can edit your info and manage your account.",
      ].join("\n");
    case "BOOKMARKS":
      return [
        "To view your saved papers:",
        "- Open **Profile**",
        "- Go to the **Bookmarks** tab",
        "",
        linksBlock([{ label: "Profile", path: "/profile" }]),
      ].join("\n");
    case "PAPERS":
      return [
        "On **Papers**, you can:",
        "- Search papers by title",
        "- Filter by domain/task",
        "- Open a paper to view details",
        "",
        linksBlock([{ label: "Papers", path: "/papers" }]),
      ].join("\n");
    case "BENCHMARK":
      return [
        "On **Benchmark**, you can browse benchmarks and filter/search within them.",
        "",
        linksBlock([{ label: "Benchmark", path: "/benchmark" }]),
      ].join("\n");
    case "CONFERENCE":
      return [
        "On **Conference**, you can browse conferences and upcoming dates (and open conference websites from the detail view).",
        "",
        linksBlock([{ label: "Conference", path: "/conference" }]),
      ].join("\n");
    case "AI_CHAT":
      return [
        "In **AI Chat**, you can:",
        "- Ask for paper recommendations (RAG search)",
        "- Ask ML concept questions",
        "- Ask follow-ups about prior results",
        "",
        "Note: AI Chat requires **WebGPU** (Chrome/Edge recommended).",
        "",
        linksBlock([{ label: "AI Chat", path: "/ai-chat" }]),
      ].join("\n");
    case "TROUBLESHOOT":
      return [
        "A few common fixes:",
        "- If a page is blocked, **log in** first.",
        "- If AI Chat says WebGPU unavailable, try **Chrome/Edge** and ensure WebGPU is enabled.",
        "- If search results look off, try rephrasing with more specific keywords.",
        "",
        "Tell me what page you’re on and what you see (error text), and I’ll narrow it down.",
      ].join("\n");
    case "NAVIGATE":
      return nav;
    case "UNKNOWN":
    default:
      return clarify;
  }
}


