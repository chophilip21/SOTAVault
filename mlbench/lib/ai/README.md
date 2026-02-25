# AI Chat & Router Flow

This directory contains the frontend AI stack for MLBench. All inference runs on **local GPU servers** started by `bash local.sh` (via `docker-compose.demo.yml`):

| Service | Model | Port | Purpose |
|---------|-------|------|---------|
| **VLLM** | `LFM2.5-1.2B-Instruct-AWQ` | 8000 | Chat, routing (Layer 1 & 2), follow-up answers, summarisation |
| **TEI**  | `snowflake-arctic-embed-s`   | 8001 | Text embeddings for vector search (RAG) |

The Next.js dev server proxies:
- `/api/vllm/*` → `http://localhost:8000`
- `/api/tei/*`  → `http://localhost:8001`

---

## High-level flow

```
User input
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Router (LFM2.5 via VLLM, JSON-only)                    │
│ Predict one of: ml_related | unrelated | website_related | ambiguous │
└─────────────────────────────────────────────────────────────────┘
    │
    ├── unrelated ──────────────► Template response
    │
    ├── website_related ────────► Template response (deterministic)
    │
    ├── ambiguous ──────────────► LFM2.5 with user input only
    │
    └── ml_related ──────────────► LAYER 2
                                        │
                    ┌───────────────────┴───────────────────┐
                    │ LAYER 2 — Router (LFM2.5, same server)    │
                    │ Predict: call_rag | no_rag                 │
                    └───────────────────────────────────────────┘
                                        │
                    ├── no_rag ────────► LFM2.5 with user input only
                    │
                    └── call_rag ──────► Extract rag_keyword
                                        → Embed via TEI → Vector search API → RAG hits
                                        → LFM2.5 with user input + RAG context
```

---

## File map

| File | Role |
|------|------|
| `localServerRuntime.ts` | HTTP clients for VLLM (chat/router) and TEI (embed). Health check helpers. |
| `agent.ts` | Public API: `routePrompt`, `embedQuery`, `probeLocalServers`. |
| `chains.ts` | LangChain `PromptTemplate` helpers; router Layer 1/2 and chain builders. |
| `types.ts` | Router memory context. |

---

## Status UI

The AI chat page polls both servers every 5 seconds and shows:
- 🟢 Green pill: server healthy
- 🔴 Red pill: server not reachable (still starting or `local.sh` not running)
