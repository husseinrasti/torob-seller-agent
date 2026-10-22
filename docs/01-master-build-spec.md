# Master Build Spec — Torob In‑Person Shopping Assistant ("همراه خرید")

Version 1.0 · 2026‑10‑22 · Audience: the coding agent (Claude Code), which builds the whole project autonomously. Everything in this document is a decision, not a discussion. When something is ambiguous, pick the simplest option that keeps the demo scenario (§13) working end‑to‑end and note it in `docs/DECISIONS.md`.

Read `docs/00-strategy-and-ideas.md` (Persian) once for background. This file is the source of truth for implementation.

---

## 1. Goal and judging

Build a mobile‑first, Persian (RTL) web app in which an AI agent guides a shopper in Tehran through **four steps**:

1. **Need → Product**: help the user figure out *what* to buy (clarify, suggest 3 candidates with reasons, compare specs and market price).
2. **Product → Sellers near me**: find shops that list the product within a radius of the user's location, with filters (budget, open now, installment/credit, Torob Pay, fast delivery, warranty).
3. **Compare sellers**: price, price freshness, distance, open/closed now, mall/floor/unit, purchase conditions — with an explainable ranking.
4. **Follow up & verify**: the agent "contacts" the seller (simulated message/call), confirms stock/price, and if unavailable **automatically proposes alternatives**; then builds a visit plan.

Judging (300 pts): Product 75 · UX 75 · Intelligence 50 · Deploy 40 · Engineering 40 · Dataset 20. Priorities in that order. "Product and UX first; scalable engineering second" is stated by the organizers.

Hard transparency rules from the challenge text (must be visible in UI):
- Never conflate **listed price**, **time of last price change**, and **confirmed availability** — three separate fields, three separate visual treatments.
- Show **unknown** explicitly ("ثبت نشده" / "اعلام نشده"), never blank, never guessed.
- Distinguish a shop that **lists the product** (has an offer) from a business that merely has a matching **activity category** (may sell it). Category alone is not availability.
- The user can change **radius, budget and purchase conditions** easily and see results update.

Non‑goals: online checkout/payment, real phone calls, auth/accounts, multi‑city, admin panels.

---

## 2. Fixed technology decisions

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js 15 (App Router), TypeScript, pnpm** | Single repo, full‑stack. Route handlers for API. `output: 'standalone'` for Docker. |
| UI | Tailwind CSS + shadcn/ui (RTL), **Vazirmatn** font (self‑hosted woff2), lucide icons | `<html lang="fa" dir="rtl">`. Mobile first (390px), max content width 520px centered on desktop. |
| Map | **MapLibre GL JS** with OpenStreetMap raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) | Lazy‑load; list view must work without map. |
| Agent runtime | **Vercel AI SDK** (`ai` latest stable; v5 API: `streamText`, `tool`, `stepCountIs`, `useChat`, UIMessage parts). Do **not** build a custom agent loop. | Generative UI: tool results are rendered as React components by part type. |
| LLM providers | `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`. Selected by env (`LLM_PROVIDER`, `LLM_MODEL`). | One factory `lib/llm.ts`. Two logical models: `chat` (tool‑calling) and `fast` (classification, seller persona). Both default to the same model unless `LLM_FAST_MODEL` is set. |
| DB | **PostgreSQL 16** with `pg_trgm` and `unaccent` extensions. **Drizzle ORM** for schema/migrations; raw SQL for search queries. | No pgvector/embeddings in v1 (time). Design search so an embedding column can be added later. |
| Deploy | Docker Compose: `db` (postgres:16), `app` (Next standalone), `caddy` (auto TLS). `pnpm seed` loads CSVs. `GET /api/healthz`. | Must come up with `docker compose up -d` on a fresh VPS. |
| Testing | Vitest for pure functions (normalizer, mall parser, scoring, simulator). `pnpm golden` script hits the search API with the golden queries (§12) and prints pass/fail. | No E2E suite required; a Playwright smoke script that loads `/` and screenshots mobile viewport is nice‑to‑have. |

Env vars (`.env.example` must list all):
```
DATABASE_URL=postgres://app:app@db:5432/app
LLM_PROVIDER=openai            # openai | google | openrouter
LLM_MODEL=gpt-4.1-mini         # any tool-calling capable model id for the provider
LLM_FAST_MODEL=                # optional
OPENAI_API_KEY=
OPENAI_BASE_URL=               # optional (proxies)
GOOGLE_GENERATIVE_AI_API_KEY=
OPENROUTER_API_KEY=
DATA_DIR=./data                # where shops.csv / products.csv / offers.csv live
DATASET_AS_OF=2026-10-13       # "now" for price-age computations in demo mode
APP_URL=https://example.com
```

`lib/llm.ts`:
```ts
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
export function model(kind: 'chat' | 'fast' = 'chat') {
  const id = kind === 'fast' && process.env.LLM_FAST_MODEL ? process.env.LLM_FAST_MODEL : process.env.LLM_MODEL!;
  switch (process.env.LLM_PROVIDER) {
    case 'google': return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
    case 'openrouter': return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id);
    default: return createOpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined })(id);
  }
}
```
Provider switching must require **no code change**. Verify all three providers at least once with a trivial tool call.

