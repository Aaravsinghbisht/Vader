<div align="center">

# Vader

**Local-first disaster intelligence system for India**

Enter any place name — English, Hindi, or mixed — and get a full operational briefing:
live weather, web-sourced ground reports, road conditions, NavIC/geospatial context,
government alerts, disaster news, risk assessment, and recommended actions.

</div>

> **Vader is pipeline-first and model-light.** ~95% of its value comes from a deterministic
> server-side pipeline that merges 10+ free public APIs. A small local LLM (`lfm2.5` via
> Ollama) is an optional conversational wrapper for follow-up questions only — it is *not*
> the "brain". See [`architecture.md`](architecture.md) for the full design.

---

## Features

- 🌐 **Polyglot input** — type `Indore`, `इंदौर`, `दिल्ली में बाढ़`, or raw coordinates (`19.0760, 72.8777`).
- ⚡ **Direct briefing pipeline** — typed queries hit `POST /api/briefing` immediately; no slow or unreliable LLM tool-calling in the critical path.
- 🌦️ **Weather intelligence** — 27+ variables, 7-day forecast, hourly outlook, and coastal marine conditions (Open-Meteo).
- 🕸️ **Web intelligence** — free DuckDuckGo search across 6 targeted queries, page enrichment, and keyword-categorized road / ground / official reports.
- 🛣️ **Roads & access** — OSM Overpass infrastructure map (roads, bridges, tunnels, emergency facilities) merged with live reported conditions.
- 📡 **NavIC / geospatial** — India primary-zone check, ISRO constellation status, Bhuvan reverse geocode, INCOIS coastal alerts, GAGAN/SBAS notes, and map-portal deep links.
- 🚨 **Government alerts** — IMD / NDMA / INCOIS page scraping + RSS, severity-ranked and deduplicated.
- 📰 **Disaster news** — Google News RSS with theme detection (flood, cyclone, landslide, rescue, road disruption).
- 🧮 **Risk scoring** — weather hazard flags + alert severity + web risk signals + news volume → an overall risk level (Low / Moderate / High / Severe).
- 🧭 **Actionable output** — a 10-section markdown briefing with recommended actions per scenario.
- 🛡️ **Resilient** — `Promise.allSettled` everywhere; a failed source degrades gracefully instead of failing the briefing.
- 🤖 **Optional LLM layer** — Eve agent + Ollama (`lfm2.5`) for file attachments and follow-up Q&A.

---

## Demo & tests

Real screen recordings of Vader running locally:

| Video | What it shows |
|-------|---------------|
| [01-general-test](vids/01-general-test-19-21-14.mp4) | General briefing flow — typed location → 6-step progress → full markdown report (weather, roads, alerts, news, risk) |
| [02-hindi-test](vids/02-hindi-test-19-35-04.mp4) | Hindi input — e.g. `इंदौर`, `दिल्ली में बाढ़` — routed and geocoded correctly |
| [03-tamil-test](vids/03-tamil-test-19-38-49.mp4) | Tamil input / mixed-language handling |

## Architecture at a glance

```
  User browser  ──►  POST /api/briefing  ──►  runBriefing() orchestrator
                                                 │
        ┌──────────────┬───────────────┬─────────┴───────────┬──────────────┐
        ▼              ▼               ▼                     ▼              ▼
   Geocode        Weather          Web intel             Roads        Gov alerts
   Nominatim      Open-Meteo       DuckDuckGo            OSM Overpass IMD/NDMA/RSS
        │              │               │                     │              │
        └──────────────┴───────┬───────┴─────────────────────┴──────────────┘
                               ▼
                      buildFullReport()
                    risk scoring + actions
                               ▼
                    10-section markdown briefing
```

Read the **[full system architecture → `architecture.md`](architecture.md)**.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend / API | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| UI primitives | Tailwind CSS v4, shadcn/Radix, StreamDown markdown, lucide icons |
| Intelligence pipeline | TypeScript server modules (`agent/lib/*`) |
| LLM wrapper (optional) | Eve agent framework + Ollama (`lfm2.5`) |

**Data sources (all free, no API keys):** Nominatim, Open-Meteo, OSM Overpass,
DuckDuckGo HTML, Google News RSS, IMD, NDMA, INCOIS, ISRO, Bhuvan, NHAI.

---

## Quick start

### Prerequisites

- **Node.js ≥ 24** (see `.nvmrc` / `engines`)
- **Ollama** with the `lfm2.5` model (optional — browsing + briefing work without it)

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Everything has sensible defaults; the env file is only needed to override the
model name, briefing radius, or fetch timeouts.

### 3. Run

```bash
# With the Eve agent + LLM wrapper (recommended for local dev)
./start.sh

# Web-app only (no Ollama required at startup)
npm run dev
```

Open **http://localhost:3000/chat** and type any place name, e.g. `Chennai Marina`,
`Indore`, or `इंदौर`.

---

## How it works

Every text submission follows one path:

1. `extractLocationQuery()` strips wrapper phrases ("situation at Puri Odisha" → `Puri Odisha`).
2. The UI shows a 6-step `BriefingProgress` loader.
3. `POST /api/briefing` calls `runBriefing()`, the single orchestrator shared by the REST API and the Eve tool.
4. `Promise.all` fetches weather, roads, alerts, news, and web intel in parallel.
5. NavIC / geospatial context is merged with web-found official mentions.
6. `buildFullReport()` produces a **10-section markdown briefing** with risk score and recommended actions.

