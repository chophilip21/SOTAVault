import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy /api/vllm/* → local VLLM server (port 8000)
    // Proxy /api/tei/*  → local TEI server  (port 8001)
    // This avoids CORS issues and keeps model endpoints server-side.
    return [
      {
        source: "/api/vllm/:path*",
        destination: "http://localhost:8000/:path*",
      },
      {
        source: "/api/tei/:path*",
        destination: "http://localhost:8001/:path*",
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
        hostname: "lh*.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  ...(process.env.ALLOWED_DEV_ORIGINS
    ? { allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS.split(",") }
    : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Set a base CSP that includes unsafe-inline so Firebase Auth iframes can execute their inline handshake scripts.
            // In Next.js dev (Turbopack), if no CSP is provided, it sometimes enforces a strict nonce-based CSP that breaks Firebase.
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.gstatic.com https://*.google.com https://challenges.cloudflare.com; worker-src 'self' blob:; frame-src 'self' https://*.firebaseapp.com https://*.google.com https://challenges.cloudflare.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
