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

Remote: https://github.com/husseinrasti/torob-seller-agent (created with `gh`, pushed after each milestone).

Known issues:
- LLM keys missing → agent features cannot be verified live until a key is added to `.env`.

## M1 — Data layer ✅

Done:
- Drizzle schema for shops / products / offers / categories / sessions / followups / plans with all derived columns and indexes (GIN trigram on `products.title_norm`, `products.search_text`, `categories.name_norm`; btree `shops(lat,lon)`, `shops(mall_key)`; GIN `shops.category_names`; `offers(product_id)`, `offers(shop_id)`).
- `lib/fa/{digits,normalize,format}.ts`, `lib/data/{mall,hours,quality}.ts` — pure and unit-tested (75 tests).
- `pnpm seed`: 4 streaming passes over the CSVs + `COPY`, idempotent (truncate + reload), count check (±1%), `--if-empty` for auto-seed.
- `/api/healthz` reports real counts.

Acceptance results:
- `pnpm seed` → **29–35 s**, counts `{"shops":6476,"products":225903,"offers":331506}`.
- `pnpm test` → 75/75 green.
- (a) A17 128/4 within 1 km of (35.6957, 51.4105): **24 shops** (26 sellers in total; see DECISIONS #14). Clusters within 1 km: علاءالدین 6, چارسو 5, بزرگمهر 2, خانه موبایل 2.
- (b) `shop_539f4a371b4d8fcb9c38c717` → mall_key علاءالدین, floor_num 6, unit_label 656 ✅
- (c) freshness: stale 42.4%, recent 34.5%, fresh 22.8%, unknown 0.2% (see DECISIONS #15).
- (d) shops with `has_installment`: 128 ✅ (100–300)
- (e) top malls: علاءالدین 333, بوشهری 178, چارسو 172, علاءالدین ۲ 168, تجارت جهانی 140 ✅
- Parsed: mall 4,040 shops, floor 4,187, unit 5,997; hours known 4,472 (3,011 of 3,792 active).
- Price flags: ok 309,444 · missing 15,083 · suspicious_low 5,844 · suspicious_high 1,135.

Next: M2 search & ranking API.
