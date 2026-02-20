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



  // ── In-browser model settings (Transformers.js v4 / WebGPU) ──────────────
  // Primary source: repo-root config.ini  →  exported by local.sh as NEXT_PUBLIC_* vars.
  // The strings below are last-resort fallbacks only (e.g. CI / Vercel deployments).
  transformersChatModel: process.env.NEXT_PUBLIC_TRANSFORMERS_CHAT_MODEL || "HuggingFaceTB/SmolLM2-360M-Instruct",
  transformersChatDtype: process.env.NEXT_PUBLIC_TRANSFORMERS_CHAT_DTYPE || "q4",
  transformersEmbedModel: process.env.NEXT_PUBLIC_TRANSFORMERS_EMBED_MODEL || "Snowflake/snowflake-arctic-embed-s",
  transformersEmbedDtype: process.env.NEXT_PUBLIC_TRANSFORMERS_EMBED_DTYPE || "fp32",
  // Embedding dimension (must match backend vector index dimension)
  embeddingDim: 384,
  transformersDevice: process.env.NEXT_PUBLIC_TRANSFORMERS_DEVICE || "webgpu",
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
