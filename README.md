<p align="center">
  <img src="mlbench/public/sotavault.svg" alt="SotaVault logo" width="280" />
</p>

<h1 align="center">SotaVault</h1>

<p align="center">
  <strong>A Machine learning benchmark archive for researchers and enthusiasts.</strong>
</p>

<p align="center">
  <a href="https://sotavault.ai"><img src="https://img.shields.io/badge/live-sotavault.ai-16a34a?style=for-the-badge" alt="Live app" /></a>
  <a href="https://github.com/chophilip21/MLBenchArchive-app"><img src="https://img.shields.io/badge/status-beta-orange?style=for-the-badge" alt="Beta" /></a>
  <img src="https://img.shields.io/badge/source-closed-ef4444?style=for-the-badge" alt="Closed source" />
  <img src="https://img.shields.io/badge/license-non--commercial-2563eb?style=for-the-badge" alt="Non-commercial" />
</p>

<p align="center">
  Papers · Benchmarks · Conferences · Semantic search
</p>

---

## About

**SotaVault** helps the ML community discover conferences, research papers, dataset series, and benchmark leaderboards in one place. The platform curates and structures benchmark metadata extracted through custom ingestion and language-model pipelines — while respecting that underlying papers and public datasets remain the property of their original authors.

> **This repository is private and closed source.** It is maintained for the SotaVault product only. Source code, assets, and compiled benchmark metadata may not be copied, redistributed, scraped, or used for commercial purposes without explicit permission.

The product is currently in **public beta**. Features, APIs, and availability may change without notice.

---

## Features

| Area | Description |
|------|-------------|
| **Papers** | Browse and search ML papers with venue metadata, code links, and GitHub stats |
| **Benchmark** | Explore dataset series and leaderboards across CV, NLP, audio, robotics, and more |
| **Conference** | Upcoming venues, deadlines, and an interactive world map |
| **Bookmarks** | Save papers and datasets to your personal library |
| **AI Search** | Browser-side semantic search over papers and dataset series *(beta)* |
| **Global search** | Fuzzy search across papers, datasets, and venues from the header |

Authentication is required for most research tabs. Sign-up includes age verification (13+) and acceptance of our [Terms of Service](https://sotavault.ai/terms) and [Privacy Policy](https://sotavault.ai/privacy).

---

## Tech stack

| Layer | Technologies |
|-------|----------------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Auth** | [Firebase Authentication](https://firebase.google.com/products/auth) |
| **AI Search** | [@huggingface/transformers](https://huggingface.co/docs/transformers.js) (in-browser embeddings) |
| **Maps** | [Leaflet](https://leafletjs.com/) + [MapLibre GL](https://maplibre.org/) |
| **Math rendering** | [KaTeX](https://katex.org/) |
| **Bot protection** | [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) |

The frontend talks to the SotaVault API via a same-origin proxy (`/api/backend/*`) to avoid mixed-content issues in production.

---


---

## Legal & contact

| | |
|---|---|
| **Terms** | [Terms of Service](https://sotavault.ai/terms) |
| **Privacy** | [Privacy Policy](https://sotavault.ai/privacy) |
| **Corrections** | [admin@sotavault.ai](mailto:admin@sotavault.ai) — metadata errors, misattributions, takedown requests |
| **Acknowledgements** | [arXiv](https://arxiv.org), [Papers With Code](https://paperswithcode.com), [OpenFreeMap](https://openfreemap.org), and other open data sources — see in-app acknowledgements |

SotaVault is an **independent, non-commercial** project. It is **not affiliated with** arXiv, Papers With Code, or any conference organizer.

---

<p align="center">
  <sub>© SotaVault · Closed source · Beta</sub>
</p>
