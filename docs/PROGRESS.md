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

## M2 — Search & ranking API ✅

Done:
- `lib/search/query.ts` (Persian budget parser, filler removal, synonyms), `rank.ts` (rerank), `specs.ts` (card specs, diff table), `products.ts` (`searchProducts`, `compareProducts`, templated «چرا»), `categories.ts` (`routeCategories` + LRU cache), `sellers.ts` (`findSellers`, `shopDetails`, clusters, maybe_shops, relaxations), `score.ts` (explainable intent-weighted score + why phrases).
- `GET /api/sellers` (no LLM) and `GET /api/products/search?q=`.
- `scripts/golden.ts`.

Acceptance results:
- `pnpm golden` → **products 15/15**, **sellers 9/9** (rules mode — no LLM key available).
- `/api/sellers?product_id=product_d24b597176bdf2a82035dcc2` (default location, 1 km): 24 rows, clusters چارسو 6 · علاءالدین 6 · بازار موبایل ایران 4 · بزرگمهر 2 · خانه موبایل 2, 5 category-only shops; `installment=1` → 1 row + relaxation «قسطی +23».
- Timing: `findSellers` 4–16 ms server-side (Server-Timing header); ~225 ms end-to-end in `next dev` (dev-server overhead).
- Sample row: see `/api/sellers` — `{offer_id, shop_name, price, price_flag, freshness, price_age_days, distance_m, open{known,open,label}, mall{name,floor_label,unit_label}, conditions{…}, score, score_breakdown, why[]}`.

Next: M3 agent + core UI.

## M3 — Agent + core UI ✅ (provider switch not verifiable: no keys)

Done:
- `lib/agent/{state,tools,system-prompt,suggest,offline-model,types}.ts`, `/api/chat` (AI SDK v7 `streamText` + tools, `stepCountIs(5)`, 25 s step timeout, Persian errors), `/api/session` GET/PATCH, `/api/shop`, `/api/places`, hidden `/demo-reset`.
- Mobile RTL UI: header (demo-time/offline badges), sticky ContextBar + sheets (location: GPS / search / MapLibre pick; radius; price cap; conditions + intent), hero with the 4 scenario chips, ProductCards (+compare selection), CompareTable, SellerList (live re-filter, mall clusters, sort, relaxation banner, «ممکن است داشته باشند (فقط دسته فعالیت)»), SellerCard (three-field block), shop details sheet (score breakdown, nav links), SuggestedActions, Composer, lazy MapPanel.
- `pnpm scenario` drives spec §13 on a 390px viewport with screenshots and assertions; `pnpm smoke`.

Acceptance results (`pnpm scenario --upto=4`, offline model, demo time Sunday 16:00): **11/11 checks pass** in ~16 s —
chip → 4 product cards with «چرا»; compare 2 → table → «انتخاب»; 24 sellers in 1 km with cluster chips; map panel with 30 markers;
«باز الان» + 500 m → 18 sellers with **0 calls to /api/chat**; «قسطی» → 0 + «حذف فیلتر قسطی (+۱۸)»; three fields on every card;
«چرا این اول شد؟» answered from why/score_breakdown; no horizontal scroll; no console errors.
- Provider failure path verified with a fake OpenAI key: Persian notice + offline answer; UI actions still render their cards.

Known gaps:
- **LLM provider switching (openai/google/openrouter) not verified — no API keys in `.env`.** Code path is a pure env switch (`lib/llm.ts`).
- Product images from image.torob.com do not load from this machine (TLS error); a placeholder is shown.

Next: M4 follow-ups, alternatives, checklist.

## M4 — Follow-ups, alternatives, checklist ✅

Done:
- `lib/sim/seller.ts` (sha256 ground truth, probability buckets, closed-shop rules), `lib/sim/persona.ts` (LLM ≤ 3 s, price-guarded, templates), `lib/sim/followups.ts`, `POST/GET /api/followup`.
- Tools `contact_seller`, `find_alternatives`, `purchase_checklist`; FollowupBoard (1 s polling, skeletons, transcripts, «جایگزین پیدا کن», «قبول قیمت جدید», disclaimer), AlternativesPanel (two tabs), Checklist; seller cards' «موجودی» badge updates live.
- Unit tests for simulator determinism and buckets (94 tests total).

