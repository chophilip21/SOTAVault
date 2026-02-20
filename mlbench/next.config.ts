import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Helps Transformers.js / ONNX Runtime performance by enabling cross-origin isolation (SharedArrayBuffer).
  // Safe for a standalone app, but be mindful if you embed cross-origin iframes.
  async headers() {
    return [
      {
        // Default: keep popups working site-wide (e.g. OAuth flows).
        // NOTE: This does NOT enable crossOriginIsolated / SharedArrayBuffer.
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        // Enable cross-origin isolation for local LLM page(s) only.
        // This makes `crossOriginIsolated === true` and enables `SharedArrayBuffer` in modern Chrome.
        // We prefer COEP: credentialless (more compatible with third-party assets than require-corp).
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
