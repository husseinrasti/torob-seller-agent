# همراه خرید — Hamrah Kharid

**دستیار هوشمند خرید حضوری در تهران:** از «نمی‌دونم چی بخرم» تا «کدوم مغازه، کدوم پاساژ و طبقه و واحد، الان بازه و واقعاً موجوده؟» — با قیمت شفاف، پیگیری فروشنده و برنامه مراجعه.

**An AI agent for in‑person shopping in Tehran:** it helps you pick the product, finds nearby shops that actually list it, compares them transparently (listed price ≠ price age ≠ confirmed stock), follows up with sellers (simulated) and plans the walk — mall → floor → unit.

<p align="center">
  <img src="docs/screenshots/03-products.png" width="180" alt="Product candidates with reasons">
  <img src="docs/screenshots/06-seller-cards.png" width="180" alt="Seller cards with the three-field transparency block">
  <img src="docs/screenshots/13-followups-resolved.png" width="180" alt="Live follow-up board">
  <img src="docs/screenshots/16-trip-plan.png" width="180" alt="Visit plan by mall, floor and unit">
</p>
<p align="center">
  <img src="docs/screenshots/desktop/06-seller-cards.png" width="760" alt="Desktop: chat history, seller list and the map with every shop of the area">
</p>

**Live demo:** `https://<your-domain>` — *(fill in after deployment, see [docs/DEPLOY.md](docs/DEPLOY.md))* · **Demo script:** [docs/DEMO.md](docs/DEMO.md) · **Recording helper:** `/demo-reset?demo_time=2026-10-25T16:00&name=داور` (signs in as «داور» with an empty history; without `name` it signs out)

---

## «ساعت ۱۱:۳۰ شب است و شارژر می‌خواهم» — decisions, not lists

Price filtering is what Torob's own search already does. The hard part of shopping in person is **where and when**: at 23:30 every listed charger seller within 2 km is closed — is anything open farther away, is there a bazaar nearby that may have unlisted shops still open, or is «tomorrow 09:00, 1.7 km» the sane answer? The agent answers with a **map card**:

<p align="center">
  <img src="docs/screenshots/24-decision-night.png" width="230" alt="23:30: nothing listed is open within 2 km; the mobile bazaar 2.6 km away may have unlisted shops open; the earliest opening is tomorrow 09:00">
  <img src="docs/screenshots/25-decision-evening.png" width="230" alt="18:40: open shops with prices, «عجله کن» for those closing at 19:00">
  <img src="docs/screenshots/26-decision-time-scrubber.png" width="230" alt="The time scrubber moved to 19:30 re-runs the decision without the LLM">
</p>

