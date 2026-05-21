/**
 * Application configuration loaded from environment variables
 * This ensures ports and URLs are not hardcoded
 */

export const config = {
  // Environment
  env: process.env.NEXT_PUBLIC_ENV || "production",
  isLocal: process.env.NEXT_PUBLIC_ENV === "local",

  // Firebase Configuration
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  },

  // Backend API
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "",

  // ── Local model servers (started by `bash local.sh` via docker-compose.demo.yml) ──
  // VLLM serves LFM2.5-1.2B-Instruct-AWQ on port 8000 (OpenAI-compatible).
  // TEI  serves snowflake-arctic-embed-s      on port 8001 (HuggingFace TEI).
  // The Next.js dev server proxies /api/vllm/* → localhost:8000
  //                                /api/tei/*  → localhost:8001
  vllmUrl: process.env.NEXT_PUBLIC_VLLM_URL || "http://localhost:8000",
  teiUrl: process.env.NEXT_PUBLIC_TEI_URL || "http://localhost:8001",

  // Embedding dimension (must match backend vector index dimension)
  embeddingDim: 256,
};

// Validate required config in local environment
if (config.isLocal) {
  if (!config.firebase.apiKey || !config.firebase.projectId) {
    console.warn("Warning: Firebase configuration may be missing. Check your repo-root .env (via ./local.sh) or your environment variables.");
  }
  if (!config.backendUrl) {
    console.warn("Warning: Backend URL is not configured. Check your repo-root .env (via ./local.sh) or your environment variables.");
  }
}
