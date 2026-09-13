# syntax=docker/dockerfile:1
# ── Stage 1a: build-time deps (native) ────────────────────────────────────────
# Pinned to the native build platform -- `builder` below actually executes
# native code from here during `npm run build` (Tailwind v4's lightningcss
# engine), unlike sharp, which is build-time-inert. Installing target-arch
# (e.g. arm64) node_modules and then running them natively (e.g. amd64)
# fails with "Cannot find module '../lightningcss.linux-x64-musl.node'" --
# the native binary present doesn't match the host actually executing it.
FROM --platform=$BUILDPLATFORM node:20-alpine AS deps-build
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 1b: runtime deps (target arch) ──────────────────────────────────────
# Only used to source sharp's native binary for the final image (stage 3) --
# sharp is genuinely build-time-inert here (no local image imports/blur
# placeholders, and sharp$ is aliased to false client-side in next.config.ts).
FROM node:20-alpine AS deps-runtime
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
# Pinned to the native build platform, not the final target -- `npm run build`
# doesn't need to run under QEMU emulation. This was previously unpinned and
# ran under arm64 emulation for the arm64 leg of the multi-arch build, where
# `next/font`'s Google Fonts fetch intermittently failed with
# ETIMEDOUT/ENETUNREACH -- a QEMU network-stack issue, not a real outage.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps-build /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
# Pass them via --build-arg in CI (see mlbench-pipeline.yml).
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=""
ARG NEXT_PUBLIC_AI_SEARCH_MAX_COSINE_DISTANCE="0.30"
ARG NEXT_PUBLIC_AI_SEARCH_RESULT_LIMIT="10"
ARG NEXT_PUBLIC_ENV="production"
# Unset in production (same-origin ingress routing); only used for local
# container testing where frontend/API run on different ports.
ARG NEXT_PUBLIC_BACKEND_URL=""

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=$NEXT_PUBLIC_CLOUDFLARE_SITE_KEY
ENV NEXT_PUBLIC_AI_SEARCH_MAX_COSINE_DISTANCE=$NEXT_PUBLIC_AI_SEARCH_MAX_COSINE_DISTANCE
ENV NEXT_PUBLIC_AI_SEARCH_RESULT_LIMIT=$NEXT_PUBLIC_AI_SEARCH_RESULT_LIMIT
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV

RUN npm run build

# ── Stage 3: minimal production runner ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# standalone output contains only what the server needs at runtime
COPY --from=builder /app/public                        ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
# next/image optimization requires sharp native bindings (not always traced into standalone)
COPY --from=deps-runtime --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps-runtime --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