- **Five tiers, each with its evidence and an honest confidence:** open and listed nearby · open but farther (travel time, «closes in N min», «عجله کن») · a nearby **bazaar** («بورس موبایل جمهوری» — derived from the dataset's shop density, or curated and labelled «بر اساس شناخت عمومی») that may have shops open though not in Torob · shops whose hours are unknown («بپرس بازه؟») · the earliest opening («یادآوری برای فردا ۰۹:۰۰»). A recommended tier by urgency, and the trade-off in one line («۴ کیلومتر دورتر ولی مطمئن» vs «۱ کیلومتر ولی نامطمئن»).
- **The map is the answer:** you, the radius, prices on pins (one per building), the recommended place with a route and «≈ ۶ دقیقه با ماشین», closed shops as faint dots («بسته · فردا ۱۰:۰۰»), bazaars as shaded areas. A **time scrubber**, radius, urgency and walk/car toggles re-run the deterministic engine on the server — no LLM.
- **Honest hours:** a declared `00:00–…` shift is a placeholder, never «open 24 h»; Friday closures are stated («جمعه ۱۰۰٪ فروشنده‌های هدفون در ۳ کیلومتر اطرافت تعطیل‌اند»). The card is the answer — no extra prose after it.

Try: «ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام نزدیک میدان هفت تیر» · «جمعه ظهر هدفون می‌خوام» · «کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم» ([DECISIONS #101–105](docs/DECISIONS.md), [demo beats 2–3](docs/DEMO.md)).

## What it does — the four steps

| Step | What the user gets |
|---|---|
| **1. Need → product** | Free text or one tap («گوشی سامسونگ تا ۶۰ میلیون نزدیک من») → 3–4 candidate cards with a templated «چرا» line (cheapest in budget, most sellers, more RAM…), an upsell flagged «کمی بالاتر از بودجه», and a side‑by‑side comparison of differing specs. |
| **2. Product → sellers near me** | Shops that **list** the product within a radius of the chosen location (GPS, search over neighbourhoods/malls, or a map pick), with filters: open now, installment/credit, Torob Pay, fast delivery, warranty, hide stale/suspicious prices, price cap. |
| **3. Compare sellers** | Explainable ranking (price · distance · price freshness · open now · conditions, weights by intent), mall clusters («۶ در پاساژ چارسو»), mall/floor/unit chips parsed from free‑text addresses, «ممکن است داشته باشند (فقط دسته فعالیت)» kept separate, and relaxation hints when filters are too strict. |
| **4. Follow up & go** | Simulated message/call follow‑ups with a live board (confirmed / out of stock / new price / no answer + transcripts). Out of stock → **alternatives automatically** (same product in the same mall first, then similar products ±20%). A visit plan ordered by mall and floor with ETA, open‑at‑arrival checks, navigation links (Neshan, Google Maps, OSM), a share link and an in‑store checklist. |

### Around the four steps
- **One message, one mission.** A compound request — «من یه گوشی سامسونگ حدود قیمت ۵۰ میلیون تومن میخوام. محدوده سعادت آباد باشه. و خودت بپرس ببین قیمت‌هاشون آپدیت هست یا نه و اینکه الان باز هستند.» — is carried out end to end and reported once: the place is found (118‑place Tehran gazetteer + the dataset's neighbourhoods and malls), «حدود ۵۰ میلیون» becomes a 45–55 M band, the radius widens until there are sellers and the report says plainly when the area itself has none in Torob's data, sellers are asked (simulated) and their replies awaited, and every row gets a verdict (پیشنهادی / قابل قبول / توصیه نمی‌شود / نامشخص) with a reason — or «پیشنهادی ندارم چون…». Steps stream live; chips edit the constraints ([DECISIONS #58–74](docs/DECISIONS.md)).
- **Phone and desktop.** On a phone: one column, map and history in sheets. From 1024 px: chat history · conversation · live map side by side; cards reflow with container queries (two seller cards per row when there is room).
- **Sign in with just a name** («اسمت چیه؟») — chats are saved per user. There is no password: whoever types the same name opens the same history (a deliberate hackathon trade‑off, [DECISIONS #43](docs/DECISIONS.md)).
- **Chat history.** Previous chats are listed with their title and last activity (sidebar on desktop, sheet on mobile); opening one brings back every card — seller list, follow‑up board with its outcomes, visit plan — and continues the conversation. Each chat has its own URL (`/?c=<id>`), so back/forward and reload work.
- **Memory across chats.** The usual location and radius, recent searches and recently chosen products are remembered per user. A new chat starts at the remembered location, greets by name and offers «از جایی که مانده بودیم» (resume the last chat or repeat a recent search); the agent gets the same facts as a short prompt block. «پاک کردن» clears it.
- **Every shop on the map, by shop type.** All shops within the radius are drawn with an icon for their type (mobile, computer, audio/video, CCTV, electronic parts, electrical & lighting, tools, appliances, apparel, beauty, medical, auto… — derived from the ~4,000 activity categories, «فعالیت ثبت نشده» when the dataset has none) and a colour for what Torob knows (teal: lists products · gray: no listings · amber: only the activity category matches the chosen product). Chips above the map filter by type with counts. Shops that share a building (up to 45 at one point in the bazaar) are grouped into a pill with a shop icon and the count that zooms in on tap and, inside a mall, lists its shops. The current seller list stays as numbered pins. Tapping any shop opens its sheet: type, address with mall/floor/unit, today's hours, conditions, the chosen product's offer with «پیگیری» / «به برنامه», the score breakdown (for shops in the seller list) and the shop's other products.

### Feature pack 2 (v1.1) — in the shop, not just before it
| Feature | What the user gets |
|---|---|
| **Photo search** (F1) | Camera/gallery button in the composer: a box, a product or a **shelf price tag** → «سامسونگ Galaxy A17» with the top 3 matches («همین است» / «نه، این نیست»), and the tag price against the market («۸٪ بالای میانه بازار») and the cheaper sellers nearby. Unrecognizable photos → «نتونستم تشخیص بدم، اسمش رو بنویس». The photo goes to the model provider only and is never stored. Works with OpenAI, Google and OpenRouter (`LLM_VISION_MODEL`). |
| **In‑mall mode** (F2) | «الان توی پاساژ علاءالدینم» → the mall floor by floor: sellers of the product first (price · price age · stock), shops of the same category badged «همسایه جایگزین», the rest folded; «پیگیری همه‌ی این طبقه», the mall's opening hours and nearby malls. Missions in a mall group their report by floor. |
| **Basket trip** (F3) | «گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی» → one seller per line, as many as possible in one mall (greedy set cover: 4 of 4 in پاساژ علاءالدین), the rest from the nearest seller; «پیگیری همه» asks every seller and replaces the ones out of stock; then the visit plan. |
| **Ready‑to‑send message** (F4) | «خودم پیام بدهم»: an editable message to the real seller (product, listed price and its age in Torob, the question, «آدرس را درست دارم؟ پاساژ چارسو، طبقه ۱، پلاک C۵۲») with WhatsApp / SMS / copy buttons. |
| **Bargaining card** (F5) | The offer on the market range (min–median–max of sane prices), ≤ 4 data‑backed talking points (a cheaper seller 40 m away, price age, warranty gap) and a fair target price → «پیام با این قیمت». |
| **Spec Q&A** (F8) | «این گوشی NFC داره؟»، «وزنش چنده؟»، «فرق رمش چیه؟» → answered only from the registered specs, with evidence chips that open the spec table; «در مشخصات ثبت‌شده نیامده» otherwise. «چرا این اول شد؟» shows the score breakdown. |
| **Trust signals** (F10) | «کامل بودن اطلاعات» 0–3 (hours known · website/Instagram · fresh price) with «چرا؟» — explicitly not a quality score; website/Instagram buttons; credit payment worded by channel (in person confirmed vs declared). |
| **Best time to visit** (F11) | «کی برم؟» → share of open shops per hour (heatmap per weekday), the best window («یکشنبه بین ۱۱ تا ۱۸، ۹۳٪ بازند»), Friday closures, shops without hours; the visit plan offers «شروع از ۱۱:۰۰» when it would start outside the window. |

### Minimal by design (TorobChat benchmark)
Location · radius · «فیلترها» instead of six chips; a hero with one input and three examples; one primary action per card with «…» for the rest; seller cards keep only what decides (price · price age · stock, open state, mall/floor/unit) with the rest in «جزئیات»; no LLM prose after a card, and free replies stop after two sentences. Same behaviour, less text ([DECISIONS #106, #108](docs/DECISIONS.md)):

| Before (v1.1) | After |
|---|---|
| <img src="docs/screenshots/before/02-home.png" width="220" alt="v1.1 home"> | <img src="docs/screenshots/02-home.png" width="220" alt="Minimal home"> |
| <img src="docs/screenshots/before/06-seller-cards.png" width="220" alt="v1.1 seller cards"> | <img src="docs/screenshots/06-seller-cards.png" width="220" alt="Seller cards with one primary action"> |

### Transparency rules (visible on every seller card)
- **Three separate fields, three visual treatments:** «قیمت ثبت‌شده» (listed price) · «آخرین تغییر قیمت» (green ≤ 7 d, amber ≤ 30 d, red older, gray unknown) · «موجودی» (stays «تأیید نشده» until a follow‑up confirms it).
- Unknown is shown as unknown («ثبت نشده»، «اعلام نشده»، «ساعت کاری ثبت نشده») — never blank, never guessed.
- A shop that **lists** the product is never mixed with a business that only has a matching **activity category**.
- Every price, distance, hour or availability in the UI comes from a database row or a simulator result tied to an `offer_id`; the LLM sees compact tool outputs and is instructed never to state numbers from memory.

## Features mapped to the judging criteria

| Criterion (pts) | Where it shows |
|---|---|
| **Product (75)** | All four steps end to end; mall → floor → unit navigation from free‑text addresses (4,088 shops parsed); price‑freshness and suspicious‑price flags; category‑only shops separated; follow‑ups with automatic alternatives; visit plan with open‑at‑arrival warnings; shareable plan; checklist; every shop of the area on the map by type, filterable and selectable; per‑user chat history with resume; **v1.1:** photo search with shelf‑price check, in‑mall floor view, multi‑item basket trip, ready‑to‑send seller message, bargaining card, grounded spec Q&A, trust signals, best time to visit. |
| **UX (75)** | Mobile‑first RTL (390 px) **and** a desktop layout (≥ 1024 px: history · chat · live map); Vazirmatn, Persian digits everywhere; chat **plus** structured controls: sticky ContextBar (location, radius, price cap, conditions, intent) re‑filters the list **instantly without the LLM**; generative UI cards; skeletons; empty states with one tappable fix; 44 px targets; dark mode; camera button, floor tabs, BasketBar above the composer, per‑hour opening heatmap, evidence chips; Lighthouse mobile **92 / 100 / 100** (M5 build). |
| **Intelligence (50)** | Vercel AI SDK v7 agent with 22 tools; a deterministic «where/when to buy» engine (five tiers, travel time, hub probabilities, urgency) with derived bazaars; vision model for photos (strict JSON, provider‑switchable); greedy set cover over malls for baskets; spec answers grounded in registered rows (numbers checked against the evidence); deterministic‑first category routing (product votes + trigram) with LLM refinement; Persian budget parser; explainable seller score and «چرا این اول شد؟» grounded in `score_breakdown`; proactive rules (stale price → follow up, out of stock → alternatives, confirmed → plan); memory across chats (usual location/radius, recent searches and products); compound requests run as one deterministic mission with the LLM at the edges (extraction, ≤ 3‑sentence summary); automatic fallback to a rule‑based model when the provider fails. |
| **Deploy (40)** | `docker compose up -d` → PostgreSQL 16, app (Next standalone, non‑root, healthcheck), Caddy (automatic HTTPS); migrations + **auto‑seed** on first boot (~30 s); `/api/healthz`; exact VPS commands in [docs/DEPLOY.md](docs/DEPLOY.md). |
| **Engineering (40)** | TypeScript end to end, Drizzle schema & migrations, COPY‑based seed with 4 streaming passes, pure tested modules (243 unit tests), golden search + mission + situational + feature suites (121 checks), vision fixtures with a per‑provider check, Playwright scenario (53 checks on phone and desktop viewports), CI (typecheck · lint · test), decisions log ([docs/DECISIONS.md](docs/DECISIONS.md)). |
| **Dataset (20)** | Uses all three CSVs: Persian normalization (ی/ک, digits, ZWNJ), mall/floor/unit parser with spelling unification (علاالدین/علاءالدین/علائدین…), hours with `declared/closed/unsupported`, price age & suspicious‑price flags vs product median, payment providers with in‑person vs declared channel, warranty parsing, brand inference for the 75 % of products without a brand. |

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Web — phone and desktop (Next.js, RTL)"]
    UI["Chat + generative cards<br/>ContextBar · SellerList · FollowupBoard · TripPlan"]
    HIST["Name sign-in · chat history"]
    MAP["MapLibre + OSM tiles<br/>shop-type icons · clusters · numbered sellers"]
  end
  subgraph App["Next.js 15 route handlers"]
    CHAT["/api/chat<br/>AI SDK v7 streamText + tools<br/>+ user memory in the prompt"]
    SELL["/api/sellers · /api/session<br/>(no LLM)"]
    FU["/api/followup · /api/plan · /api/shop"]
    ACC["/api/auth · /api/me · /api/chats<br/>/api/shops/near"]
    TOOLS["Tools: search_products · compare_products · set_context<br/>find_sellers · shop_details · contact_seller<br/>find_alternatives · plan_trip · purchase_checklist · clarify_need<br/>run_mission (compound requests → one report)"]
    SIM["Seller simulator<br/>sha256(SIM_SALT+offer_id)"]
  end
  LLM["LLM provider (env switch)<br/>OpenAI · Google · OpenRouter<br/>↳ offline rule model fallback"]
  DB[("PostgreSQL 16<br/>pg_trgm · unaccent<br/>shops · products · offers<br/>users · sessions (chats) · followups · plans")]
  CSV["data/*.csv"] -->|"pnpm seed (COPY)"| DB
  UI -->|"free text / UI actions"| CHAT
  UI -->|"filters, radius, location"| SELL
  UI --> FU
  HIST --> ACC
  MAP --> ACC
  CHAT --> TOOLS --> DB
  CHAT <--> LLM
  FU --> SIM --> DB
  SELL --> DB
  ACC --> DB
  MAP --- UI
  CADDY["Caddy (HTTPS)"] --> App
```

**How a turn works.** Free text goes to `streamText` with the tools; the model decides. Taps on cards («فروشنده‌های نزدیک», «مقایسه», «پیگیری ۳ تای اول», «برنامه مراجعه») are messages with `metadata.action`: the server runs that tool immediately (same code as the LLM's call), streams the card, then the LLM adds one or two sentences. A message with two or more goals, or one that delegates a check («خودت بپرس»، «چک کن»…), is detected by rules and runs as the `run_mission` action the same way (live `data-mission-progress` parts, then ≤ 3 sentences from the model). ContextBar changes never call the LLM: they `PATCH /api/session` and the latest seller list re‑fetches `/api/sellers` in place (and is written back into the chat history so the agent explains what the user sees).

**Users, chats and memory.** Signing in with a name sets an httpOnly cookie for a `users` row. Each chat is a `sessions` row owned by that user (context state + the UI messages); the client sends the chat id with every request. The server stores the messages when a turn ends; cards that change afterwards (follow‑up outcomes, a re‑filtered seller list) are saved by the client with `PUT /api/chats/<id>/messages`. After each turn, and when the ContextBar location or radius changes, the user's memory (location, radius, recent searches and products) is updated; it is added to the system prompt and seeds the location of new chats.

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
pnpm golden                                # 15 golden search queries + seller checks + S1–S4 decisions + 8 compound missions + feature-pack checks (needs the DB)
pnpm hubs                                  # rebuild the «بورس‌ها» table (the seed does it too)
pnpm vision-check                          # photo search fixtures against every configured provider (network + keys)
pnpm scenario                              # demo scenario §13 + history/memory on a 390 px viewport, screenshots → docs/screenshots/tmp
pnpm scenario --desktop                    # same on 1440×900 (history sidebar + map column); --dark for dark mode
pnpm llm-check                             # one tool call per configured provider
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://app:app@db:5432/app` | PostgreSQL (compose overrides it to the `db` service). |
| `DB_PORT` · `POSTGRES_PASSWORD` | `5432` · `app` | Host port (bound to 127.0.0.1) and password of the compose database. |
| `LLM_PROVIDER` | `openai` | `openai` · `google` · `openrouter` · `offline` — switch with zero code changes. |
| `LLM_MODEL` · `LLM_FAST_MODEL` | `gpt-4.1-mini` · — | Tool‑calling model; optional cheaper model for routing, seller persona and checklist. |
| `LLM_VISION_MODEL` | per provider | Photo search (F1): openai → `LLM_MODEL`, google → `gemini-3.1-flash-lite`, openrouter → `google/gemini-2.5-flash`. The photo goes to that provider only and is not stored. `pnpm vision-check` runs the three fixtures. |
| `OPENAI_API_KEY` · `OPENAI_BASE_URL` | — | OpenAI key; optional OpenAI‑compatible proxy URL. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Gemini key. |
| `OPENROUTER_API_KEY` | — | OpenRouter key. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Folder with the three CSVs. |
| `DATASET_AS_OF` | `2026-10-13` | "Today" for price‑age computation. |
| `AUTO_SEED` | `true` | Seed on container start when `products` is empty. |
| `SIM_SALT` | `hamrah-40` | Seed of the deterministic seller simulator (tuned for the demo). |
| `APP_URL` · `APP_DOMAIN` | — | Public URL (an `https://` URL also marks the sign‑in cookie `Secure`); Caddy site address (`example.com` → automatic HTTPS, `:80` → plain HTTP). |
| `HTTP_PORT` · `HTTPS_PORT` | `80` · `443` | Host ports of Caddy. |
| `NPM_REGISTRY` | npmjs | Build‑time npm mirror for restricted networks. |

## Honesty note — simulated seller contact

The dataset's shop names and phone numbers are fake, so the agent **cannot** really call or message shops. Follow‑ups are **simulated** and labelled so in the UI («پیگیری‌ها شبیه‌سازی‌شده‌اند»; a real version would go through Torob's messaging/call channel). The outcome is deterministic per offer — `sha256(SIM_SALT + offer_id)` — and depends on the price freshness (stale prices are more often out of stock or changed), on the channel (a call to a closed shop is not answered) and arrives after 1.5–4 s. Seller lines are written by the fast LLM constrained to that outcome (rejected if they mention any other price) or by templates. The architecture is ready for a real channel: replace `lib/sim/` with a messaging/call integration that writes the same `followups` rows.

## Dataset

The data is the **Torob × Starcoach hackathon export** («Starcoach v16 cap300 CSV export»): `shops.csv` (6,476), `products.csv` (225,903), `offers.csv` (331,506). It is **not** committed (products.csv is 196 MB).

- Download: **`<official dataset link from the challenge page>`** *(placeholder — add the official URL)*, then place the three files in `data/` (or point `DATA_DIR` at them). See `data/README.txt`.
- What the seed derives: normalized titles/search text, brand for products without one, product seller count / min & median price (sane prices only), price age and freshness, suspicious‑price flags vs the product median, mall/floor/unit from addresses, opening‑hours availability, payment providers and channels, warranty text, categories with product/shop counts.
- Facts worth knowing: only 3,792 shops have offers; prices are missing for 15,083 offers; 42 % of prices are older than 30 days; payment options exist for 266 shops; 85 % of shops are in central Tehran (Ferdowsi, Sheikh Hadi, Baharestan).

## Project structure

```
app/            page, /plan/[id], /demo-reset, api/{chat,session,sellers,followup,plan,shop,places,products/search,healthz}
                api/{auth/login,auth/logout,me,me/memory,chats,chats/[id],chats/[id]/messages,shops/near}
components/     app shell (login, history, ContextBar, sheets, composer, map column) and cards (products, compare, sellers, follow-ups, alternatives, plan, checklist)
lib/auth.ts     name-only sign-in (cookie → users row), memory save
lib/fa          Persian normalization, digits, formatting
lib/data        mall/floor/unit parser, opening hours, price quality, payments, warranty, shop types from activity categories
lib/search      query parsing, category routing, product ranking, sellers + score, alternatives, places, shops near a point
lib/agent       tools, system prompt, chats (session state + messages), memory, suggestions, offline model, checklist
lib/agent/mission  compound requests: extraction, gazetteer + geocoder, coverage loop, verdicts, executor
lib/sim         seller simulator, persona transcripts, follow-up service
lib/plan        visit planner
scripts         seed, golden, scenario, smoke, llm-check, tune-salt, shop-types-report
docs            spec, run plan, DECISIONS, PROGRESS, DEPLOY, DEMO, screenshots
```

## License

MIT — see [LICENSE](LICENSE). Vazirmatn font: SIL OFL (`public/fonts/OFL.txt`). Map data © OpenStreetMap contributors.
