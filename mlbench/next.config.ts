import type { NextConfig } from "next";
import path from "node:path";

// Resolve to wllama's pre-built ESM bundle (package ships TypeScript source as entry; Turbopack fails on it).
const wllamaEsmRel = path.join("node_modules", "@wllama", "wllama", "esm", "index.js");
const wllamaEsmAbs = path.resolve(process.cwd(), wllamaEsmRel);

const nextConfig: NextConfig = {
  turbopack: {
    // Point to ESM bundle so Turbopack never touches the package's index.ts (Turbopack fails on that .ts).
    resolveAlias: {
      "@wllama/wllama": "./node_modules/@wllama/wllama/esm/index.js",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@wllama/wllama": wllamaEsmAbs,
    };
    return config;
  },
  // COOP / COEP headers are set in middleware.ts (more reliable than next.config headers,
  // which can have ordering/override issues with overlapping source patterns).
  // This block is kept as a production fallback for environments that skip middleware.
  async headers() {
    return [
      {
        source: "/ai-chat/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh*.googleusercontent.com", // Wildcard to catch lh4, lh5 etc.
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com", // Safer general catch
      },
    ],
  },
};

export default nextConfig;
