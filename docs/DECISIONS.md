# Decisions & deviations from the spec

One line per deviation from `docs/01-master-build-spec.md`, with the reason.

| # | Milestone | Decision | Reason |
|---|---|---|---|
| 1 | M0 | Docker base image `node:22-alpine` instead of `node:20-alpine`; CI on Node 22. | `ai@7`, `@ai-sdk/*@4` and `@openrouter/ai-sdk-provider@3` declare `engines.node >= 22` (Node 20 is EOL). |
| 2 | M0 | Vercel AI SDK **v7** (latest stable, `ai@7.0.148`) instead of v5. `stepCountIs` is kept (v7 alias of `isStepCount`); structured output uses `generateText({ output: Output.object(...) })` instead of `generateObject`. | Kickoff asks for latest stable; `generateObject` is the legacy API in v7. |
| 3 | M0 | `postgres:16-alpine` image. | Same major version and contrib extensions (pg_trgm, unaccent), smaller image. |
| 4 | M0 | Host ports are configurable: `DB_PORT` (db), `HTTP_PORT`/`HTTPS_PORT` (Caddy), `PORT` for `pnpm dev` (default 3010). | Dev machine already uses 5432/3000/80; defaults stay 5432/80/443 on a VPS. |
| 5 | M0 | Inside the container, migrate/seed run as esbuild bundles: `node scripts/migrate.cjs`, `docker compose run --rm app node scripts/seed.cjs` (instead of `pnpm migrate` / `pnpm seed`). | The Next standalone runtime image has no pnpm/tsx/devDependencies; bundles keep the image small and non-root. |
| 6 | M0 | Empty optional env vars (e.g. `OPENAI_BASE_URL=`) are deleted at startup (`instrumentation.ts`, `scripts/load-env.ts`). | `@ai-sdk/openai` throws "baseURL must be a non-empty string" at import time when the var is an empty string. |
| 7 | M0 | `video/` (challenge recording) is git-ignored. | Not part of the code submission; large binary. |
| 8 | M0 | GitHub repo created with `gh repo create` (spec §10.1 says the owner creates it). | The owner's kickoff message explicitly asks for `gh repo create … --public` when `gh` is authenticated. |
| 9 | M0 | shadcn/ui v4 CLI (`radix-nova` preset, `--rtl`), which imports `cn` from the `cn` package. | Current shadcn generator; RTL support is built in. |
| 10 | M1 | Extra derived columns: `shops.unit_kind`, `shops.installment_in_person`, `shops.torobpay_in_person`, `products.brand_display`, `products.offer_count`, `offers.has_warranty`, `followups.question`, `followups.due_at`. | UI needs «واحد/پلاک», the payment channel («حضوری تأییدشده» vs «اعلام‌شده»), a display brand (75% of `brand_name` is null → inferred from titles), and a due time for simulated replies. |
| 11 | M1 | All derivations (normalization, mall, hours, quality, aggregates) are computed in TypeScript during 4 streaming passes and loaded with `COPY` — no post-load `UPDATE`s. | 35 s total seed on a laptop; avoids rewriting 225k wide product rows and their GIN indexes. |
| 12 | M1 | `unit_label` is stored with ASCII digits (UI renders Persian digits); `mall_key` uses Persian digits («علاءالدین ۲») as in the spec examples. | Consistent querying; matches the acceptance checks. |
| 13 | M1 | `DATASET_AS_OF` is interpreted as the end of that day in Tehran. | A price changed on the snapshot day is «امروز» (0 days), never negative. |
| 14 | M1 | Acceptance (a): `product_d24b597176bdf2a82035dcc2` has **26 sellers in total, 24 within 1 km** (haversine; one at 1,015 m and one 10 km away in «آسمان»). Golden seller checks use 24. | The spec's "26 within 1 km" counts every seller of the product; no distance formula puts the 10 km shop inside 1 km. |
| 15 | M1 | Freshness split is fresh 22.8% / recent 34.5% / stale 42.4% / unknown 0.2%. | Consistent with spec §4.1 "58% ≤ 30 d"; the run plan's 26/32/36 split does not add up with that figure. |
| 16 | M2 | Product ranking = pg_trgm **word_similarity** retrieval (GIN, `<%`, threshold 0.4, top 300) + TypeScript rerank: token coverage (exact / model-suffix «t13»≈«t13x» / stem), head-noun match, category, log seller count, budget fit. Category-only queries («گوشی موبایل») switch to popularity ranking. | The spec's `similarity()` weights cannot separate «رم ۶» from «رم ۴» or find «T13x» for «T13»; this passes 15/15 golden queries. |
| 17 | M2 | `routeCategories` is deterministic-first (category votes from the best-matching products + category-name trigram); the fast LLM is called only when the top category's vote share is < 0.6, with a 6 s timeout and rules fallback. | Saves one LLM round-trip per turn on clear queries; routing still works when the provider is down. |
| 18 | M2 | Deterministic budget parser (`lib/search/query.ts`) runs before the LLM: «تا/زیر/حداکثر/حدود/بین … میلیون/هزار/تومن»; spec numbers («۲۰ هزار» میلی‌آمپر، «۲۰ وات»، «تا ۲ کیلومتر») are not budgets. | Reliable «تا ۶۰ میلیون» → 60,000,000 without the LLM. |
| 19 | M2 | With a budget, `search_products` returns in-budget items first and puts the best option ≤ +15% above budget in slot 4 flagged «کمی بالاتر از بودجه». | Matches demo step 1 (A17 128/6 slightly above budget) without hiding in-budget options. |
| 20 | M2 | `pnpm golden` calls the same library functions as `/api/sellers` and `/api/products/search` instead of HTTP. | No running server needed; identical code path. |
| 21 | M2 | Zero-length shifts («00:00–00:00» as a second shift) are ignored when computing open/closed. | They are placeholders in the data and produced «باز است · تا ۰۰:۰۰». |
| 22 | M2 | Seller row adds `lat`, `lon`, `hours_known`, `score_breakdown`, `conditions.{installment,torobpay}_in_person`, `mall.{key,floor_num,unit_kind}`; the LLM sees a compact projection (M3). | Map markers, honest payment-channel labels and «چرا این اول شد؟» need them. |