---

## 3. Repository layout

```
.
├── app/
│   ├── layout.tsx                 # RTL, font, theme, viewport
│   ├── page.tsx                   # main assistant screen
│   ├── plan/[id]/page.tsx         # shareable visit plan (read-only)
│   └── api/
│       ├── chat/route.ts          # streamText + tools
│       ├── session/route.ts       # get/patch session state (chips & filters bypass LLM)
│       ├── sellers/route.ts       # GET sellers for product+filters (used by UI re-filtering)
│       ├── followup/route.ts      # POST start follow-up; GET status (polling/SSE)
│       ├── plan/route.ts          # POST build plan
│       └── healthz/route.ts
├── components/                    # see §9
├── lib/
│   ├── llm.ts
│   ├── db/{schema.ts,client.ts,migrate.ts}
│   ├── fa/{normalize.ts,digits.ts,format.ts}
│   ├── data/{mall.ts,hours.ts,quality.ts}
│   ├── search/{products.ts,categories.ts,sellers.ts,score.ts}
│   ├── agent/{tools.ts,system-prompt.ts,state.ts}
│   ├── sim/{seller.ts,persona.ts}
│   └── plan/{trip.ts}
├── scripts/{seed.ts,golden.ts,smoke.ts}
├── data/                          # CSVs (git-ignored, mounted in Docker)
├── docker-compose.yml, Dockerfile, Caddyfile
├── docs/
└── README.md
```

---

## 4. Data layer

### 4.1 Source files (`data/`)
- `shops.csv` (6,476): `address, category_names(json[]), contacts(json[]), instagram, lat, location_label, lon, name, payment_options(json[]), shop_id, supports_fast_delivery(bool|null), website_url, weekly_hours(json)`
- `products.csv` (225,903): `brand_name, category_name, image_urls(json[]), model, persian_title, product_id, specs(json[{key,section,value}])`
- `offers.csv` (331,506): `description, last_price_changed_at(iso), offer_id, price_toman, product_id, seller_title, shop_id, warranty(json|null)`
- Literal `null` strings mean missing. Nested JSON is in compact strings.

Known facts that drive design (from profiling):
- Only **3,792 shops have offers**; 2,684 have none (887 of those have categories only).
- 38,899 products have ≥2 sellers; the rest have one. A shop may list the **same product several times** (variants/colors) → dedupe per shop (min price, count).
- Price: 15,083 nulls; 211 offers > 1e10 toman and 5,062 < 10,000 toman are suspicious; median 3.64M.
- Price age (vs 2026‑10‑13): 26% ≤7d, 58% ≤30d, 6% >180d.
- Hours present for 3,011/3,792 active shops; `status` per day ∈ `declared | closed | unsupported`, empty `{}` = unknown.
- `payment_options` present for only **240** active shops (providers: ترب‌پی، اسنپ‌پی، دیجی‌پی، تارا، ازکی‌وام; `channel` ∈ `in_person | unknown`).
- 85% of shops are in central Tehran (فردوسی، شیخ هادی، بهارستان). 3,810 addresses contain a mall token; 4,224 contain «طبقه»; 6,012 contain «واحد/پلاک».
- Shop names (6,364) and all phone numbers are **fake**. Treat names as display only; never dial.
- The 22 Instagram + 90 website shops have real names; no special handling required.

### 4.2 Schema (Drizzle; names are final)

```
shops(shop_id pk, name, address, location_label, lat, lon, category_names jsonb, contacts jsonb,
      payment_options jsonb, supports_fast_delivery bool null, weekly_hours jsonb, instagram, website_url,
      -- derived
      mall_key text null, mall_name text null, floor_label text null, floor_num int null, unit_label text null,
      has_offers bool, offer_count int, has_installment bool, has_torobpay bool, payment_providers text[],
      hours_known bool, geom_lat double, geom_lon double)
products(product_id pk, persian_title, brand_name, category_name, model, image_urls jsonb, specs jsonb,
      -- derived
      title_norm text, search_text text, brand_norm text, seller_count int, min_price bigint null,
      median_price bigint null, primary_image text null)
offers(offer_id pk, product_id fk, shop_id fk, seller_title, description, price_toman bigint null,
      last_price_changed_at timestamptz null, warranty jsonb null,
      -- derived
      price_age_days int null, freshness text ('fresh'|'recent'|'stale'|'unknown'),
      price_flag text ('ok'|'suspicious_low'|'suspicious_high'|'missing'),
      warranty_provider text null, warranty_months int null, warranty_text text null)
categories(name pk, name_norm, product_count int, shop_count int)
sessions(id pk uuid, state jsonb, created_at, updated_at)
followups(id pk uuid, session_id, offer_id, shop_id, product_id, channel ('message'|'call'),
      status ('pending'|'contacting'|'confirmed'|'out_of_stock'|'price_changed'|'no_answer'),
      new_price bigint null, transcript jsonb, created_at, resolved_at)
plans(id pk uuid, session_id, payload jsonb, created_at)
```
Indexes: `offers(product_id)`, `offers(shop_id)`, GIN trigram on `products.title_norm` and `products.search_text`, GIN trigram on `categories.name_norm`, btree on `shops(lat, lon)`, `shops(mall_key)`.

