# Claude Code Run Plan — zero hand‑written code

> راهنمای استفاده (فارسی): حالت پیش‌فرض این است که **پرامپت شروع در `docs/03-kickoff-prompt.md`** را بدهی و Claude Code همه milestoneها را خودش پشت سر هم بزند. این فایل برای وقتی است که بخواهی مرحله‌به‌مرحله کنترل کنی یا Claude Code وسط کار متوقف شد و باید از یک milestone مشخص ادامه بدهد: پرامپت همان milestone را paste کن. پرامپت‌ها به انگلیسی‌اند چون خروجی بهتر می‌دهند. دمو را خودت ضبط می‌کنی (§13 اسپک = سناریو).
>
> **قبل از شروع:** `data/` با سه CSV سر جایش باشد؛ کلیدهای LLM را در `.env` بگذار؛ Docker روی سیستم بالا باشد.


---

## Kickoff prompt (paste once, at the very start)

```
You are the sole engineer on a hackathon project; you build everything yourself. Read docs/01-master-build-spec.md fully — it is the source of truth and every decision is already made. Skim docs/00-strategy-and-ideas.md (Persian) for background only.

Working rules for this whole project:
- Follow the spec's milestones M0→M6 in order. Do not start a milestone until the previous milestone's acceptance checks pass; run them yourself and show me the output.
- Prefer the simplest implementation that satisfies the spec. No speculative abstractions, no extra features beyond the spec unless they cost < 10 minutes.
- Record every deviation from the spec in docs/DECISIONS.md (one line each, with reason).
- Keep a running docs/PROGRESS.md: what is done, what is next, known issues. Update it at the end of every milestone.
- All user-facing text is Persian (RTL, Persian digits). Code, comments, commits in English.
- Commit at the end of each milestone with a conventional commit message.
- If an LLM provider call fails, the UI must still work via the non-LLM controls (ContextBar, /api/sellers).
- Never fabricate data: every number shown must come from the database.

Start with milestone M0 now.
```

---

## M0 — Scaffold

```
Milestone M0 (spec §2, §3, §10 partial): scaffold the project.

Do:
1. Next.js 15 App Router + TypeScript + pnpm; Tailwind; shadcn/ui initialized with RTL support; self-hosted Vazirmatn (woff2 in /public/fonts) as the default font; <html lang="fa" dir="rtl">; mobile viewport meta; a centered max-w-[520px] layout shell.
2. docker-compose.yml with db (postgres:16, extensions pg_trgm + unaccent created via init SQL), app, caddy; Dockerfile multi-stage standalone; Caddyfile using {$APP_DOMAIN}. For now I will run the app with `pnpm dev` against the compose db.
3. Drizzle set up (lib/db/schema.ts, client.ts, migrate script) with an empty initial migration.
4. lib/llm.ts exactly as in spec §2 with the three providers; .env.example with every variable in §2.
5. scripts/llm-check.ts: for the configured provider, run a generateText with one trivial tool and print the tool call. 
6. app/api/healthz/route.ts returning {ok, db, counts (0 for now), llm_provider}.
7. README skeleton with quick start.
8. Git: `git init` on main (skip if already a repo), .gitignore (node_modules, .next, .env*, data/*.csv, data/*.zip, logs, coverage), MIT LICENSE, first commit; add .github/workflows/ci.yml (install, typecheck, lint, test). Remote: use `origin` if it exists; otherwise create the repo with `gh repo create torob-seller-agent --public --source=. --remote=origin --push` if `gh auth status` succeeds; otherwise commit locally and tell me to add the remote. Push after every milestone whenever a remote exists.

Acceptance: `docker compose up -d db`, `pnpm migrate`, `pnpm dev` → GET / renders an RTL page with Vazirmatn; GET /api/healthz ok; `pnpm llm-check` succeeds with LLM_PROVIDER=openai, then with google, then with openrouter (use the keys in .env; if a key is missing, report it and continue). Show me the outputs, then commit.
```

---

## M1 — Data layer

