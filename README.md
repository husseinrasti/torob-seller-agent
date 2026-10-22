# همراه خرید — Hamrah Kharid

**دستیار هوشمند خرید حضوری در تهران:** از «نمی‌دونم چی بخرم» تا «کدوم مغازه، کدوم پاساژ و طبقه و واحد، الان بازه و واقعاً موجوده؟» — با قیمت شفاف، پیگیری فروشنده و برنامه مراجعه.

**An AI agent for in‑person shopping in Tehran:** it helps you pick the product, finds nearby shops that actually list it, compares them transparently (listed price ≠ price age ≠ confirmed stock), follows up with sellers (simulated) and plans the walk — mall → floor → unit.

<p align="center">
  <img src="docs/screenshots/02-products.png" width="180" alt="Product candidates with reasons">
  <img src="docs/screenshots/05-seller-cards.png" width="180" alt="Seller cards with the three-field transparency block">
  <img src="docs/screenshots/11-followups-resolved.png" width="180" alt="Live follow-up board">
  <img src="docs/screenshots/14-trip-plan.png" width="180" alt="Visit plan by mall, floor and unit">
</p>

**Live demo:** `https://<your-domain>` — *(fill in after deployment, see [docs/DEPLOY.md](docs/DEPLOY.md))* · **Demo script:** [docs/DEMO.md](docs/DEMO.md) · **Recording helper:** `/?demo_time=2026-10-25T16:00` and `/demo-reset`

---

## What it does — the four steps

| Step | What the user gets |
|---|---|
| **1. Need → product** | Free text or one tap («گوشی سامسونگ تا ۶۰ میلیون نزدیک من») → 3–4 candidate cards with a templated «چرا» line (cheapest in budget, most sellers, more RAM…), an upsell flagged «کمی بالاتر از بودجه», and a side‑by‑side comparison of differing specs. |
| **2. Product → sellers near me** | Shops that **list** the product within a radius of the chosen location (GPS, search over neighbourhoods/malls, or a map pick), with filters: open now, installment/credit, Torob Pay, fast delivery, warranty, hide stale/suspicious prices, price cap. |
| **3. Compare sellers** | Explainable ranking (price · distance · price freshness · open now · conditions, weights by intent), mall clusters («۶ در پاساژ چارسو»), mall/floor/unit chips parsed from free‑text addresses, «ممکن است داشته باشند (فقط دسته فعالیت)» kept separate, and relaxation hints when filters are too strict. |
| **4. Follow up & go** | Simulated message/call follow‑ups with a live board (confirmed / out of stock / new price / no answer + transcripts). Out of stock → **alternatives automatically** (same product in the same mall first, then similar products ±20%). A visit plan ordered by mall and floor with ETA, open‑at‑arrival checks, navigation links (Neshan, Google Maps, OSM), a share link and an in‑store checklist. |

### Transparency rules (visible on every seller card)
- **Three separate fields, three visual treatments:** «قیمت ثبت‌شده» (listed price) · «آخرین تغییر قیمت» (green ≤ 7 d, amber ≤ 30 d, red older, gray unknown) · «موجودی» (stays «تأیید نشده» until a follow‑up confirms it).
- Unknown is shown as unknown («ثبت نشده»، «اعلام نشده»، «ساعت کاری ثبت نشده») — never blank, never guessed.
- A shop that **lists** the product is never mixed with a business that only has a matching **activity category**.
- Every price, distance, hour or availability in the UI comes from a database row or a simulator result tied to an `offer_id`; the LLM sees compact tool outputs and is instructed never to state numbers from memory.

## Features mapped to the judging criteria

