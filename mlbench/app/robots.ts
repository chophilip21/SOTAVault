import type { MetadataRoute } from "next";

/**
 * Crawler policy — blocks AI/scraper bots entirely; limits paths for all others.
 * Public paper/dataset pages remain indexable for search engines.
 */
export default function robots(): MetadataRoute.Robots {
  const aiScraperBots = [
    "GPTBot",
    "ChatGPT-User",
    "CCBot",
    "Google-Extended",
    "anthropic-ai",
    "ClaudeBot",
    "Bytespider",
    "Amazonbot",
    "FacebookBot",
    "meta-externalagent",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/profile", "/bookmarks", "/api/"],
      },
      ...aiScraperBots.map((userAgent) => ({
        userAgent,
        disallow: ["/"],
      })),
    ],
  };
}
