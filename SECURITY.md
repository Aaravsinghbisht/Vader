# Security Policy

Vader is a disaster-intelligence tool that aggregates public data about places
in India. It is designed **local-first**: by default it runs on your own machine
and calls only free public endpoints (Nominatim, Open-Meteo, DuckDuckGo, Google
News RSS, IMD, NDMA, INCOIS, ISRO, Bhuvan, OSM Overpass).

## Security principles

- **No API keys or secrets** are required to run the project.
- **Never commit** `.env` files or any real credentials. `.env` is git-ignored —
  only `.env.example` is tracked.
- Only consume **read-only, public** government/web endpoints. Do not add
  authenticated scraping.
- Any user input is treated as a free-text geocoding query. Do not eval, shell
  out with, or embed user input in executable contexts.

## Reporting a vulnerability

If you find a security issue, please **do not open a public issue**. Report it
privately to the maintainer by email:

**Aarav Singh Bisht — aaravbisht1815@gmail.com**

Include, where possible:

1. A description of the vulnerability and impact.
2. Steps to reproduce (including the input used and the affected endpoint).
3. Affected versions / commit hashes.
4. Any suggested fix.

You should receive an acknowledgement within **72 hours**. We will work with you
to confirm the issue and release a fix before public disclosure.

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Older releases | ❌ |

## Production deployment notes

- Bind the server to a trusted network / reverse proxy. Do not expose
  `OLLAMA_BASE_URL` directly to untrusted clients.
- If you deploy on a shared host, run the Docker image as the non-root `nextjs`
  user (the provided `Dockerfile` already does this).
- Validate/normalize `radiusKm` server-side (`1–25`) and cap request sizes at
  your reverse proxy to avoid abusive briefing requests.