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



  // Local in-browser model configuration (Transformers.js v4 / WebGPU)
  // Chat/routing model. Use an ONNX-exported model ID for best results in the browser.
  transformersChatModel: process.env.NEXT_PUBLIC_TRANSFORMERS_CHAT_MODEL || "onnx-community/Llama-3.2-1B-Instruct",
  // Embedding model for RAG (must output 384-d vectors compatible with backend)
  transformersEmbedModel: process.env.NEXT_PUBLIC_TRANSFORMERS_EMBED_MODEL || "Snowflake/snowflake-arctic-embed-s",
  // Embedding dimension (must match backend vector dimension)
  embeddingDim: 384,

  // Preferred execution device for Transformers.js pipelines.
  // "webgpu" is fastest when available; "wasm" is the fallback.
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
