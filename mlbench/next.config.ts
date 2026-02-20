import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
