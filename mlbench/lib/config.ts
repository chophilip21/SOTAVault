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



  // ── In-browser models (wllama / CPU multi-threaded WASM) ─────────────────
  // Primary source: repo-root config.ini → exported by local.sh as NEXT_PUBLIC_* vars.
  // Downloaded from Hugging Face when the user clicks "Download" on the AI chat page.
  wllamaChatModelId: process.env.NEXT_PUBLIC_WLLAMA_CHAT_MODEL_ID || "",
  wllamaChatFile: process.env.NEXT_PUBLIC_WLLAMA_CHAT_FILE || "",
  wllamaEmbedModelId: process.env.NEXT_PUBLIC_WLLAMA_EMBED_MODEL_ID || "",
  wllamaEmbedFile: process.env.NEXT_PUBLIC_WLLAMA_EMBED_FILE || "",
  // Embedding dimension (must match backend vector index dimension)
  embeddingDim: 384,
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
