import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets Cross-Origin security headers at the middleware layer.
 *
 * We set COOP: same-origin + COEP: credentialless on all routes so that the
 * initial document load is always cross-origin isolated. That way SharedArrayBuffer
 * and multi-threaded WASM work on /ai-chat even when the user navigates there
 * from another page (client-side nav does not reload the document).
 * next.config.ts headers() can have ordering issues; middleware always wins.
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static assets.
  // Static assets served from /_next/ are same-origin and don't need COEP.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
