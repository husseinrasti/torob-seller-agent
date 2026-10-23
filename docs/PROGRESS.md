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

## Post-v1 — Name sign-in, chat history, memory, desktop layout, shops map ✅

Request (owner, 2026-10-23): a desktop layout as well as mobile, adapting to the device; memory; a list of previous chats that can be continued; a simple name-only login so chats are saved per user; shops shown on the map and selectable.

Done:
- `users` table and `sessions.user_id/title/messages` (migration `0003_users_chats`); `lib/auth.ts` (name-only sign-in cookie), `lib/agent/memory.ts`; APIs `auth/login`, `auth/logout`, `me`, `me/memory`, `chats`, `chats/[id]`, `chats/[id]/messages`, `shops/near`; the existing APIs take the chat id.
- Login screen; history panel (desktop sidebar, mobile sheet, delete); resume via `/?c=<id>` with back/forward; hero greeting and «از جایی که مانده بودیم»; memory block in the system prompt; «پاک کردن».
- Desktop layout from 1024 px (history · chat · map column) with container-query card grids; the shop sheet opens from the side on desktop.
- Map: every shop within the radius (WebGL layer, legend, «فقط مرتبط‌ها / همه فروشگاه‌ها»), names on hover, click → shop sheet with the chosen product's offer and «پیگیری» / «به برنامه».
- Fixes found while testing with live models: «نزدیک من» no longer moves the location, the follow-up status race in the visit plan, ASCII digits in LLM text (decisions #49–#51).
- Unit tests for memory and name validation.

Acceptance:
- `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` green (107 unit tests; golden 15/15 + 10/10).
- `pnpm scenario` with the live model (OpenAI `gpt-5.4-mini`, demo time Sunday 16:00): **27/27** on 390 px, **27/27** with `--desktop` (1440×900), and **27/27** against the rebuilt Docker image through Caddy (`http://localhost:8088`, 52 s). Screenshots: `docs/screenshots/` and `docs/screenshots/desktop/`.
- `pnpm llm-check`: openai (`gpt-5.4-mini`) OK in 2.6 s, google (`gemini-3.1-flash-lite`) OK in 1.1 s, openrouter (`openai/gpt-4.1-mini`) OK in 2.1 s.

## Post-v1 — Shop types on the map ✅

Request (owner, 2026-10-23): shops were plain dots that did not read as shops until hovered; show an icon, different icons per shop type, and group/filter by type.

Done:
- 20 shop types from the activity categories (rules + majority vote, fallback to listed products, «فعالیت ثبت نشده» when the dataset has neither), cached per process; `/api/shops/near` returns the type and mall; the shop sheet shows the type.
- Map: a badge per shop with its type icon (colour = lists products / no listings / category-only), cluster pills «shop icon + Persian count» with an amber category-only bubble, tap to zoom or — inside one building — a list of its shops; type chips with counts; collapsible legend on phones.
- Unit tests for the type rules (incl. substring traps such as «تهویه» ⊃ «هویه», «آداپتور» ⊃ «پتو»).

Acceptance:
- `pnpm typecheck && pnpm lint && pnpm test` green (142 unit tests).
- `pnpm scenario`: **28/28** on 390 px, **28/28** with `--desktop` and **28/28** against the rebuilt Docker image (`http://localhost:8088`) (new checks: type chips with counts, a chip filters the map, the shop sheet shows the type). Screenshots `07-map.png`, `07b-map-type-filter.png` (phone and desktop).
- Around the default location (1 km): 2,692 shops besides the sellers — mobile 494, CCTV 187, tools 177, audio/video 166, …, 724 «فعالیت ثبت نشده».

## Post-v1 — Missions: compound requests carried out end to end ✅

Request (owner, 2026-10-23): «من یه گوشی سامسونگ حدود قیمت ۵۰ میلیون تومن میخوام. محدوده سعادت آباد باشه. و خودت بپرس ببین قیمت‌هاشون آپدیت هست یا نه و اینکه الان باز هستند.» was not carried out; such a message must run as one mission and come back as one report.

Root causes, verified:
1. Places were limited to the 30 `location_label`s and mall names — «سعادت آباد» was unknown → gazetteer (#62).
2. Sparse data outside the centre: around سعادت‌آباد 0 shops within 1 km and 1 Samsung-phone seller within 8 km (2.1 km away, near «آسمان») → coverage loop + honest notes (#63), in-band offer per shop (#64).
3. Follow-ups were fire-and-forget → `awaitFollowups` (≤ 8 s) inside the mission (#67).
4. `stepCountIs(5)` and no end-to-end instruction → direct mission execution in auto mode (#59), 10 steps, prompt rule (#74).
5. «حدود ۵۰ میلیون» → band 45–55 M; «آپدیت هست یا نه» → freshness + follow-up; «الان باز هستند» → open filter + per-row open/closed (#61, #68).
Also found while testing: the demo clock could be missing in a brand-new chat (#72) and the routing model invented a budget (#73).

Done:
- `lib/agent/mission/`: `extract.ts` (rules + LLM merge, mission detection), `gazetteer.ts` + `geocode.ts`, `coverage.ts`, `verdict.ts`, `run.ts` (locate → products → sellers with widening → follow-ups awaited → optional plan → report), `types.ts`; `run_mission` tool; `awaitFollowups`; `/api/chat` auto mode + `data-mission-progress` parts; location sheet shows gazetteer places with «N فروشگاه در ۱ کیلومتری».
- UI: `MissionProgressCard` (live steps, collapses), `MissionResultCard` («این‌طور فهمیدم» chips with ×, coverage banner, table on wide columns / stacked rows on phones, verdict pills, recommendation or «پیشنهادی ندارم چون…», live follow-up cells, next-step chips, embedded plan), 5th hero chip with the failing example.
- Tests: 27 mission unit tests (15 Persian phrasings, gazetteer variants, coverage loop, verdicts, chip edits) — 169 in total; `scripts/missions.ts` (8 compound requests) in `pnpm golden`.

Acceptance:
- `pnpm typecheck && pnpm lint && pnpm test` green (169 unit tests); `pnpm golden`: products 15/15, sellers 10/10, **missions 45/45**.
- `pnpm scenario` (live OpenAI, demo time Sunday 16:00) with the new step 9 (hero mission chip): **33/33** on 390 px and **33/33** with `--desktop`; screenshots `22-mission-progress.png`, `23-mission-result.png` (phone and desktop).
- The failing example now: سعادت‌آباد found → 4 Samsung phones in 45–55 M → 0 sellers within 1, 2 km, 1 within 3–8 km → the seller is asked and answers within the turn → report: coverage note («در خود سعادت‌آباد … ثبت نشده؛ نزدیک‌ترین‌ها در فاصله ۲٫۱ کیلومتر (آسمان)»), open/closed per row, verdict, and either a recommendation or «پیشنهادی ندارم چون…», plus «مرکز شهر را هم ببین».

## Post-v1 — Feature pack 2 (docs/06-prompt-feature-pack.md)

Built in the requested order, one commit per feature.

- **F10 Trust signals ✅** — seller rows and the shop sheet carry «کامل بودن اطلاعات» (0–3 with reasons), website/Instagram buttons, «ساعت کاری ثبت‌شده/ثبت نشده», credit-payment channel wording, warranty, fast delivery and «N محصول دیگر در همین دسته»; ranking tie-breaker 0.05 (#76–78). Unit tests for the score, Instagram links and both payment wordings. Scenario: 24 cards with the row, «گوشی مارکت» → «وب‌سایت» link, «آروان دیسین» → «اعلام‌شده (کانال نامشخص)» (`24-trust-signals.png`).
- **F11 Best time to visit ✅** — `lib/data/hours-stats.ts` (histogram, best window, Friday share, sentence, start hint), `best_time_to_visit` tool (sellers / mall / shop), `VisitTimeCard` (day tabs + 24-cell heatmap) behind «کی برم؟» on the seller list, plan header «بهترین زمان برای این مسیر» with a «شروع از …» chip, mission `verify.hours` attaches the card. A17 sellers: Sunday 11–19 at 91 %, Friday 38 % closed (#80). Unit tests on hand-made schedules; `pnpm features`; scenario (`25-visit-time.png`).
- **F8 Spec Q&A ✅** — `lib/search/spec-qa.ts` (topics + keyword rows + grounding check), `lib/agent/spec-qa.ts` (product choice, guarded LLM fallback), `product_specs_qa` tool, `SpecAnswerCard` with evidence chips → full spec table; auto mode routes spec questions (#82–84). 14 unit tests; 8 golden questions in `pnpm features` (NFC, weight, battery, screen, RAM, colour, charger watts, a missing spec → «نیامده»); scenario (`26-spec-answer.png`). Also: «چرا این اول شد؟» is answered by `explain_rank` from the score breakdown (#85).
- **F4 Ready-to-send seller message ✅** — `lib/sim/compose.ts` (template, phone normalization, WhatsApp/SMS/Bale/copy links), `lib/sim/seller-message.ts`, `compose_seller_message` tool, `GET /api/compose`, `SellerMessageSheet` (intent chips, editable textarea, channel buttons, test-numbers note) from the seller card's «پیگیری» picker and follow-up rows with no answer (#86). Unit tests; scenario (`27-seller-message.png`).
- **F5 Bargaining card ✅** — `lib/search/market-stats.ts` (quantiles, position, target rule, talking points) and `lib/search/market.ts` (DB + nearby cheaper seller), `bargaining_card` tool, `GET /api/bargain`, `BargainCard` (range bar, points, target → «پیام با این قیمت» via F4) as a chip on seller cards and inside the shop sheet (#87). Unit tests; `pnpm features` (top A17 seller: below median −9.4 %, fair; a pricier one gets a target); scenario (`28-bargain-card.png`).

## Final status

- `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` → green (169 unit tests; golden 15/15 queries + 10/10 seller checks + 45/45 mission checks).
- Demo scenario §13 steps 1–7, history/memory (step 8) and a compound mission (step 9): `pnpm scenario` 33/33 (phone, desktop and Docker), `?demo_time=` and `/demo-reset?name=` supported.
- All three LLM providers verified live on 2026-10-23 (`pnpm llm-check`: 3 ok).
- CI: GitHub Actions (install → typecheck → lint → test) on every push.
- Parsed malls for 4,088 shops (after parser refinements in M1).

Known issues / gaps:
- Sign-in has no password: anyone who types the same name sees the same chats (by design for the demo, decision #43).
- Product images (image.torob.com) did not load from the build machine (TLS errors / timeouts); a placeholder is shown until an image loads.
- Live demo URL and the official dataset link are placeholders in README until the owner deploys / adds the link.
