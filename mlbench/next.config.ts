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
};

export default nextConfig;
