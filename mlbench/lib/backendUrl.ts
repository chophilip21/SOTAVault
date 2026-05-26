/**
 * Backend base URL helper.
 *
 * - In the browser: requests go same-origin to /api/*, which the GCE Ingress
 *   routes to the backend service. FastAPI's StripApiPrefixMiddleware removes
 *   the /api prefix before route matching.
 * - On the server (SSR / Route Handlers): call the backend directly in-cluster
 *   via INTERNAL_BACKEND_URL to bypass the Ingress entirely.
 */
export function getBackendBaseUrl(): string {
  // Client-side: same-origin /api keeps requests HTTPS and avoids CORS.
  if (typeof window !== "undefined") return `${window.location.origin}/api`;

  // Server-side: direct in-cluster call; no prefix needed.
  return (
    process.env.INTERNAL_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    ""
  );
}