### 4.3 Seed (`pnpm seed`)
- Stream CSVs (csv-parse), batch insert 5k rows via `COPY` or multi‑row inserts. Target < 5 min on a laptop. Idempotent (truncate + reload).
- After load, run derivation SQL/TS: normalization, mall parsing, hours flags, quality flags, aggregates, categories table.
- Log counts at the end; fail loudly if counts differ from §4.1 by >1%.

### 4.4 Persian normalization (`lib/fa/normalize.ts`) — pure, unit‑tested
- Arabic ي/ك → Persian ی/ک; remove tatweel (ـ) and diacritics; convert Persian/Arabic digits to ASCII for `*_norm` fields; collapse whitespace; normalize ZWNJ (keep a single `‌`, also index a variant with ZWNJ removed and one with ZWNJ→space); lowercase Latin; strip punctuation except `+`, `/`, `.` inside numbers.
- `search_text = title_norm + ' ' + brand_norm + ' ' + category_norm + ' ' + model + ' ' + top spec values (≤ 12: برند، مدل، رنگ، حافظه، رم، ظرفیت، توان، سایز)`.
- Display helpers (`format.ts`): `toFaDigits`, `formatToman(55990000) → "۵۵٬۹۹۰٬۰۰۰ تومان"`, `formatDistance(m) → "۳۵۰ متر" | "۱٫۲ کیلومتر"`, `relativeDays(n) → "امروز" | "۳ روز پیش" | "۲ ماه پیش"`.

### 4.5 Mall parser (`lib/data/mall.ts`) — pure, unit‑tested
Input: address string. Output `{ mall_key, mall_name, floor_label, floor_num, unit_label }`.
- Mall token regex: `(پاساژ|مجتمع تجاری|مجتمع|مرکز خرید|بازار|برج|ساختمان)\s*([^،,]+)` → `mall_name = token + ' ' + name.trim()`.
- `mall_key` = normalized name with spelling unification: `علاالدین|علاءالدین|علاء الدین → علاءالدین`; strip trailing `۱|1` ; keep `۲|2` as separate key (`علاءالدین ۲`). Also unify `چهارسو|چارسو → چارسو`. Store a small alias map.
- Floor: `طبقه\s*([^،,]+)` → label; map to number: `همکف→0, اول|۱|1→1, دوم|۲|2→2, سوم→3, چهارم→4, پنجم→5, ششم→6, منفی یک|منفی ۱|-۱→-1, زیرزمین→-1`.
- Unit: `(واحد|پلاک)\s*([^،,]+)` → label as written.
- Tests with at least 10 real addresses from the dataset, including «پاساژعلاءالدین» (no space) and Persian digits.

### 4.6 Hours (`lib/data/hours.ts`)
- `weekly_hours` keys: `sat..fri`; each `{status, shifts:[{start_time,end_time}]}`. `closed` = closed that day; `unsupported` or empty object = unknown.
- `openState(weekly_hours, now: Date, tz='Asia/Tehran') → { known: boolean, open: boolean|null, closesAt?: 'HH:mm', opensAt?: 'HH:mm', nextOpen?: {day, time}, label: string }` with Persian labels: «باز است · تا ۱۹:۰۰», «بسته است · فردا ۱۰:۰۰ باز می‌شود», «جمعه تعطیل», «ساعت کاری ثبت نشده».
- The app clock: real `now` by default; `?demo_time=2026-10-25T16:00` query param overrides (for recording the demo on a Friday, etc.).

### 4.7 Quality flags (`lib/data/quality.ts`)
- `price_age_days = DATASET_AS_OF - last_price_changed_at` (null → unknown).
- `freshness`: ≤7 `fresh`, ≤30 `recent`, >30 `stale`, null `unknown`.
- `price_flag`: null → `missing`; compute per‑product median over offers with sane prices (1e4..1e10); `suspicious_low` if price < 0.2×median or < 10,000; `suspicious_high` if > 5×median or > 1e10. Products with a single offer: only absolute bounds apply.
- Products: `seller_count` = distinct shops with offers; `min_price`, `median_price` over `ok` prices.
- Shops: `has_installment` = any payment option with provider in {اسنپ‌پی, تارا, ازکی‌وام, دیجی‌پی} or any `min_price_toman/max_price_toman` present; `has_torobpay` = provider ترب‌پی; keep `channel` so UI can say «حضوری تأییدشده» vs «اعلام‌شده (کانال نامشخص)».

---

## 5. Search and ranking

### 5.1 Category routing (`lib/search/categories.ts`)
`routeCategories(userText, hints) → { categories: string[], keywords: string[], budget?: {min,max}, mustHave: string[] }`
1. Trigram match of normalized user text against `categories.name_norm` → top 15 candidates.
2. Call `fast` model with a strict JSON schema (use AI SDK `generateObject`): pick ≤5 relevant categories from the candidates (or none), extract keywords (brand, model, capacity), budget in toman (parse «۶۰ میلیون», «۶۰ تومن» → 60,000,000; «۲ میلیون»), and must‑have features.
3. Cache results per normalized text in memory (LRU 500).