| Criterion (pts) | Where it shows |
|---|---|
| **Product (75)** | All four steps end to end; mall → floor → unit navigation from free‑text addresses (4,088 shops parsed); price‑freshness and suspicious‑price flags; category‑only shops separated; follow‑ups with automatic alternatives; visit plan with open‑at‑arrival warnings; shareable plan; checklist. |
| **UX (75)** | Mobile‑first RTL (390 px), Vazirmatn, Persian digits everywhere; chat **plus** structured controls: sticky ContextBar (location, radius, price cap, conditions, intent) re‑filters the list **instantly without the LLM**; generative UI cards; skeletons; empty states with one tappable fix; 44 px targets; dark mode; Lighthouse mobile **92 / 100 / 100**. |
| **Intelligence (50)** | Vercel AI SDK v7 agent with 10 tools; deterministic‑first category routing (product votes + trigram) with LLM refinement; Persian budget parser; explainable seller score and «چرا این اول شد؟» grounded in `score_breakdown`; proactive rules (stale price → follow up, out of stock → alternatives, confirmed → plan); automatic fallback to a rule‑based model when the provider fails. |
| **Deploy (40)** | `docker compose up -d` → PostgreSQL 16, app (Next standalone, non‑root, healthcheck), Caddy (automatic HTTPS); migrations + **auto‑seed** on first boot (~30 s); `/api/healthz`; exact VPS commands in [docs/DEPLOY.md](docs/DEPLOY.md). |
| **Engineering (40)** | TypeScript end to end, Drizzle schema & migrations, COPY‑based seed with 4 streaming passes, pure tested modules (99 unit tests), golden search suite, Playwright scenario (20 checks), CI (typecheck · lint · test), decisions log ([docs/DECISIONS.md](docs/DECISIONS.md)). |
| **Dataset (20)** | Uses all three CSVs: Persian normalization (ی/ک, digits, ZWNJ), mall/floor/unit parser with spelling unification (علاالدین/علاءالدین/علائدین…), hours with `declared/closed/unsupported`, price age & suspicious‑price flags vs product median, payment providers with in‑person vs declared channel, warranty parsing, brand inference for the 75 % of products without a brand. |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Mobile web (Next.js, RTL)"]
    UI["Chat + generative cards<br/>ContextBar · SellerList · FollowupBoard · TripPlan"]
    MAP["MapLibre + OSM tiles (lazy)"]
  end
  subgraph App["Next.js 15 route handlers"]
    CHAT["/api/chat<br/>AI SDK v7 streamText + tools"]
    SELL["/api/sellers · /api/session<br/>(no LLM)"]
    FU["/api/followup · /api/plan · /api/shop"]
    TOOLS["Tools: search_products · compare_products · set_context<br/>find_sellers · shop_details · contact_seller<br/>find_alternatives · plan_trip · purchase_checklist · clarify_need"]
    SIM["Seller simulator<br/>sha256(SIM_SALT+offer_id)"]
  end
  LLM["LLM provider (env switch)<br/>OpenAI · Google · OpenRouter<br/>↳ offline rule model fallback"]
  DB[("PostgreSQL 16<br/>pg_trgm · unaccent<br/>shops · products · offers<br/>sessions · followups · plans")]
  CSV["data/*.csv"] -->|"pnpm seed (COPY)"| DB
  UI -->|"free text / UI actions"| CHAT
  UI -->|"filters, radius, location"| SELL
  UI --> FU
  CHAT --> TOOLS --> DB
  CHAT <--> LLM
  FU --> SIM --> DB
  SELL --> DB
  MAP --- UI
  CADDY["Caddy (HTTPS)"] --> App
```

**How a turn works.** Free text goes to `streamText` with the tools; the model decides. Taps on cards («فروشنده‌های نزدیک», «مقایسه», «پیگیری ۳ تای اول», «برنامه مراجعه») are messages with `metadata.action`: the server runs that tool immediately (same code as the LLM's call), streams the card, then the LLM adds one or two sentences. ContextBar changes never call the LLM: they `PATCH /api/session` and the latest seller list re‑fetches `/api/sellers` in place (and is written back into the chat history so the agent explains what the user sees).

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/husseinrasti/torob-seller-agent.git
cd torob-seller-agent
# put shops.csv, products.csv, offers.csv into ./data (see "Dataset" below)
cp .env.example .env            # set APP_DOMAIN (or :80 for plain HTTP) and at least one LLM key
docker compose up -d --build    # db → migrate → auto-seed (~30 s) → app → Caddy
curl -s http://localhost/api/healthz
```

Manual (re)seed: `docker compose run --rm app node scripts/seed.cjs` · logs: `docker compose logs -f app`.

### Local development

```bash
pnpm install
cp .env.example .env            # DATABASE_URL=postgres://app:app@localhost:5432/app
docker compose up -d db
pnpm migrate && pnpm seed       # ~35 s
pnpm dev                        # http://localhost:3010  (PORT to change)
```

Without any LLM key the app runs in **offline mode** (rule‑based model; badge «حالت آفلاین») so every screen still works.

### Checks

