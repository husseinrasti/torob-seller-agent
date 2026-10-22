# Progress

## M0 — Scaffold ✅

Done:
- Next.js 15.5 (App Router, TS, pnpm), Tailwind v4, shadcn/ui (RTL), self-hosted Vazirmatn variable font, `<html lang="fa" dir="rtl">`, 520px mobile shell.
- Drizzle + PostgreSQL 16 (compose `db`, pg_trgm + unaccent via init SQL and migration `0000_extensions`).
- `lib/llm.ts` provider factory (openai | google | openrouter by env), `scripts/llm-check.ts`.
- `GET /api/healthz` → `{ok, db, counts, llm_provider}`.
- Dockerfile (multi-stage, standalone, non-root, HEALTHCHECK), docker-compose (db, app, caddy), Caddyfile.
- CI workflow (install → typecheck → lint → test), MIT license, `.gitignore` (CSVs, `.env`, `video/` never committed).

Acceptance results:
- `docker compose up -d db && pnpm migrate && pnpm dev` → `/` renders RTL with Vazirmatn; `/api/healthz` → `{"ok":true,"db":true,...}`.
- `pnpm llm-check` → **all three providers skipped: no API key in `.env` or the environment** (OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENROUTER_API_KEY missing).

Next: M1 data layer.

Known issues:
- LLM keys missing → agent features cannot be verified live until a key is added to `.env`.
