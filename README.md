# Vader

**Vader** is a local-first **disaster intelligence system** for India. Type any place name — English, Hindi, or mixed — and receive a full operational briefing: live weather, web-sourced ground reports, road conditions, NavIC/geospatial context, government alerts, disaster news, risk assessment, and recommended actions. A deterministic server-side pipeline merges **10+ free public APIs** — no API keys, no cloud, no paid services.

Sitting on top is a thin **local LLM wrapper** (`lfm2.5` via Ollama) built with [Vercel eve](https://eve.dev) for one-line intros, follow-up questions, and file attachments. It is a conversational layer only, never the "brain" — ~95% of the value is pure server code.

| Layer | Role |
|-------|------|
| **Vader** | The intelligence system — geocoding, briefing pipeline, risk scoring, report rendering |
| **Local LLM (`lfm2.5`)** | The thin conversational wrapper — intros, follow-ups, file attachments |

## Demo

Real screen recordings of Vader running locally:

| # | Test | Watch |
|---|------|-------|
| 1 | **General briefing** — typed location → 6-step progress → full 10-section report | [▶ `01-general-test-19-21-14.mp4`](vids/01-general-test-19-21-14.mp4) |
| 2 | **Hindi input** — polyglot place name routed and geocoded correctly | [▶ `02-hindi-test-19-35-04.mp4`](vids/02-hindi-test-19-35-04.mp4) |
| 3 | **Tamil input** — polyglot place name routed and geocoded correctly | [▶ `03-tamil-test-19-38-49.mp4`](vids/03-tamil-test-19-38-49.mp4) |

> Files live under `vids/` — clone the repo to play them locally.

## Architecture

```text
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

| Layer | Kind | Runs as |
|-------|------|---------|
| **Next.js UI + `/api/briefing`** | Deterministic | Host process, port 3000 |
| **`runBriefing()` pipeline** | Deterministic | Server modules under `agent/lib/` |
| **Eve agent + Ollama** | Optional LLM | `lfm2.5`, port 11434 — follow-ups only |

## The briefing pipeline

Every typed location follows the same path — **no LLM in the critical path**.

1. **Geocode** — `geocodeLocation()` resolves the query via Nominatim into lat/lon, district, and state (with a coastal heuristic).
2. **Parallel intelligence** — weather, roads, government alerts, disaster news, and web intel are fetched with `Promise.all`; one failing source never blocks the rest.
3. **NavIC + merge** — geospatial context (ISRO, Bhuvan, INCOIS) is gathered, then web-found official mentions are merged into the alert list.
4. **Report** — `buildFullReport()` renders a **10-section markdown briefing** with an overall risk level (Low / Moderate / High / Severe) and recommended actions.
5. **Follow-ups** — only file attachments and follow-up questions reach the LLM; the briefing itself is rendered directly, never repeated by the model.

## Prerequisites

- **Node.js 24+** and npm
- **Ollama** with the `lfm2.5` model — optional; briefings work fully without it
- **Internet access** for the free public APIs (Nominatim, Open-Meteo, OSM Overpass, DuckDuckGo, Google News, IMD, NDMA, INCOIS, ISRO, Bhuvan)

## Quick start

```bash
npm install
cp .env.example .env      # optional — defaults work out of the box
npm run dev
```

Open **http://localhost:3000/chat** and type any place — `Chennai Marina`, `Indore`, `इंदौर`.

To include the follow-up LLM wrapper:

```bash
ollama pull lfm2.5 && ollama serve
./start.sh                # checks Ollama + model, then starts the dev server
```

For a Docker deployment: `docker compose up --build -d`.

## Manual setup

```bash
# 1. Dependencies
npm install

# 2. Optional — local LLM for follow-ups
ollama pull lfm2.5
ollama serve

# 3. Environment
cp .env.example .env
# edit OLLAMA_MODEL / BRIEFING_RADIUS_KM / WEB_FETCH_TIMEOUT_MS as needed

# 4. Run
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server (Turbopack) + briefing API |
| `npm run dev:eve` | eve dev server only |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check |
| `npm run test:pipeline` | Live end-to-end pipeline test (network required) |
| `npm run ci` | typecheck + build |

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama OpenAI-compatible endpoint (eve) |
| `OLLAMA_MODEL` | `lfm2.5` | Local LLM model for follow-ups |
| `BRIEFING_RADIUS_KM` | `5` | Road/OSM search radius (max 25) |
| `WEB_FETCH_TIMEOUT_MS` | `12000` | DuckDuckGo + page-enrichment timeout |
| `PORT` | `3000` | Next.js server port |

## Troubleshooting

**"Location not found"**

Add city + state for disambiguation, e.g. `Kolar Bhopal MP`.

**Some sources failed**

The briefing's Sources section lists reached vs. failed endpoints. One flaky source (DuckDuckGo, IMD, Overpass) degrades gracefully and never fails the whole report.

**LLM follow-ups not responding**

Make sure Ollama is running and the model is pulled: `curl http://localhost:11434/api/tags` and `ollama pull lfm2.5`.

## Project layout

```text
vader/
├── agent/
│   ├── agent.ts                  #   model config (Ollama lfm2.5)
│   ├── instructions.md           #   system prompt — thin wrapper role
│   ├── channels/eve.ts           #   eve channel wiring
│   ├── lib/                      #   ★ the intelligence pipeline
│   │   ├── run-briefing.ts       #     central orchestrator
│   │   ├── geocode.ts            #     Nominatim + coastal heuristic
│   │   ├── weather-metrics.ts    #     Open-Meteo (+ marine)
│   │   ├── web-intelligence.ts   #     DuckDuckGo + page enrichment
│   │   ├── roads-overpass.ts     #     OSM Overpass
│   │   ├── gov-alerts.ts         #     IMD / NDMA / INCOIS
│   │   ├── disaster-news.ts      #     Google News RSS
│   │   ├── navic-context.ts      #     ISRO / Bhuvan / INCOIS
│   │   ├── full-report.ts        #     10-section report + risk scoring
│   │   └── fetch-utils.ts        #     HTTP helpers + HTML strip
│   └── tools/
│       └── area_situation_report.ts
├── app/
│   ├── chat/                     #   AgentChat + 6-step BriefingProgress
│   ├── api/briefing/route.ts     #   direct briefing endpoint
│   ├── api/health/route.ts
│   ├── _components/agent-message.tsx
│   ├── layout.tsx · page.tsx · globals.css
├── components/
│   ├── ai-elements/              #   message, tool, chain-of-thought, prompt-input
│   └── ui/                       #   shadcn-ui primitives
├── lib/
│   ├── location-query.ts         #   polyglot input extraction (EN / HI)
│   ├── hitl-ui.ts                #   human-in-the-loop UI helpers
│   └── utils.ts
├── scripts/
│   └── test-pipeline.ts          #   live pipeline test (network required)
├── vids/                         #   demo recordings (3 runs)
├── architecture.md               #   system design & API contract
├── docker-compose.yml · Dockerfile
├── SECURITY.md · CHANGELOG.md · CONTRIBUTING.md · LICENSE
├── start.sh
└── package.json
```

## Links

- [System design & architecture](architecture.md)
- [eve documentation](https://eve.dev/docs)
- [browser & weather sources](https://open-meteo.com) — Open-Meteo, Nominatim, OSM Overpass
- [Ollama](https://ollama.com)

## License

[MIT](LICENSE) © 2026 Aarav Singh Bisht