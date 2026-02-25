# AI Chat & Router Flow

This directory contains the in-browser AI stack: router, embeddings, and chat. The flow uses **three wllama models** configured via environment variables:

| Variable | Purpose |
|----------|--------|
| `NEXT_PUBLIC_WLLAMA_ROUTER_MODEL_ID` | Fast router (e.g. Qwen3) — Layer 1 & 2 classification |
| `NEXT_PUBLIC_WLLAMA_CHAT_MODEL_ID` | Main chat model (e.g. LFM2.5) — final answers |
| `NEXT_PUBLIC_WLLAMA_EMBED_MODEL_ID` | Embeddings — used only when RAG is invoked |

---

## High-level flow

```
User input
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Router (Qwen3, with "/no_think" on user query)          │
│ Predict one of: ml_related | unrelated | website_related | ambiguous │
└─────────────────────────────────────────────────────────────────┘
    │
    ├── unrelated ──────────────► Template response (e.g. "I only answer ML questions")
    │
    ├── website_related ────────► Template response (e.g. "Where we get data", "About MLBench")
    │
    ├── ambiguous ──────────────► LFM2.5 (chat model) with user input only
    │
    └── ml_related ──────────────► LAYER 2
                                        │
                    ┌───────────────────┴───────────────────┐
                    │ LAYER 2 — Router (same Qwen3, "/no_think") │
                    │ Predict: call_rag | no_rag                 │
                    └───────────────────┴───────────────────┘
                                        │
                    ├── no_rag ────────► LFM2.5 with user input only
                    │
                    └── call_rag ──────► Extract rag_keyword from user input
                                        (e.g. "Find me a paper regarding Faster RCNN" → "Faster RCNN")
                                        │
                                        ▼
                                        Embed rag_keyword → Vector search API → get hits
                                        │
                                        ▼
                                        LFM2.5 with user input + RAG context (hits)
```

---

## Layer 1 — Four-way classification

The **router model** (e.g. Qwen3) receives the user query with **` /no_think `** appended so it does not waste tokens on chain-of-thought. It must predict exactly one of:

| Label | Meaning | Downstream |
|-------|--------|------------|
| **ml_related** | Papers, datasets, ML concepts, benchmarks, etc. | Go to Layer 2 |
| **unrelated** | Off-topic (e.g. "Who is Taylor Swift?") | Return template response |
| **website_related** | About this site: "Where did you get the data?", "What is this website about?", MLBench, login, profile, etc. | Return template response |
| **ambiguous** | Intent unclear | Send straight to LFM2.5 (no RAG decision) |

- **Template responses** for `unrelated` and `website_related` are the same as today: deterministic, no LLM call for the final answer.
- **Ambiguous** bypasses the RAG decision and goes directly to the main chat model (LFM2.5).

---

## Layer 2 — RAG vs no-RAG (only when ml_related)

Only when Layer 1 returns **ml_related**, the **same router model** is called again (again with ` /no_think `) to choose:

| Label | Meaning | Downstream |
|-------|--------|------------|
| **call_rag** | User explicitly asked to find/search/recommend ML papers | Extract **rag_keyword** → vectorize → RAG API → LFM2.5 with hits |
| **no_rag** | ML question but not a paper-search request | LFM2.5 with user input only |

### call_rag: keyword extraction

The router (or a small structured output) must produce **rag_keyword**: the short phrase to use for vector search.

- Example: *"Find me a paper regarding Faster RCNN"* → `rag_keyword = "Faster RCNN"`.
- That string is embedded, sent to the vector search API, and the returned hits are passed as context to LFM2.5.

---

## Model roles summary

| Model | When it runs | Input | Output / Effect |
|-------|----------------|-------|------------------|
| **Router (Qwen3)** | Once per user message (Layer 1); optionally again (Layer 2) if ml_related | `userQuery + " /no_think "` (+ system prompt for 4-way or 2-way) | Category (+ optional rag_keyword for call_rag) |
| **Embed** | Only when Layer 2 = call_rag | `rag_keyword` | Vector → RAG API |
| **Chat (LFM2.5)** | For ambiguous, no_rag, or after RAG | User input; and for call_rag, RAG hits as context | Final assistant reply |

---

## Environment

In addition to existing chat and embed vars, add:

- **`NEXT_PUBLIC_WLLAMA_ROUTER_MODEL_ID`** — Hugging Face model ID for the router (e.g. Qwen3).
- Optionally **`NEXT_PUBLIC_WLLAMA_ROUTER_FILE`** — Filename in the same convention as chat/embed if you use a custom file.

Router model is loaded separately from the chat model so it can be small/fast and the chat model (LFM2.5) only runs when needed.

---

## File map

| File | Role |
|------|------|
| `agent.ts` | Public API: `routePrompt`, `embedQuery`, model warmup/probe/download. Will call router + chat/embed as above. |
| `chains.ts` | LangChain `PromptTemplate` and chain helpers; router prompts and (optionally) structured output for Layer 1/2 and rag_keyword. |
| `wllamaRuntime.ts` | Loads chat, embed, and (when added) router pipelines from wllama/cache. |
| `types.ts` | Router memory context, etc. |

This README describes the **intended** two-layer router flow; implementation in `agent.ts` / `chains.ts` will follow it.