```
Milestone M1 (spec §4): data layer.

Do:
1. Drizzle schema for shops, products, offers, categories, sessions, followups, plans exactly as in §4.2, including derived columns and indexes (GIN trigram on products.title_norm and products.search_text and categories.name_norm; btree on shops(lat,lon), shops(mall_key); offers(product_id), offers(shop_id)). Generate and apply the migration.
2. lib/fa/normalize.ts, digits.ts, format.ts per §4.4 with Vitest tests (Arabic ی/ک, Persian digits, ZWNJ variants, formatToman, relativeDays).
3. lib/data/mall.ts per §4.5 with tests on ≥10 real addresses pulled from data/shops.csv (include «پاساژعلاءالدین» without a space, «پاساژ علاالدین ۲», «طبقه همکف», «منفی یک», Persian digits in unit numbers). Alias map for علاءالدین and چارسو spellings.
4. lib/data/hours.ts per §4.6 with tests (open now, closes at, closed Friday, unknown/empty, unsupported, demo_time override, Asia/Tehran).
5. lib/data/quality.ts per §4.7.
6. scripts/seed.ts: stream the three CSVs from DATA_DIR, parse `null` literals and JSON strings, bulk insert in batches of 5000 (use COPY via pg if simpler), then run derivations (normalized fields, mall parse, hours_known, quality flags, product aggregates seller_count/min_price/median_price/primary_image, shop aggregates has_offers/offer_count/payment flags, categories table). Idempotent. Print counts and fail if they deviate >1% from: shops 6476, products 225903, offers 331506.
7. Update healthz counts.

Acceptance (run and show me):
- `pnpm seed` completes in < 5 min with correct counts.
- `pnpm test` green.
- SQL checks: (a) product_d24b597176bdf2a82035dcc2 has 26 distinct shops with offers within 1 km of (35.6957, 51.4105) using haversine; (b) shop_539f4a371b4d8fcb9c38c717 has mall_key علاءالدین, floor_num 6, unit_label 656; (c) count of offers by freshness bucket roughly fresh≈26%, recent≈32%, stale≈36%, unknown≈0.2% (as of DATASET_AS_OF=2026-10-13); (d) number of shops with has_installment=true is between 100 and 300; (e) top 5 mall_key by shop count includes علاءالدین, بوشهری, چارسو.
Commit.
```

---

## M2 — Search & ranking API

```
Milestone M2 (spec §5, §12): search and sellers API, no UI yet.

Do:
1. lib/search/categories.ts routeCategories(): trigram top-15 candidate categories, then generateObject with the fast model picking ≤5 categories, keywords, budget (parse Persian/English numbers and «میلیون/هزار/تومن»), must-have features. LRU cache.
2. lib/search/products.ts searchProducts() per §5.2 including budget handling with fallback and templated Persian `why` lines; compareProducts() per §5.3.
3. lib/search/sellers.ts + score.ts per §5.4: bounding-box prefilter + haversine, dedupe per shop (min price, offer_count), filters, explainable score with intent weights, `why` phrases, clusters by mall_key, maybe_shops (category-only, separate array), relaxations and radius_suggestion when < 3 results. Include open-state via lib/data/hours.ts with optional demo time.
4. shopDetails() per §6.2.
5. Route handlers: GET /api/sellers (query params: product_id, lat, lon, radius_m, filters as booleans, max_price, intent, demo_time) and GET /api/products/search?q= for debugging.
6. scripts/golden.ts implementing the 15 golden queries in §12 (fill the expected product ids by querying the DB now) plus the seller checks; prints a pass/fail table.

Acceptance: `pnpm golden` ≥ 12/15 product queries pass and all seller checks pass; `/api/sellers` for A17 128/4 at the default location, radius 1000, returns 26 rows in < 300 ms warm, each with price/price_flag/freshness/price_age_days/distance_m/open/mall/conditions/score/why; with installment=true returns ≤ 2 rows plus a relaxation hint. Show me the golden table and one sample row JSON. Commit.
```

---

## M3 — Agent + core UI

