import { NextResponse, type NextRequest } from "next/server";

/**
 * Sets Cross-Origin security headers at the middleware layer.
 * Firebase Auth needs same-origin-allow-popups; CSP is defined in next.config.ts.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.headers.delete("Cross-Origin-Embedder-Policy");

  // Strip Next.js Turbopack's overly strict dev CSP that breaks Firebase's about:srcdoc iframes.
  // We rely on the more permissive CSP defined in next.config.ts.
  response.headers.delete("Content-Security-Policy");
  response.headers.delete("Require-Trusted-Types-For");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
