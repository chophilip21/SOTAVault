import { NextRequest } from "next/server";

const BACKEND_ORIGIN =
  process.env.INTERNAL_BACKEND_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8080";

function toBackendUrl(req: NextRequest) {
  // Preserve the original path (including trailing slash) to avoid FastAPI 307 redirects
  // that would otherwise make `res.ok === false` for callers.
  const prefix = "/api/backend";
  const pathname = req.nextUrl.pathname;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const backendPath = rest.startsWith("/") ? rest.slice(1) : rest;

  const url = new URL(`${BACKEND_ORIGIN.replace(/\/$/, "")}/${backendPath}`);
  url.search = req.nextUrl.search; // preserve query string
  return url;
}

function forwardHeaders(req: NextRequest) {
  const headers = new Headers(req.headers);
  // Remove hop-by-hop / problematic headers.
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  return headers;
}

async function proxy(req: NextRequest) {
  const url = toBackendUrl(req);
  const headers = forwardHeaders(req);

  const init: RequestInit = {
    method: req.method,
    headers,
    // Only pass a body for methods that can have one.
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
    // Follow upstream redirects (FastAPI commonly redirects when trailing slash mismatches).
    // This makes client-side fetches much more robust.
    redirect: "follow",
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (e: any) {
    const detail = e?.message ? String(e.message) : String(e);
    return new Response(
      JSON.stringify({
        error: "Backend is unreachable",
        backendOrigin: BACKEND_ORIGIN,
        url: url.toString(),
        detail,
        hint:
          "Start the backend (e.g. `./local.sh`) or set INTERNAL_BACKEND_URL/BACKEND_URL/NEXT_PUBLIC_BACKEND_URL for the frontend.",
      }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }
  // FastAPI can be configured to not redirect on missing trailing slashes.
  // Some Next deployments normalize away trailing slashes on incoming requests.
  // If we get a 404, retry once with a trailing slash (GET/HEAD only).
  let finalUpstream = upstream;
  if (
    upstream.status === 404 &&
    (req.method === "GET" || req.method === "HEAD") &&
    !url.pathname.endsWith("/")
  ) {
    const urlWithSlash = new URL(url);
    urlWithSlash.pathname = `${url.pathname}/`;
    const retry = await fetch(urlWithSlash, init);
    if (retry.ok) {
      finalUpstream = retry;
    }
  }

  // Copy upstream response headers (with a couple safe removals).
  const respHeaders = new Headers(finalUpstream.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  // Never allow clients/CDNs to cache error responses (prevents "sticky" 404s in the browser).
  if (finalUpstream.status >= 400) {
    respHeaders.set("cache-control", "no-store");
  }

  return new Response(finalUpstream.body, {
    status: finalUpstream.status,
    statusText: finalUpstream.statusText,
    headers: respHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}
export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  void ctx;
  return proxy(req);
}