```
Milestone M3 (spec §6, §9): agent with tools and the core mobile UI.

Do, in this order:
1. lib/agent/state.ts (SessionState, defaults: radius 1000, intent balanced, default location فردوسی 35.6957/51.4105 labeled «فردوسی (پیش‌فرض)»), session cookie, GET/PATCH /api/session.
2. lib/agent/tools.ts with zod schemas for: clarify_need, search_products, compare_products, set_context (text location → match against distinct shops.location_label and mall names, use centroid), find_sellers, shop_details. Each result carries a `ui` discriminator. Truncate what the LLM sees to top 6 rows + aggregates; the UI gets the full payload.
3. lib/agent/system-prompt.ts in Persian implementing every policy in §6.3, with the compact session state appended.
4. app/api/chat/route.ts: streamText with model('chat'), tools, stopWhen: stepCountIs(5), toUIMessageStreamResponse; load/save session; 25 s timeout; graceful Persian error part.
5. UI (mobile-first, 390px, RTL): page.tsx with useChat; Header; ContextBar with LocationSheet (MapLibre + OSM tiles, GPS button, search over location labels/malls), RadiusSheet, BudgetSheet, ConditionsSheet, IntentSegmented — all patching /api/session and re-fetching /api/sellers to update the last SellerList in place WITHOUT calling the LLM; first-visit hero with the 4 scenario chips from §9.1; ProductCard (+ multi-select compare up to 4), CompareTable, SellerList (count header, cluster chips that filter by mall, sort segmented, relaxation banner, collapsed maybe_shops section labeled «فقط دسته فعالیت»), SellerCard with the three-field block (price + PriceFlagBadge; FreshnessBadge green/amber/red/gray; AvailabilityBadge «تأیید نشده»), distance + open label, MallChip, condition chips or «شرایط اعلام نشده», why line, actions (پیگیری placeholder, جزئیات sheet via shop_details, افزودن به برنامه); SuggestedActions chips computed server-side from state; Composer. Persian digits and formatToman everywhere. Skeletons for async blocks. Map panel toggle with markers synced to the list (lazy-loaded).

Acceptance (show screenshots at 390px using Playwright or Chrome headless):
- Scenario §13 steps 1–4 work: chip → clarify (≤1) → 3 product cards with why → compare two → pick → 26 sellers with cluster chips → «الان باز» + radius 500 m via ContextBar updates the list with no network call to /api/chat → «قسطی» gives ≤2 + relaxation banner → remove filter → ask «چرا این اول شد؟» and get an explanation grounded in why/score_breakdown.
- Switching LLM_PROVIDER between the three providers works without code changes (run step 1 with each).
- No console errors; no horizontal scroll; tap targets ≥ 44px.
Commit.
```

---

## M4 — Intelligence: follow‑ups, alternatives, checklist

```
Milestone M4 (spec §7, §8 alternatives, §6.2 remaining tools).

Do:
1. lib/sim/seller.ts: deterministic ground truth from sha256(SIM_SALT + offer_id) with the probabilities in §7 (by freshness; closed-now rules for call vs message; price_changed delta; latency 1.5–4 s). lib/sim/persona.ts: fast-model generated 2–4 line Persian transcript constrained to the truth, with template fallback on error/timeout (3 s).
2. followups table wiring: POST /api/followup {offer_ids, channel, question} creates rows (pending) and runs the simulations concurrently (in-process; setTimeout is fine), GET /api/followup?ids= returns statuses; the chat tool contact_seller calls the same service. Persist statuses into session state.
3. find_alternatives tool per §6.2/§8 (same product elsewhere, prefer same mall; similar products in same shop/mall within ±20% price), with why lines.
4. purchase_checklist tool (fast model, cached per category, 5–7 bullets, Persian).
5. UI: FollowupBoard (live polling every 1 s until resolved, skeleton rows, expandable transcript, status badges, CTAs «جایگزین پیدا کن» / «قبول قیمت جدید», simulation disclaimer line); SellerCard AvailabilityBadge updates to تأیید شد / ناموجود / قیمت جدید / پاسخ نداد with time; «پیگیری» action opens channel choice (پیام / تماس); AlternativesPanel with two tabs; Checklist component; SuggestedActions after sellers includes «پیگیری ۳ تای اول».
6. System prompt proactive rules verified: out_of_stock → agent calls find_alternatives automatically in the same turn when the follow-up resolves during the turn, or on the next user message otherwise; stale price → suggests پیگیری; closed seller → offers open alternatives or next opening time.
7. Tune SIM_SALT so the top-3 sellers of A17 128/4 at the default location (balanced intent, radius 1000) produce mixed outcomes (at least one confirmed, one out_of_stock). Record the salt in docs/DECISIONS.md and .env.example.

Acceptance: scenario §13 step 5 works end-to-end with live status updates within 5 s; transcripts visible; alternatives appear automatically after out_of_stock, including one in the same mall; checklist renders for a phone. Unit tests for the simulator determinism and probability buckets. Commit.
```