### 5.2 Product search (`lib/search/products.ts`)
`searchProducts({ text, categories?, budget?, limit=8 })`:
- SQL: `similarity(title_norm, q) * 0.6 + similarity(search_text, q) * 0.3 + (category_name = ANY(categories))::int * 0.4 + LEAST(seller_count, 10)/10 * 0.2` as `rank`; require `title_norm % q OR search_text % q OR category match`. Filter `median_price` within budget ±15% when budget given (fallback to no budget filter if < 3 results).
- Return compact rows: `{product_id, title, brand, category, image, seller_count, min_price, median_price, key_specs: [{k,v}] (≤5)}`.
- Reasons: generate a one‑line Persian «چرا» per candidate in the **tool**, not the LLM: e.g. «ارزان‌ترین گزینه در بودجه»، «بیشترین فروشنده (۲۸)»، «رم ۶ گیگ بالاتر از بقیه».

### 5.3 Product comparison
`compareProducts(ids[])` → union of spec keys where values differ (≤ 12 rows), plus `min_price/median_price/seller_count` row. Return a table structure; the UI renders it.

### 5.4 Sellers (`lib/search/sellers.ts` + `score.ts`)
`findSellers({ product_ids[], lat, lon, radius_m, filters, intent })`:
- Join offers→shops within radius (haversine in SQL, pre‑filter by bounding box). Dedupe per shop: min price, `offer_count`.
- Filters: `max_price`, `open_now`, `installment`, `torobpay`, `fast_delivery`, `warranty_required`, `hide_stale`, `hide_suspicious`.
- **Relaxation**: if < 3 results, respond with `relaxations: [{filter, would_add: n}]` computed by re‑running without each filter, and also `radius_suggestion` (next radius among 500, 1000, 2000, 3000, 5000 m that yields ≥5).
- Also return `maybe_shops`: up to 5 shops **without an offer** for the product whose `category_names` contain the product's category, within radius — in a separate array, no price, labeled «فقط دسته فعالیت».
- Score (0..1, explainable): 
  `price 0.35 · distance 0.25 · freshness 0.15 · open_now 0.15 · conditions 0.10` where price = 1 − (price−min)/(max−min) over the result set, distance = 1 − d/radius, freshness fresh=1/recent=0.6/stale=0.2/unknown=0.3, open_now open=1/unknown=0.5/closed=0, conditions = fraction of requested conditions satisfied. `intent ∈ cheapest|nearest|now|balanced` shifts weights (cheapest: price 0.6; nearest: distance 0.55; now: open 0.4).
  Return `score_breakdown` and `why: string[]` (≤2 Persian phrases, templated: «ارزان‌ترین در ۱ کیلومتر», «۳۵۰ متر فاصله», «قیمت امروز به‌روز شده», «الان باز است تا ۱۹:۰۰», «قسطی دارد»).
- Row shape (keep ≤ 400 bytes/row for the LLM; UI fetches the same shape):
  `{offer_id, shop_id, shop_name, price, price_flag, freshness, price_age_days, distance_m, open: {known, open, label}, mall: {name, floor_label, unit_label} | null, address_short, conditions: {installment, torobpay, fast_delivery, warranty_text}, offer_count, score, why[], followup_status?}`
- Group helper: `clusters: [{mall_key, mall_name, count, best_price}]` for the «۹ فروشنده در پاساژ علاءالدین» chip.

---

## 6. Agent

### 6.1 Session state (`lib/agent/state.ts`)
```ts
type SessionState = {
  need?: string; budget?: {min?: number; max?: number}; mustHave: string[];
  categories: string[]; candidates: string[] /* product_ids */; chosenProduct?: string;
  location?: {lat: number; lon: number; label: string; source: 'gps'|'map'|'text'|'default'};
  radius_m: number /* default 1000 */;
  filters: {open_now?: boolean; installment?: boolean; torobpay?: boolean; fast_delivery?: boolean; warranty_required?: boolean; max_price?: number};
  intent: 'balanced'|'cheapest'|'nearest'|'now';
  shortlist: string[] /* offer_ids */; followups: Record<string, FollowupStatus>;
  planId?: string; demoTime?: string;
}
```
- Stored in `sessions.state`; session id in an httpOnly cookie. `PATCH /api/session` applies partial updates from UI controls (chips, sliders, map) **without calling the LLM**; the UI then re‑fetches `/api/sellers` directly. The LLM sees the current state in every request (serialized compactly into the system prompt).
- Default location when unknown: **میدان فردوسی / جمهوری (35.6957, 51.4105)**, label «فردوسی (پیش‌فرض)», source `default`; UI shows a prominent «موقعیت من» button and a map picker.

