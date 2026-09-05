# Changelog

All notable changes to **Vader** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Public GitHub repository: `vader`.
- Production infrastructure:
  - Multi-stage `Dockerfile` (standalone Next.js output, non-root user).
  - `docker-compose.yml` bundling the app with an Ollama service.
  - GitHub Actions CI (`typecheck` + `build` on push/PR).
  - Nightly live pipeline test workflow with manual trigger.
  - `GET /api/health` readiness endpoint for load balancers/containers.
  - `.dockerignore`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
- Documentation:
  - Comprehensive `README.md` (features, quick start, API, deployment).
  - MIT `LICENSE`.
  - Resynced `package-lock.json` (fixes `npm ci` not being able to install).

## [0.1.0] — 2026-08-31

### Added
- Initial local-first disaster intelligence system.
- Polyglot input handling (English, Hindi, mixed, raw coordinates).
- Direct briefing pipeline (`POST /api/briefing`) bypassing the LLM.
- Weather intelligence with 7-day hourly outlook + marine layer (Open-Meteo).
- Web intelligence via DuckDuckGo across 6 targeted report queries.
- Roads & infrastructure via OSM Overpass merged with live web reports.
- NavIC / geospatial context (ISRO, Bhuvan, INCOIS, GAGAN/SBAS notes).
- Government alerts (IMD / NDMA / INCOIS) with severity ranking.
- Disaster news aggregation (Google News RSS) with theme detection.
- 10-section markdown briefing with overall risk assessment and recommended actions.
- Eve agent integration for optional follow-up Q&A (Ollama `lfm2.5`).
- 6-step animated briefing progress UI.
- Live pipeline integration tests (`npm run test:pipeline`).
- `architecture.md` system blueprint.