LLM follow-ups only happen for file attachments or explicit follow-up questions —
the briefing is never repeated by the model.

### API

**`POST /api/briefing`**

```bash
curl -X POST http://localhost:3000/api/briefing \
  -H "Content-Type: application/json" \
  -d '{"query": "Puri Odisha", "radiusKm": 5}'
```

Response:

```json
{
  "success": true,
  "report": "# Disaster Intelligence Briefing\n...",
  "area": { "name": "Puri, ...", "latitude": 19.8135, "longitude": 85.8312, "district": "Puri", "state": "Odisha", "coastal": true },
  "stats": { "weatherMetrics": 27, "roadSegments": 347, "newsArticles": 10, "alerts": 8, "hazardFlags": ["rain","wind"], "webResults": 18 },
  "meta": { "fetchedAt": "2026-09-05T...", "sourcesReachable": ["Nominatim", "open-meteo.com", "..."], "sourcesFailed": [] }
}
```

**`GET /api/health`** — container / load-balancer health check.

---

## Configuration

| Env variable | Default | Effect |
|--------------|---------|--------|
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama OpenAI-compatible endpoint (Eve consumes it) |
| `OLLAMA_MODEL` | `lfm2.5` | Local LLM model used by the Eve agent |
| `BRIEFING_RADIUS_KM` | `5` | OSM road search radius (max 25) |
| `WEB_FETCH_TIMEOUT_MS` | `12000` | DuckDuckGo + page enrichment timeout |
| `PORT` | `3000` | Next.js server port |

---

## Development

```bash
npm run dev          # Next.js dev (Turbopack) — web app + briefing API
npm run dev:eve      # Eve agent dev server
npm run typecheck    # TypeScript validation
npm run build        # Production build
npm run test:pipeline# End-to-end pipeline test against live APIs (Kolar, Chennai)
```

> **Note:** `npm run test:pipeline` hits live public APIs and requires network access.

---

## Production deployment

### Docker (recommended)

```bash
docker compose up --build -d
```

Serves the app on **http://localhost:3000** with a bundled `ollama/ollama` service.
The full-briefing path runs fully inside the container; the LLM follow-up layer
uses the bundled Ollama service.

### Standalone image

```bash
docker build -t vader .
docker run -p 3000:3000 -e OLLAMA_BASE_URL=http://host.docker.internal:11434/v1 vader
```

### Vercel / serverless

Deploy `main` directly — the API route and pages are standard Next.js. The app
degrades gracefully without Ollama (typed briefings still work). To enable
follow-ups, set an `EVE_NEXT_PRODUCTION_ORIGIN` pointing at a hosted Eve service.

### Manual

```bash
npm run build
npm start
```

---

## Project structure

```
vader/
├── agent/                       # Eve agent + intelligence pipeline
│   ├── agent.ts                 # Model + token limits (Ollama lfm2.5)
│   ├── instructions.md          # System prompt (thin wrapper role)
│   ├── tools/
│   │   └── area_situation_report.ts
│   └── lib/                     # ★ The intelligence pipeline
│       ├── run-briefing.ts      # Central orchestrator (API + Eve share it)
│       ├── full-report.ts       # Report builder + risk scoring
│       ├── geocode.ts           # Nominatim + coastal heuristic
│       ├── weather-metrics.ts   # Open-Meteo (+ marine)
│       ├── weather-narrative.ts
│       ├── web-intelligence.ts  # DuckDuckGo + page enrichment
│       ├── web-intelligence-report.ts
│       ├── roads-overpass.ts    # OSM Overpass
│       ├── roads-report.ts
│       ├── gov-alerts.ts        # IMD / NDMA / INCOIS
│       ├── disaster-news.ts     # Google News RSS
│       ├── navic-context.ts     # ISRO / Bhuvan / INCOIS
│       ├── navic-report.ts
│       └── fetch-utils.ts       # HTTP helpers + HTML strip
├── app/                         # Next.js App Router
│   ├── chat/                    # AgentChat.tsx + BriefingProgress.tsx
│   └── api/
│       ├── briefing/route.ts    # Direct briefing endpoint
│       └── health/route.ts
├── lib/                         # Input extraction (EN/HI), utils
├── components/                  # UI primitives (ai-elements, ui/shadcn)
├── scripts/test-pipeline.ts     # Live integration tests
├── architecture.md              # Full system design
├── Dockerfile                   # Multi-stage production image
└── docker-compose.yml           # App + Ollama
```

---

## Testing

`test:pipeline` runs end-to-end checks for `Kolar Bhopal MP` and `Chennai Marina`,
validating geocoding, ≥20 weather metrics, roads, web intel, report length, and
required report sections.

CI runs `typecheck` + `build` on every push/PR. A nightly workflow runs the live
pipeline test and can be triggered manually from the **Actions** tab.

---

## Roadmap

- [ ] Persistent briefing history + region watchlists
- [ ] River / reservoir stage data (CWC) for flood-prone districts
- [ ] Multi-language report export (PDF / WhatsApp)
- [ ] SMS / Telegram alert subscriptions per district
- [ ] Offline-first build with local vector map tiles

---

## License

[MIT](LICENSE) © 2026 Aarav Singh Bisht