### 6.2 Tools (`lib/agent/tools.ts`) — zod schemas, compact outputs
| Tool | Purpose | Notes |
|---|---|---|
| `clarify_need({question, chips[]})` | Ask one short question with ≤4 tappable chips | Use only when budget or use‑case is missing **and** the search would be too broad (>3 categories). Never ask two questions in a row. |
| `search_products({text, budget?, must_have?})` | Step 1 | Internally runs routing + search; updates `state.categories/candidates`. |
| `compare_products({product_ids})` | Step 1 | |
| `set_context({location?, radius_m?, filters?, intent?, chosen_product?})` | Mutate state from conversation («تا ۲ کیلومتر»، «فقط قسطی»، «نزدیک تجریش») | Location text → geocode against `shops.location_label` distinct values and mall names (centroid); no external geocoder. |
| `find_sellers({product_id?})` | Steps 2–3 | Uses state; returns rows + clusters + relaxations. |
| `shop_details({shop_id})` | Mall/floor/unit, today's hours, conditions, other offers of the same category in that shop (≤5) | |
| `contact_seller({offer_ids[], channel:'message'|'call', question?})` | Step 4 — starts simulated follow‑ups (async) | Returns `followup_ids`; UI polls. |
| `find_alternatives({offer_id, reason:'out_of_stock'|'price_changed'|'closed'})` | Step 4 | (a) same product, other sellers, nearest/cheapest, prefer same mall; (b) similar products (same category, price within ±20%) in the same shop or mall. Returns two short lists with `why`. |
| `plan_trip({offer_ids[]?})` | Visit plan from shortlist (default: all confirmed + pending) | §8 |
| `purchase_checklist({product_id})` | 5–7 Persian bullets of what to check in person for this category (e.g. phone: رجیستری، پلمب، سریال گارانتی) | Generated by `fast` model, cached per category in memory. |

Every tool result includes a `ui` discriminator so the client renders the right component. Tool outputs sent to the LLM are truncated to the top 6 rows + aggregates; the full rows go to the UI via the same tool part (AI SDK tool parts carry the full output; keep it ≤ 30 KB).

### 6.3 System prompt (`lib/agent/system-prompt.ts`) — Persian, with the state appended
Key policies (write them in Persian inside the prompt):
- You are «همراه خرید», an in‑person shopping assistant for Tehran. Answer in short, friendly Persian; max 2 sentences of text per turn; the cards carry the detail.
- **Never state a price, distance, availability or hours from memory. Only from tool results.** If data is missing say «ثبت نشده».
- Follow the four steps but do not force them: if the user names a product, skip to sellers. If the user names a location or condition, call `set_context` first.
- Proactive rules: price older than 30 days → suggest «پیگیری»; chosen seller closed now → offer open alternatives or the next opening time; follow‑up returned out_of_stock → call `find_alternatives` without asking; after 2+ confirmed sellers → offer `plan_trip`; before the plan → offer `purchase_checklist` once.
- End every turn with a concrete next step the user can tap (the UI renders `suggested_actions` from the last tool result; the model should mention it in one clause).
- Do not ask more than one clarifying question in a row. Prefer acting with defaults (budget unknown → show range; location unknown → default location, say it explicitly).
- When the user asks "why this one?" explain from `why`/`score_breakdown` only.

### 6.4 Chat route (`app/api/chat/route.ts`)
- `streamText({ model: model('chat'), system, messages, tools, stopWhen: stepCountIs(5) })`; return `toUIMessageStreamResponse()`.
- Load/save session state around the call. Persist `followups` statuses into state on each request.
- Timeouts: 25 s per LLM call; on provider error return a graceful Persian error part and keep the UI usable (controls still work without the LLM).

---

## 7. Seller simulator (`lib/sim/`)

Real contact is impossible (fake numbers). The simulator must be **deterministic, plausible, and honest in the UI** (badge: «شبیه‌سازی‌شده — در نسخه واقعی از طریق پیام‌رسان/تماس ترب»).

Ground truth per offer, derived from `sha256(offer_id)` → uniform `r ∈ [0,1)` (and `r2`, `r3` from further bytes):
- Base probabilities by freshness: fresh → out_of_stock 0.10, price_changed 0.08; recent → 0.18 / 0.15; stale/unknown → 0.35 / 0.25; missing price → price_changed becomes "price_quoted".
- If shop is **closed now** (known): `call` → `no_answer` (with «فردا ۱۰:۰۰ دوباره تلاش می‌کنم» suggestion); `message` → reply arrives but status is whatever truth says, prefixed «الان بسته‌ایم».
- `price_changed`: new price = old × (1 + δ), δ ∈ [−0.05, +0.15] from `r2`, rounded to 10,000.
- Latency: 1.5–4 s per follow‑up (from `r3`), run concurrently; statuses stream to the UI (poll `/api/followup?ids=` every 1 s or SSE).
- Transcript: 2–4 lines, generated by `fast` model with a seller persona prompt (name from shop, terse bazaar tone, Persian) constrained to the truth; **fallback templates** if the LLM fails or exceeds 3 s. Store transcript in `followups.transcript`.
- Follow‑up outcome updates the seller row: `followup_status`, `confirmed_price`, `confirmed_at`, and the three‑field display becomes: «قیمت ثبت‌شده ۵۹٬۹۰۰٬۰۰۰ · تغییر قیمت ۷ روز پیش · موجودی: تأیید شد (۲ دقیقه پیش)».

---

## 8. Alternatives and trip plan

`find_alternatives` — see §6.2. Ranking: same mall first (+0.2), then by seller score. Max 3 + 3.

