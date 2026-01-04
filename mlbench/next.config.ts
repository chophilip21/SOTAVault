import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Load environment variables from backend/.env
 * This allows the frontend to use a single source of truth for configuration
 */
function loadBackendEnv(): Record<string, string> {
  // Resolve path relative to this config file (mlbench/next.config.ts)
  // Goes up one level to project root, then into backend/.env
  const backendEnvPath = join(__dirname, "..", "backend", ".env");
  const env: Record<string, string> = {};

  try {
    const content = readFileSync(backendEnvPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Only expose NEXT_PUBLIC_* variables to the browser
        if (key.startsWith("NEXT_PUBLIC_")) {
          env[key] = value;
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not load backend/.env: ${error}`);
    console.warn("   Falling back to default Next.js env file loading");
  }

  return env;
}

const backendEnv = loadBackendEnv();

const nextConfig: NextConfig = {
  // Helps WebLLM performance by enabling cross-origin isolation (SharedArrayBuffer).
  // Safe for a standalone app, but be mindful if you embed cross-origin iframes.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
  // Expose environment variables from backend/.env
  env: backendEnv,
};

export default nextConfig;
