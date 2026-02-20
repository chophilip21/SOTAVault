import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets Cross-Origin security headers at the middleware layer.
 *
 * next.config.ts headers() has a known limitation: when a broad rule (/:path*)
 * and a specific rule (/ai-chat/:path*) both set the same header key, the broad
 * rule can win in some Next.js versions, leaving COOP as "same-origin-allow-popups"
 * instead of "same-origin". That prevents crossOriginIsolated from becoming true,
 * which disables SharedArrayBuffer and forces ONNX Runtime into single-threaded WASM.
 *
 * Middleware runs after routing but before page rendering and always wins.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ai-chat")) {
    // Full cross-origin isolation: enables SharedArrayBuffer + multi-threaded WASM.
    // Required for reliable WebGPU performance in ONNX Runtime Web.
    // COEP: credentialless is more compatible than require-corp (no CORP headers needed
    // on third-party assets; credentials are simply stripped for cross-origin requests).
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  } else {
    // Allow OAuth / Firebase popup flows on all other pages.
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static assets.
  // Static assets served from /_next/ are same-origin and don't need COEP.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
