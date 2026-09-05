# Contributing to Vader

Thanks for helping make Vader better! This document covers how to contribute
code, fixes, and ideas.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` if you want to override defaults.
4. Run `npm run dev` and open http://localhost:3000/chat.

## Development commands

```bash
npm run dev             # Next.js dev server + briefing API
npm run typecheck       # TypeScript validation (must pass)
npm run build           # Production build (must pass)
npm run test:pipeline   # End-to-end pipeline test against live APIs
```

Before submitting a PR, always run `npm run typecheck` and `npm run build`.

## How to contribute

- **Bug reports** — open an issue with the exact input, expected vs. actual
  behaviour, and any relevant `meta.sourcesFailed` output from the briefing.
- **Data source fix** — many sections depend on scraped public pages that change
  structure. If a source breaks, pin down the new HTML/selector and submit a fix
  in the relevant module under `agent/lib/`.
- **New intelligence module** — follow the existing module pattern in
  `agent/lib/`:
  1. Implement fetch + parse in a `*-context.ts` / `*-metrics.ts` module.
  2. Add a markdown renderer module (`*-report.ts`).
  3. Wire the fetch into `runBriefing()` with `Promise.allSettled` (never block
     the whole pipeline on one source).
  4. Surface results through the `stats` and `meta` fields of the API response.
  5. Document the module in `architecture.md`.

## Code style

- TypeScript, strict mode. No runtime type annotations beyond `as` casts where
  unavoidable.
- Extensionless imports inside `agent/lib/` (Turbopack cannot resolve `.js`
  extensions on `.ts` files).
- Never fail a briefing because one source failed — always degrade gracefully.
- No comments unless they clarify non-obvious logic.
- Format with Prettier defaults; the codebase uses double-quoted strings and a
  trailing-comma style.

## Conventions

- Keep the deterministic pipeline LLM-free. LLM involvement is only for
  follow-up conversation, never for generating the briefing itself.
- Every user-visible API change should be reflected in `README.md` and
  `architecture.md`.

## Review process

PRs are reviewed for: passing CI (`typecheck` + `build`), graceful failure
handling, and accuracy of documentation. Smaller, focused PRs are merged faster.

## Code of conduct

Be respectful and constructive. This project aims to support disaster
preparedness in India — treat that goal and each contributor with dignity.