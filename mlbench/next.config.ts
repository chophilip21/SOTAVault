import type { NextConfig } from "next";

/** CSP for Firebase + Transformers.js (ORT wasm loads from jsDelivr; models from Hugging Face Hub). */
const contentSecurityPolicy = [
  "default-src 'self'",
  [
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "https://cdn.jsdelivr.net",
    "https://apis.google.com",
    "https://*.firebaseapp.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://challenges.cloudflare.com",
  ].join(" "),
  "worker-src 'self' blob:",
  [
    "connect-src 'self'",
    "https://huggingface.co",
    "https://*.huggingface.co",
    "https://*.xethub.hf.co",
    "https://cdn.jsdelivr.net",
    "https://apis.google.com",
    "https://*.googleapis.com",
    "https://*.firebaseapp.com",
    "https://*.gstatic.com",
    "https://challenges.cloudflare.com",
    "https://tiles.openfreemap.org",
  ].join(" "),
  "frame-src 'self' https://*.firebaseapp.com https://*.google.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "img-src 'self' data: blob: https:",
  [
    "font-src 'self' data:",
    "https://cdnjs.cloudflare.com",
    "https://fonts.gstatic.com",
  ].join(" "),
].join("; ");

const nextConfig: NextConfig = {
  // standalone output produces a self-contained server.js used by the Docker image.
  // next dev is unaffected by this setting.
  output: "standalone",
  serverExternalPackages: ["@huggingface/transformers"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        sharp$: false,
        "onnxruntime-node$": false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
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
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