```bash
pnpm typecheck && pnpm lint && pnpm test   # CI runs these
pnpm golden                                # 15 golden search queries + seller checks (needs the DB)
pnpm scenario                              # demo scenario §13 on a 390 px viewport, screenshots → docs/screenshots/tmp
pnpm llm-check                             # one tool call per configured provider
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://app:app@db:5432/app` | PostgreSQL (compose overrides it to the `db` service). |
| `DB_PORT` · `POSTGRES_PASSWORD` | `5432` · `app` | Host port (bound to 127.0.0.1) and password of the compose database. |
| `LLM_PROVIDER` | `openai` | `openai` · `google` · `openrouter` · `offline` — switch with zero code changes. |
| `LLM_MODEL` · `LLM_FAST_MODEL` | `gpt-4.1-mini` · — | Tool‑calling model; optional cheaper model for routing, seller persona and checklist. |
| `OPENAI_API_KEY` · `OPENAI_BASE_URL` | — | OpenAI key; optional OpenAI‑compatible proxy URL. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Gemini key. |
| `OPENROUTER_API_KEY` | — | OpenRouter key. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Folder with the three CSVs. |
| `DATASET_AS_OF` | `2026-10-13` | "Today" for price‑age computation. |
| `AUTO_SEED` | `true` | Seed on container start when `products` is empty. |
| `SIM_SALT` | `hamrah-40` | Seed of the deterministic seller simulator (tuned for the demo). |
| `APP_URL` · `APP_DOMAIN` | — | Public URL; Caddy site address (`example.com` → automatic HTTPS, `:80` → plain HTTP). |
| `HTTP_PORT` · `HTTPS_PORT` | `80` · `443` | Host ports of Caddy. |
| `NPM_REGISTRY` | npmjs | Build‑time npm mirror for restricted networks. |

## Honesty note — simulated seller contact

The dataset's shop names and phone numbers are fake, so the agent **cannot** really call or message shops. Follow‑ups are **simulated** and labelled so in the UI («شبیه‌سازی‌شده — در نسخه واقعی از طریق پیام‌رسان/تماس ترب انجام می‌شود»). The outcome is deterministic per offer — `sha256(SIM_SALT + offer_id)` — and depends on the price freshness (stale prices are more often out of stock or changed), on the channel (a call to a closed shop is not answered) and arrives after 1.5–4 s. Seller lines are written by the fast LLM constrained to that outcome (rejected if they mention any other price) or by templates. The architecture is ready for a real channel: replace `lib/sim/` with a messaging/call integration that writes the same `followups` rows.

## Dataset

The data is the **Torob × Starcoach hackathon export** («Starcoach v16 cap300 CSV export»): `shops.csv` (6,476), `products.csv` (225,903), `offers.csv` (331,506). It is **not** committed (products.csv is 196 MB).

- Download: **`<official dataset link from the challenge page>`** *(placeholder — add the official URL)*, then place the three files in `data/` (or point `DATA_DIR` at them). See `data/README.txt`.
- What the seed derives: normalized titles/search text, brand for products without one, product seller count / min & median price (sane prices only), price age and freshness, suspicious‑price flags vs the product median, mall/floor/unit from addresses, opening‑hours availability, payment providers and channels, warranty text, categories with product/shop counts.
- Facts worth knowing: only 3,792 shops have offers; prices are missing for 15,083 offers; 42 % of prices are older than 30 days; payment options exist for 266 shops; 85 % of shops are in central Tehran (Ferdowsi, Sheikh Hadi, Baharestan).

## Project structure

```
app/            page, /plan/[id], /demo-reset, api/{chat,session,sellers,followup,plan,shop,places,products/search,healthz}
components/     app shell (ContextBar, sheets, composer, map) and cards (products, compare, sellers, follow-ups, alternatives, plan, checklist)
lib/fa          Persian normalization, digits, formatting
lib/data        mall/floor/unit parser, opening hours, price quality, payments, warranty
lib/search      query parsing, category routing, product ranking, sellers + score, alternatives, places
lib/agent       tools, system prompt, session state, suggestions, offline model, checklist
lib/sim         seller simulator, persona transcripts, follow-up service
lib/plan        visit planner
scripts         seed, golden, scenario, smoke, llm-check, tune-salt
docs            spec, run plan, DECISIONS, PROGRESS, DEPLOY, DEMO, screenshots
```

## License

MIT — see [LICENSE](LICENSE). Vazirmatn font: SIL OFL (`public/fonts/OFL.txt`). Map data © OpenStreetMap contributors.
