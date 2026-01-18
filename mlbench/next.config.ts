import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Helps WebLLM performance by enabling cross-origin isolation (SharedArrayBuffer).
  // Safe for a standalone app, but be mindful if you embed cross-origin iframes.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // { key: "Cross-Origin-Embedder-Policy", value: "require-corp" }, // Relaxing for now to ensure compatibility
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