Acceptance (`pnpm scenario --upto=5`): **15/15 checks** — 3 follow-ups resolve in ~4 s with confirmed / price_changed / out_of_stock, transcripts visible, disclaimer visible, out_of_stock → «خودکار» alternatives with the same product in the same mall first; checklist for a phone returns رجیستری/پلمب/سریال گارانتی/تست دوربین و باتری/فاکتور.

Next: M5 trip plan + polish.

## M5 — Trip plan + polish ✅

Done:
- `lib/plan/trip.ts` (group by mall, nearest-neighbour from the start, floors ascending, 80 m/min, +5 min/shop, +3 min/mall entry, open-at-ETA warnings, Neshan/Google/OSM links) + unit tests; `lib/plan/service.ts`; `plan_trip` tool; `POST /api/plan`; read-only shareable `/plan/[id]`.
- TripPlan card (share via Web Share / clipboard, «چک‌لیست خرید»), suggestions for plan/checklist, dark mode toggle, Persian digits everywhere (`faText` for titles/warranty strings), 44px targets, empty states with a tappable fix.

Acceptance:
- `pnpm scenario` (spec §13 steps 1–7, 390px, demo time Sunday 16:00): **20/20 checks** in ~26 s of scripted interaction (dev and production builds), zero console errors, no horizontal scroll, no ASCII digits in UI text.
- Lighthouse mobile on `/` (production build, no map): **Performance 92 · Accessibility 100 · Best Practices 100** (FCP 0.8 s, TBT 10 ms, CLS 0.004).
- `/api/sellers` in production: 7–10 ms. LLM-visible `find_sellers` payload: 3.7k chars (full UI payload 25.5k).
- `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` green (99 unit tests; golden 15/15 + 10/10).

Next: M6 deployment.

## M6 — Deploy ✅ (local end-to-end; VPS run is the owner's, see docs/DEPLOY.md)

Done:
- Dockerfile (Node 22 alpine, pnpm, Next standalone, esbuild-bundled `migrate.cjs`/`seed.cjs`, non-root, HEALTHCHECK), docker-compose (db with healthcheck + volume, app with `AUTO_SEED`, Caddy with `{$APP_DOMAIN}`), Caddyfile.
- README (fa + en pitch, screenshots, criteria map, mermaid architecture, quick start, env table, honesty note, dataset notes), `docs/DEPLOY.md`, `docs/DEMO.md`.

Acceptance (local, fresh compose project and volumes, Caddy on :8089):
- `docker compose up -d --build` → `[migrate] applied` → `[seed +31.3s] done: {"shops":6476,"products":225903,"offers":331506}` → `✓ Ready` → `/api/healthz` ok through Caddy; app container `healthy`; image 355 MB.
- `pnpm scenario http://localhost:8089` → **20/20** through Caddy.
- `docker compose restart app` / recreate → data kept, seed skipped (`--if-empty`), healthz green.
- `docker compose run --rm app node scripts/seed.cjs --if-empty` runs the bundled seed.

## Final status

- `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` → green (99 unit tests; golden 15/15 queries + 10/10 seller checks).
- Demo scenario §13 steps 1–7: `pnpm scenario` 20/20 (dev, production build and Docker), `?demo_time=` and `/demo-reset` supported.
- CI: GitHub Actions (install → typecheck → lint → test) on every push.
- Parsed malls for 4,088 shops (after parser refinements in M1).

Known issues / gaps:
- **LLM providers not verified live — no API keys were available** (`pnpm llm-check`: openai, google and openrouter all skipped). The agent was verified with the offline rule model and with a failing provider (automatic fallback + Persian notice). Add a key to `.env` and run `pnpm llm-check` (and `LLM_PROVIDER=<p> pnpm llm-check --provider=<p>`).
- Product images (image.torob.com) did not load from the build machine (TLS error); a placeholder is shown until an image loads.
- Live demo URL and the official dataset link are placeholders in README until the owner deploys / adds the link.
