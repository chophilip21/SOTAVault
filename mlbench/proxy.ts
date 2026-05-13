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
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const isAiChat = request.nextUrl.pathname.startsWith('/ai-chat');

  if (isAiChat) {
    // Enable isolation for WASM/SharedArrayBuffer on /ai-chat
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  } else {
    // For Firebase Auth, use same-origin-allow-popups so the window.close() call works.
    // Do NOT set COEP credentialless here, because that breaks the Firebase iframe.
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    response.headers.delete("Cross-Origin-Embedder-Policy");
  }

  // Strip Next.js Turbopack's overly strict dev CSP that breaks Firebase's about:srcdoc iframes.
  // We rely on the more permissive CSP defined in next.config.ts.
  response.headers.delete("Content-Security-Policy");
  response.headers.delete("Require-Trusted-Types-For");

  return response;
}

export const config = {
  // Run on all routes to explicitly clear cached COOP headers
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