`plan_trip` (`lib/plan/trip.ts`):
- Input: offers (shortlist), start = state.location, now (or demo time).
- Group by `mall_key` (null → own group). Order groups by nearest‑neighbor from start. Inside a mall, order by floor ascending.
- Walking time at 80 m/min; +5 min per shop; mall entry +3 min.
- Validate hours at estimated arrival; if closed, mark the step with «⚠️ در زمان رسیدن بسته است» and suggest reorder or next opening.
- Output steps: `{order, shop_name, mall, floor_label, unit_label, address_short, eta, open_at_eta, price, followup_status, nav_links: {osm, google, neshan}}`. Nav links are plain geo URLs (`https://www.openstreetmap.org/?mlat=..&mlon=..#map=19/..`, `https://maps.google.com/?q=lat,lon`, `https://neshan.org/maps/@lat,lon,18z`).
- Persist to `plans`, return `plan_id`; `/plan/[id]` renders read‑only with a share button (copy link).

---

## 9. UI

### 9.1 Screen: `/` (single screen, chat‑centric but control‑rich)
```
┌─────────────────────────────────────┐
│ Header: همراه خرید        [نقشه ▢]  │
│ ContextBar: 📍 فردوسی ▾ · ۱ کیلومتر ▾ · تا ۶۰ م ▾ · قسطی ✓ · باز الان │  ← sticky, each item opens a sheet
├─────────────────────────────────────┤
│ Messages (assistant text + cards)   │
│  • ProductCards (horizontal scroll) │
│  • CompareTable                     │
│  • SellerList (+ cluster chips)     │
│  • FollowupBoard                    │
│  • AlternativesPanel                │
│  • TripPlan                         │
│  • Checklist                        │
├─────────────────────────────────────┤
│ SuggestedActions chips (from state) │
│ Composer [🎤?] [متن...] [ارسال]     │
└─────────────────────────────────────┘
```
First visit (no messages): hero with one input and 4 scenario chips: «گوشی سامسونگ تا ۶۰ میلیون نزدیک من»، «هدفون بلوتوثی تا ۳ میلیون»، «قهوه‌ساز خانگی، نمی‌دونم کدوم»، «دوربین مداربسته برای مغازه». Plus «موقعیت من» button (geolocation → set_context) and a «انتخاب روی نقشه» link.

### 9.2 Components (props = tool output shapes)
- `ContextBar` — sheets: LocationSheet (map picker with MapLibre, search over location_labels/malls, GPS), RadiusSheet (500 m / 1 / 2 / 3 / 5 km segmented), BudgetSheet (slider + presets), ConditionsSheet (toggles: باز الان، قسطی/اعتباری، ترب‌پی، ارسال فوری، گارانتی، پنهان کردن قیمت‌های قدیمی/مشکوک), IntentSegmented (متعادل/ارزان‌ترین/نزدیک‌ترین/الان باز). Changes → `PATCH /api/session` → re‑fetch the last seller list in place (no LLM).
- `ProductCard` — image, title (2 lines), brand/category, «از ۵۳٬۹۰۰٬۰۰۰ تومان · ۲۸ فروشنده», key specs chips, `why` line, actions: «فروشنده‌های نزدیک», «مقایسه» (multi‑select up to 4).
- `CompareTable` — sticky first column, differing specs only, price row, «انتخاب» per column.
- `SellerList` — header with count + cluster chips («۹ در پاساژ علاءالدین»), sort segmented (امتیاز/قیمت/فاصله), `SellerCard` list, `maybe_shops` collapsed section «ممکن است داشته باشند (فقط دسته فعالیت)», relaxation banner when few results («با حذف فیلتر قسطی ۲۳ فروشنده دیگر»، «شعاع را ۲ کیلومتر کن»).
- `SellerCard` — three‑field block:
  - Price line: `۵۵٬۹۹۰٬۰۰۰ تومان` + `PriceFlagBadge` (مشکوک) + «قیمت ثبت نشده» when null
  - `FreshnessBadge`: green «به‌روز · امروز», amber «۲۱ روز پیش», red «۴ ماه پیش — ممکن است قدیمی باشد», gray «نامشخص»
  - `AvailabilityBadge`: «تأیید نشده» → after follow‑up «✅ تأیید شد»، «❌ ناموجود»، «⚠️ قیمت جدید ۶۱٬۰۰۰٬۰۰۰»، «📵 پاسخ نداد»
  - Distance + open label; `MallChip` «پاساژ علاءالدین · طبقه ۶ · واحد ۶۵۶»; condition chips (قسطی، ترب‌پی، ارسال فوری، گارانتی ۱۸ ماهه شرکتی) and «شرایط اعلام نشده» when empty.
  - `why` line (≤2 phrases). Actions: «پیگیری» (message/call choice), «جزئیات», «افزودن به برنامه».
- `FollowupBoard` — one row per follow‑up with live status, skeleton while contacting, expandable transcript, «جایگزین پیدا کن» CTA on out_of_stock/no_answer, «قبول قیمت جدید» on price_changed. Simulation disclaimer line.
- `AlternativesPanel` — two tabs: «همین کالا جای دیگر» / «کالای مشابه همین‌جا».
- `TripPlan` — numbered steps grouped by mall, ETA, open‑at‑arrival marks, nav links, «اشتراک‌گذاری», «چک‌لیست خرید».
- `Checklist` — bullets with checkboxes (local state).
- `MapPanel` — toggled; markers for current seller list, user pin, radius circle; tapping a marker scrolls to its card.
- `SuggestedActions` — chips produced by the server from state (e.g. after sellers: «پیگیری ۳ تای اول», «فقط باز الان», «برنامه مراجعه»).