---

## M5 — Trip plan + polish

```
Milestone M5 (spec §8 plan_trip, §9.3 UX rules, §14).

Do:
1. lib/plan/trip.ts per §8 (group by mall_key, nearest-neighbor order from start, floor ordering inside a mall, walking 80 m/min, +5 min per shop, +3 min per mall entry, open-at-ETA validation with warnings, nav links for OSM/Google/Neshan). plan_trip tool + POST /api/plan; persist to plans; /plan/[id] read-only page with share (copy link) button.
2. TripPlan component (numbered steps grouped by mall, ETA, warnings, nav links, «چک‌لیست خرید» button, «اشتراک‌گذاری»).
3. Polish pass against §9.3: empty states with one tappable fix everywhere (no sellers in radius → radius suggestion button; price null → «قیمت ثبت نشده» + پیگیری; LLM error → controls still work), skeletons, Persian digits audit (grep for ASCII digits in rendered UI), safe-area composer, 44px targets, no horizontal scroll, focus states. Dark mode only if < 20 min.
4. Performance: lazy-load MapLibre; ensure / loads without map; check that the chat route truncates tool payloads to the LLM (< 8k tokens per step).

Acceptance: full scenario §13 (steps 1–7) completed in < 2 minutes of interaction on a 390px viewport; Lighthouse mobile performance ≥ 80 on / without map; zero console errors; `pnpm typecheck && pnpm lint && pnpm test && pnpm golden` all green. Provide screenshots of each step. Commit.
```

---

## M6 — Deploy

```
Milestone M6 (spec §10, §14): production deployment.

Do:
1. Finalize Dockerfile (standalone, non-root, HEALTHCHECK), docker-compose.yml (db volume + healthcheck, app depends_on healthy, env_file .env, ./data:/data:ro, `pnpm migrate` on start, AUTO_SEED=true seeds if products is empty), Caddyfile with {$APP_DOMAIN}; restart: unless-stopped.
2. README: pitch (fa + en), screenshots, architecture (mermaid), quick start (`git clone && cp .env.example .env && docker compose up -d`), env table, how the seller simulation works and why (fake numbers in dataset), transparency rules, demo link placeholder, judging-criteria map (which feature addresses which criterion).
3. docs/DECISIONS.md and docs/PROGRESS.md final.
4. GitHub: CI green; docs/screenshots/ committed and referenced from README; docs/DEMO.md (demo script from spec §13); push everything; tag v1.0 and push the tag.
5. Deploy on the VPS I give you (I will provide SSH access or run the commands myself; produce an exact ordered command list `docs/DEPLOY.md` if you cannot reach the server). Verify over HTTPS: /api/healthz ok with counts, scenario §13 works on the public URL, restart resilience (`docker compose restart app` keeps data).

Acceptance: public HTTPS URL working; healthz green; scenario passes on the deployed site; README accurate and judge-ready on GitHub; CI green; tag v1.0 pushed.
```

---

## If things go wrong (paste as needed)

```
Something is blocked and cannot be fixed. Apply the spec's cut order (§11) only for the blocked part: drop dark mode, then the map panel (keep the list with distances), then purchase_checklist. Do NOT cut: three-field transparency on seller cards, ContextBar re-filtering without LLM, follow-up board with simulated outcomes, automatic alternatives, deployment. Update docs/PROGRESS.md with what was cut.
```

```
The LLM provider is flaky. Add: 25 s timeout, one retry with exponential backoff, and a cached canned path for the four hero scenario chips so the demo never blocks on the provider (cache the first successful tool-call sequence per chip in the DB and replay it if the provider fails). Keep the live path as default.
```

```
Record the demo helper: add `?demo_time=2026-10-25T16:00` support (already in spec) and a hidden `/demo-reset` route that clears my session so I can re-record cleanly.
```
