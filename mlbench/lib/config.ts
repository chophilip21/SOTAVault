/**
 * Application configuration loaded from environment variables
 * This ensures ports and URLs are not hardcoded
 */

const DEFAULT_AI_SEARCH_MAX_COSINE_DISTANCE = 0.3;
const DEFAULT_AI_SEARCH_RESULT_LIMIT = 10;

function parseEnvFloat(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseEnvInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

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

  // Embedding dimension for POST /search/vector (must match backend index)
  embeddingDim: 256,

  // AI Search — semantic vector RAG (see repo-root secret.env: AI_SEARCH_*)
  aiSearch: {
    /** Max cosine distance to show (0–2; lower = stricter relevance). */
    maxCosineDistance: parseEnvFloat(
      process.env.NEXT_PUBLIC_AI_SEARCH_MAX_COSINE_DISTANCE,
      DEFAULT_AI_SEARCH_MAX_COSINE_DISTANCE,
      0,
      2,
    ),
    /** Firestore find_nearest limit per query. */
    resultLimit: parseEnvInt(
      process.env.NEXT_PUBLIC_AI_SEARCH_RESULT_LIMIT,
      DEFAULT_AI_SEARCH_RESULT_LIMIT,
      1,
      50,
    ),
  },
};

// Validate required config in local environment
if (config.isLocal) {
  if (!config.firebase.apiKey || !config.firebase.projectId) {
    console.warn("Warning: Firebase configuration may be missing. Check your repo-root .env (via scripts/local.sh) or your environment variables.");
  }
  if (!config.backendUrl) {
    console.warn("Warning: Backend URL is not configured. Check your repo-root .env (via scripts/local.sh) or your environment variables.");
  }
}