### 9.3 UX rules
- All numbers in Persian digits with `٬` thousands separator; dates relative.
- Skeletons for every async block; optimistic chip state.
- Empty states always include one tappable fix.
- Tap targets ≥ 44px; bottom composer safe‑area aware; no horizontal page scroll.
- Light theme default; dark optional. Accent color distinct from Torob's brand (do not imitate Torob branding; name the app «همراه خرید»).
- Keyboard: Enter sends; chips send a prefilled message **or** patch state (never both).
- Load `/` ≤ 2 s on 4G without map; map lazy.

---

## 10. Deployment

- `Dockerfile`: multi‑stage, `node:20-alpine`, pnpm, `next build` standalone, non‑root user, `HEALTHCHECK` on `/api/healthz`.
- `docker-compose.yml`: `db` (volume, healthcheck `pg_isready`), `app` (depends_on db healthy, env from `.env`, mounts `./data:/data:ro`, runs `pnpm migrate && node server.js`), `caddy` (ports 80/443, `Caddyfile` with `{$APP_DOMAIN}` reverse_proxy app:3000). `restart: unless-stopped` everywhere.
- Seeding: `docker compose run --rm app pnpm seed` (documented) — also auto‑seed on first boot if `products` is empty and `AUTO_SEED=true`.
- `/api/healthz` returns `{ok, db, counts:{shops,products,offers}, llm_provider}`.
- README: one‑paragraph pitch (Persian + English), screenshots, `docker compose up -d` quick start, env table, architecture diagram (mermaid), honesty note on simulation, link to demo video.
### 10.1 Git & GitHub (the repo is the submission)
- `git init` on `main` at M0; `.gitignore` excludes `node_modules`, `.next`, `.env*` (except `.env.example`), `data/*.csv`, `data/*.zip`, logs, coverage, Playwright reports. **Never commit the CSVs** (products.csv is 196 MB) or secrets; README links to the official dataset download and says where to put the files (`data/`).
- MIT `LICENSE`. Conventional commits; ≥1 commit per milestone; tag `v1.0` at the end.
- The owner creates the GitHub repository himself and adds it as `origin`. Do not create repositories or use the GitHub CLI. If `origin` exists, push `main` and tags after every milestone; if it does not, keep committing locally and remind the owner once in PROGRESS.md to add the remote (`git remote add origin <url> && git push -u origin main --tags`).
- `.github/workflows/ci.yml`: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` on push/PR. Must be green.
- `docs/screenshots/` with the scenario screenshots (390px) referenced from the README; `docs/DEMO.md` with the demo script (§13); `docs/DEPLOY.md` with exact VPS commands.
- Judge‑ready README order: title + one‑line pitch (fa/en) → screenshots → live URL → features mapped to judging criteria → architecture (mermaid) → quick start → env table → simulation honesty note → dataset notes → license.

---

## 11. Milestones and acceptance (each is one Claude Code work session)

| M | Deliverable | Acceptance check (must pass before moving on) |
|---|---|---|
| **M0 Scaffold** | Next.js app, Tailwind, shadcn RTL, Vazirmatn, Drizzle, Postgres via compose, `lib/llm.ts`, healthz, `.env.example`, README skeleton | `docker compose up -d db && pnpm dev` serves `/` RTL with font; `GET /api/healthz` → ok; a `scripts/llm-check.ts` makes one tool call with each configured provider. |
| **M1 Data** | Schema, seed, normalization, mall parser, hours, quality flags, aggregates, unit tests | `pnpm seed` < 5 min; counts match; `pnpm test` green; SQL spot checks: A17 128/4 (`product_d24b597176bdf2a82035dcc2`) has 26 sellers within 1 km of (35.6957, 51.4105); `shop_539f4a371b4d8fcb9c38c717` parses to mall=علاءالدین floor=6 unit=656. |
| **M2 Search API** | category routing, searchProducts, compareProducts, findSellers (+score, relaxations, clusters, maybe_shops), shopDetails; `/api/sellers` | `pnpm golden` ≥ 12/15 pass (§12); `/api/sellers?product=...&lat&lon&radius=1000` returns rows with `why` and three‑field data in < 300 ms warm. |
| **M3 Agent + core UI** | chat route with tools; ContextBar + sheets; ProductCard, CompareTable, SellerList/Card, SuggestedActions; session PATCH flow; map panel | Demo scenario §13 steps 1–3 work by tapping/typing on a 390px viewport; changing radius/filters updates the list without an LLM call; provider switch via env verified. |
| **M4 Intelligence** | simulator, contact_seller + FollowupBoard (live), find_alternatives + panel, purchase_checklist | Scenario step 4: 3 follow‑ups resolve in ≤ 5 s with mixed outcomes; out_of_stock triggers alternatives automatically; transcripts visible; disclaimer visible. |
| **M5 Plan + polish** | plan_trip + TripPlan + `/plan/[id]`; empty/error states; loading skeletons; Persian digits everywhere; dark mode optional | Full scenario in < 2 minutes of interaction; Lighthouse mobile perf ≥ 80 without map; no console errors. |
| **M6 Deploy** | Dockerfile, compose with Caddy, auto‑seed, README complete, DECISIONS.md | Fresh VM: `git clone && cp .env.example .env && docker compose up -d` → HTTPS site works, healthz ok, scenario works on the deployed URL. |

Cut order — only if something is genuinely blocked, never for convenience: dark mode → map panel (keep list with distances) → checklist tool. Never skip the three‑field transparency, follow‑up board, alternatives, or deployment.

---

## 12. Golden queries (`scripts/golden.ts`)
Each: input text → expected category contains / expected product id in top 5 / expected min results. Use the dataset to fill ids at implementation time; these are the intents:
1. «گوشی سامسونگ تا ۶۰ میلیون» → category گوشی موبایل; top‑5 includes A17 128/4 or A07.
2. «سامسونگ A17 رم ۶» → `گوشی سامسونگ A17 4G | حافظه 128 رم 6` in top 3.
3. «هدفون بلوتوثی انکر» → Soundcore R50i in top 5.
4. «هندزفری سیمی اپل» → EarPods lightning in top 3.
5. «قهوه ساز خانگی ارزون» → category contains قهوه/اسپرسو; ≥5 results.
6. «دوربین مداربسته برای مغازه» → category دوربین مدار بسته; ≥5.
7. «پاوربانک ۲۰ هزار» → پاوربانک; ≥5.
8. «کاور گوشی سامسونگ A17» → کیف و کاور گوشی; ≥3.
9. «لامپ ال ای دی ۲۰ وات» → لامپ LED; ≥5.
10. «ساعت مچی مردانه کاسیو» → ساعت مچی; ≥3.
11. «اسپیکر بلوتوثی تا ۲ میلیون» → اسپیکر; budget parsed = 2,000,000.
12. «گوشی موبایل» (bare) → clarify or broad list; no crash.
13. «سیم برق ۲ در ۲.۵» → سیم و کابل; ≥3 (tests digit/ZWNJ normalization).
14. «مودم 4G رومیزی» → ≥3 (Latin inside Persian).
15. «کیو سی وای T13» → QCY T13x in top 3 (transliteration).

Seller checks: A17 128/4 within 1 km of default location → 26 shops, ≥20 with hours known, cluster علاءالدین ≥ 5, cluster چارسو ≥ 2; with `installment=true` → ≤ 2 results and a relaxation hint.

---

## 13. Demo scenario (what must work flawlessly)
Location: default (فردوسی/جمهوری). Demo time: a weekday 16:00 (`?demo_time=`).
1. User taps chip «گوشی سامسونگ تا ۶۰ میلیون نزدیک من» → agent (optionally one clarify chip row: «دوربین مهم‌تره / باتری / رم بیشتر») → 3 ProductCards (A17 128/4 ≈ from ۵۳٬۹۰۰٬۰۰۰ · ۲۸ فروشنده; A07 128/4; A17 128/6 slightly above budget flagged «کمی بالاتر از بودجه») with `why` lines.
2. User taps «مقایسه» on two → CompareTable → «انتخاب» A17 128/4.
3. Agent calls `find_sellers` → «۲۶ فروشنده در ۱ کیلومتر» + cluster chips (علاءالدین، چارسو، بزرگمهر، خانه موبایل). User taps «الان باز» and sets radius 500 m via ContextBar (no LLM) → list shrinks. User taps «قسطی» → ≤2 results + relaxation banner → taps «حذف فیلتر قسطی».
4. Cards show: one with price ۲۱ روز پیش (amber), one «قیمت مشکوک» if any, mall chips «پاساژ علاءالدین · طبقه ۶ · واحد ۶۵۶». User asks «چرا این اول شد؟» → agent explains from `why`.
5. User taps «پیگیری ۳ تای اول» → FollowupBoard: ✅ confirmed, ❌ out_of_stock → agent auto‑calls `find_alternatives` («همین گوشی، طبقه ۵ همین پاساژ، ۵۵٬۴۴۴٬۴۰۰») , ⚠️ price_changed. Transcripts expandable.
6. User taps «برنامه مراجعه» → TripPlan: علاءالدین (طبقه ۵ → طبقه ۶) → چارسو طبقه اول; ETA; open‑at‑arrival; nav links; «چک‌لیست خرید» → رجیستری، پلمب، سریال گارانتی، تست دوربین/باتری، فاکتور.
7. Share plan link opens `/plan/[id]`.

Ensure the deterministic simulator yields **mixed** outcomes for the top‑3 sellers of this product at the default location; if not, adjust the hash salt (`SIM_SALT` env) until it does and record the salt in DECISIONS.md.

---

## 14. Definition of done / quality bar
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm golden` pass.
- No fabricated numbers: every price/distance/hour in the UI traces to a DB row (tool outputs carry ids).
- Every unknown is labeled; category‑only shops never show a price.
- Works on iPhone‑size viewport in Chrome/Safari; RTL correct (no mirrored icons where inappropriate, numbers not reversed).
- Deployed URL stable for 48 h; healthz green; README accurate.
- `docs/DECISIONS.md` lists every deviation from this spec.
