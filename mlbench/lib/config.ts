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



  // WebLLM Model Configuration
  // Main model for chat/routing tasks
  webllmModel: process.env.NEXT_PUBLIC_WEBLLM_MODEL || "Llama-3.2-1B-Instruct-q4f32_1-MLC",
  // Embedding model for RAG (must output 384-d vectors compatible with backend)
  webllmEmbedModel: process.env.NEXT_PUBLIC_WEBLLM_EMBED_MODEL || "snowflake-arctic-embed-s-q0f32-MLC-b4",
  // Embedding dimension (must match backend vector dimension)
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
