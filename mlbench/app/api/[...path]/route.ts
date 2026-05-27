import { NextRequest } from "next/server";

/**
 * Catch-all proxy for /api/* → backend.
 *
 * In GKE, browser calls to /api/* are routed by the Ingress directly to the
 * API pod before they ever reach Next.js, so this handler is never invoked in
 * production.
 *
 * Locally (make launch-local), there is no Ingress, so browser calls to /api/*
 * land here and get forwarded to the backend container at localhost:8080.
 *
 * The more-specific route at /api/backend/[...path] still takes precedence for
 * any request that starts with /api/backend/.
 */

const BACKEND_ORIGIN =
  process.env.INTERNAL_BACKEND_URL ||
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:8080";

function toBackendUrl(req: NextRequest): URL {
  const prefix = "/api";
  const pathname = req.nextUrl.pathname;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  const backendPath = rest.startsWith("/") ? rest.slice(1) : rest;

  const url = new URL(`${BACKEND_ORIGIN.replace(/\/$/, "")}/${backendPath}`);
  url.search = req.nextUrl.search;
  return url;
}

function forwardHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  return headers;
}

async function proxy(req: NextRequest): Promise<Response> {
  const url = toBackendUrl(req);
  const headers = forwardHeaders(req);

  const init: RequestInit = {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
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
        hint: "Start the backend (e.g. `make launch-local`) or set INTERNAL_BACKEND_URL/BACKEND_URL/NEXT_PUBLIC_BACKEND_URL.",
      }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  }

  // Retry with trailing slash on 404 to avoid FastAPI 307 redirects.
  let finalUpstream = upstream;
  if (
    upstream.status === 404 &&
    (req.method === "GET" || req.method === "HEAD") &&
    !url.pathname.endsWith("/")
  ) {
    const urlWithSlash = new URL(url);
    urlWithSlash.pathname = `${url.pathname}/`;
    const retry = await fetch(urlWithSlash, init);
    if (retry.ok) finalUpstream = retry;
  }

  const respHeaders = new Headers(finalUpstream.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  if (finalUpstream.status >= 400) {
    respHeaders.set("cache-control", "no-store");
  }

  return new Response(finalUpstream.body, {
    status: finalUpstream.status,
    statusText: finalUpstream.statusText,
    headers: respHeaders,
  });
}

export const GET = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
export const POST = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
export const PUT = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
export const PATCH = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
export const OPTIONS = (req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) => (void ctx, proxy(req));
