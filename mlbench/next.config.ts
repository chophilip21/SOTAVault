import type { NextConfig } from "next";

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
};

export default nextConfig;
