/**
 * Backend base URL helper.
 *
 * - In the browser: use our same-origin proxy to avoid mixed-content when the site is served over HTTPS.
 * - On the server (Next.js route handlers / server components): call the backend directly.
 */
export function getBackendBaseUrl(): string {
  // Client-side: avoid http://... mixed content by proxying through Next on the same origin.
  if (typeof window !== "undefined") return `${window.location.origin}/api/backend`;

  // Server-side: talk to backend directly.
  return (
    process.env.INTERNAL_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    ""
  );
}


