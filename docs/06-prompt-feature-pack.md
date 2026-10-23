# Prompt — Feature pack 2: photo search, in‑mall mode, multi‑item trip, seller message, bargaining card, spec Q&A, trust signals, best time to visit

Paste into Claude Code at the repo root. It builds on `docs/05-prompt-compound-missions.md` (missions); if that is not merged yet, implement it first.

```
Read docs/01-master-build-spec.md, docs/05-prompt-compound-missions.md, docs/PROGRESS.md and docs/DECISIONS.md. Implement the eight features below in the given order (cheapest first), one commit per feature, without breaking `pnpm typecheck && pnpm lint && pnpm test && pnpm golden && pnpm scenario`. Every feature: a tool (or service) the agent can call, a UI card, a unit test for the pure logic, a scenario step with a screenshot, a line in docs/DEMO.md, and DECISIONS/PROGRESS updates. All user-facing text in Persian with Persian digits; every number from the DB/simulator; unknowns labeled «ثبت نشده»/«اعلام نشده».

General rules
- Reuse existing services (searchProducts, findSellers, shopDetails, followups, trip, memory). No duplicated query logic.
- Each new tool returns a `ui` discriminator and a compact LLM view (≤ 2 KB) plus the full UI payload.
- New tools are also reachable from missions (docs/05): extend the Mission schema where noted.
- Keep LLM calls out of the hot path where a template works; where an LLM is used (vision, spec Q&A, message wording), guard with a 6 s timeout and a template fallback.

------------------------------------------------------------------
F10 — Trust signals (smallest first)
------------------------------------------------------------------
Goal: surface the dataset's trust-relevant fields so the user can judge a shop at a glance.
- Seller card and shop sheet show, when present: «وب‌سایت» and «اینستاگرام» buttons (open in new tab; 90 + 22 shops have them), «ساعت کاری ثبت‌شده» vs «ساعت کاری ثبت نشده», payment channel wording: `in_person` → «پرداخت اعتباری حضوری تأییدشده (ترب‌پی/اسنپ‌پی/…)», `unknown` → «پرداخت اعتباری اعلام‌شده (کانال نامشخص)», warranty text, fast delivery, and «این فروشگاه N محصول دیگر در همین دسته دارد».
- A `trust_score` (0–3 stars, deterministic): +1 hours known, +1 website or instagram, +1 fresh/recent price on this offer. Show as small dots with a tooltip «چرا؟». Never present it as a quality/rating of the shop; label it «کامل بودن اطلاعات».
- Ranking: add `info_completeness` as a 0.05‑weight tie‑breaker in score.ts (document in DECISIONS).
- Acceptance: a shop with website_url shows the button; the two payment wordings render correctly; unit test for trust_score.

------------------------------------------------------------------
F11 — Best time to visit
------------------------------------------------------------------
Goal: answer «کی برم؟» for a seller list, a mall or a single shop from weekly_hours.
- `lib/data/hours-stats.ts`: `hoursHistogram(shops[], day) → {hour: openCount}` and `bestWindow(shops[], day) → {start, end, coverage: 0..1}`; `fridayClosedShare`.
- Tool `best_time_to_visit({scope: 'sellers'|'mall'|'shop', mall_key?, shop_id?, day?})` → `{day, window, coverage, closedShare, unknownShare, perHour[]}`.
- UI: `VisitTimeCard` — a 24‑cell mini heatmap (Sat–Fri selectable) and a sentence like «شنبه بین ۱۱ تا ۱۸، ۹۲٪ فروشنده‌ها بازند؛ جمعه ۸۸٪ تعطیل‌اند؛ ساعت ۳ فروشگاه ثبت نشده». Shown under the seller list on request and inside the trip plan header («بهترین زمان برای این مسیر»).
- Mission: `verify.hours` also attaches this card. Trip plan: if the start time falls outside the best window, add a suggestion chip «شروع از ۱۱:۰۰».
- Acceptance: for A17 sellers at the default location the window is computed and the Friday share > 0.5; unit tests on hand-made schedules.

------------------------------------------------------------------
F8 — Spec Q&A (grounded)
------------------------------------------------------------------
Goal: «این گوشی NFC داره؟ وزنش چنده؟ فرقش با اون یکی چیه؟» answered from `products.specs` only.
- Tool `product_specs_qa({product_ids[], question})`: pick relevant spec rows by trigram/keyword match on key+value (synonyms: NFC/ان‌اف‌سی, وزن/گرم, باتری/میلی‌آمپر, حافظه/رم/گیگ, صفحه/اینچ, شارژ سریع/وات); if a direct match exists, answer from a template; otherwise pass only the matched spec rows (≤ 30) to the fast model with the instruction to answer strictly from them or say «در مشخصات ثبت‌شده نیامده». Return `{answer, evidence: [{product_id, key, value}]}`.
- UI: `SpecAnswer` card — the answer plus evidence chips «(مشخصات: NFC → دارد)»; tapping opens the compare table scrolled to that key.
- System prompt: for any factual question about a product, call this tool; never answer from memory.
- Acceptance: 8 golden questions (NFC, weight, battery, screen size, RAM, color, charger wattage, a missing spec) → correct or «نیامده»; no hallucinated values (evidence must contain the quoted value).

------------------------------------------------------------------
F4 — Ready-to-send seller message (real-world counterpart of the simulation)
------------------------------------------------------------------
Goal: the user can actually contact the shop themselves with one tap.
- Tool `compose_seller_message({offer_id, intent: 'availability'|'price'|'hours'|'reserve'|'custom', note?})` → `{text, channels: [{type:'whatsapp'|'bale'|'sms'|'copy', url?}]}`. Text template in Persian: greeting, product title + listed price + «آخرین تغییر قیمت N روز پیش در ترب», the question(s), request for floor/unit confirmation when the address has a mall, sign-off. ≤ 450 chars. Optional light LLM rewrite with timeout + fallback to the template.
- Channels from `contacts`: phone → `https://wa.me/<digits>?text=` and `sms:<digits>?body=`; Bale → `https://ble.ir/<handle>` if present, else copy. Numbers in the dataset are fake: show the disclaimer «شماره‌های دیتاست آزمایشی‌اند» in the sheet, but keep the links so the flow is real.
- UI: on SellerCard «پیگیری» sheet add a second section «خودم پیام بدهم» with the composed text (editable textarea), copy button, channel buttons. On FollowupBoard rows with `no_answer` add «خودم پیام بدهم».
- Acceptance: text contains product title, listed price, price age, mall/floor/unit when known; whatsapp URL encodes the text; screenshot.

------------------------------------------------------------------
F5 — Bargaining card
------------------------------------------------------------------
Goal: concrete, data-backed talking points before the user walks in.
- `lib/search/market.ts`: for a product, price stats over `ok` offers (min, p25, median, p75, max, n, nearest cheaper offer within the current radius, warranty differences, freshness of this offer vs market).
- Tool `bargaining_card({offer_id})` → `{position: 'below_median'|'near_median'|'above_median', delta_pct, cheaper_nearby: {shop_name, price, distance_m, mall} | null, warranty_gap: string | null, freshness_note, talking_points: string[] (≤4, templated), target_price: number | null}`. Target price = max(min_nearby, median × 0.97) rounded to 10,000, only when the offer is above that; otherwise «قیمت منصفانه است».
- UI: `BargainCard` under the shop sheet and as a chip «کارت چانه‌زنی» on seller cards: a small range bar (min–median–max with this offer marked), the talking points as bullets, target price callout, «پیام با این قیمت» → opens F4 with intent price and the target.
- Acceptance: for the top A17 seller, the card shows position/delta and ≤4 points; unit tests for stats and target rule; no LLM required.

------------------------------------------------------------------
F2 — «الان توی پاساژم» (in‑mall mode)
------------------------------------------------------------------
Goal: the user is standing in a mall; show what matters floor by floor.
- Tool `mall_view({mall_key, product_id?, category?})` → `{mall: {name, shop_count, floors: [{floor_num, floor_label, shops: [{shop_id, name, unit_label, type, offer?: {price, freshness, followup_status}, same_category: boolean}]}]}, hours_summary (from F11), nearby_malls: [{mall_key, name, distance_m, seller_count}]}`. Shops sorted: sellers of the product first, then same-category «همسایه‌های جایگزین», then others collapsed.
- Entry points: a «الان توی پاساژم» chip in the hero and in suggested actions when the user's location is within 150 m of a mall centroid or when they tap a cluster chip; `set_context` with a mall name sets location to its centroid with radius 300 and `state.mode = 'in_mall'`.
- UI: `MallView` — floor tabs (منفی ۱ · همکف · ۱ · ۲ …), each a list of units with the three-field price block for sellers, «همسایه جایگزین» badge for same-category shops without an offer (no price shown), «پیگیری همه‌ی این طبقه» action, hours summary line, nearby malls row. Works offline-ish (pure DB).
- Mission: `location.text` that resolves to a mall → mission runs in in_mall mode (radius 300) and the MissionResult rows are grouped by floor.
- Acceptance: `mall_view` for علاءالدین with A17 shows ≥3 floors, sellers first, same-category neighbours badged; screenshot phone + desktop; unit test for floor sorting (منفی یک → همکف → ۱ …).

------------------------------------------------------------------
F3 — Multi‑item trip («سبد خرید حضوری»)
------------------------------------------------------------------
Goal: «گوشی + کاور + گلس + پاوربانک» in one trip, fewest malls.
- State: `state.basket: Array<{query, product_id?, budget?, resolved_offers: string[]}>`. Tools `basket_add({query|product_id, budget?})`, `basket_remove`, `basket_plan()`.
- `lib/plan/basket.ts`: for each item take candidate sellers within radius (top 8 by score); greedy weighted set cover over malls (weight = items covered, tie-break by total price then distance), then fill uncovered items with the nearest single sellers; produce `coverage: {items_total, items_in_one_mall, malls_used}`; feed the chosen offers into the existing trip builder (floors ascending inside a mall).
- UI: `BasketBar` (collapsible, above the composer: item chips with ✓/✗ resolved), `BasketPlan` card: «۳ از ۴ قلم در پاساژ علاءالدین، ۱ قلم در چارسو (۲۰۰ متر)»، per-item chosen seller with price and floor/unit, total, alternatives link per item, then the TripPlan. «پیگیری همه» runs follow-ups for all chosen offers (reuse awaitFollowups).
- Agent: a message with 2+ products («… و … و …», «با هم», «یکجا») → extract items (zod) → basket flow; mission schema gets `items[]`.
- Acceptance: scenario «گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی» → ≥2 items in one mall, plan grouped, follow-ups awaited; unit tests for set cover on synthetic data.

------------------------------------------------------------------
F1 — Photo search
------------------------------------------------------------------
Goal: photograph a box / shelf tag / product in a shop → identify → compare nearby instantly.
- API `POST /api/vision/identify` (multipart or base64 ≤ 4 MB; downscale client-side to ≤ 1280 px): call the configured provider's vision-capable model (OpenAI / Gemini / OpenRouter via AI SDK image parts; add `LLM_VISION_MODEL` env with sane defaults per provider and document them) with a strict JSON schema: `{brand?, model?, product_type, visible_price_toman?, text_lines[], confidence}`. Also OCR the shelf price if visible.
- Then `searchProducts` with brand+model (+category hint) → top 3 candidates with confidence; if `visible_price_toman` was read, compare it against market stats (F5) and against nearby sellers: «قیمت روی قفسه ۶۱٬۰۰۰٬۰۰۰ — ۷٪ بالای میانه؛ ۳۰۰ متر آن‌طرف‌تر (چارسو، طبقه ۱) ۵۵٬۹۵۰٬۰۰۰».
- UI: camera/gallery button in the composer (`<input type=file accept=image/* capture=environment>`), thumbnail in the message, `PhotoMatch` card: candidates with «همین است» / «نه، این نیست» (second tap switches to the next candidate), then the normal seller list / bargaining card. Clear privacy line: the image is sent to the model provider and not stored (do not persist images).
- Mission: an image + text («این رو ببین، همین پاساژ ارزون‌تر کی داره؟ بپرس موجوده») → mission with product resolved from the photo.
- Acceptance: three test images in `tests/fixtures/vision/` (a Samsung box photo, a shelf tag with a Persian price, an unrelated object) → correct brand/model for the first, price parsed for the second, graceful «نتونستم تشخیص بدم، اسمش رو بنویس» for the third; provider switch verified for at least two providers; scenario step + screenshot.

------------------------------------------------------------------
Wrap-up
------------------------------------------------------------------
- Add hero chips for: «الان توی پاساژ علاءالدینم», «گوشی + کاور + گلس یکجا», and the camera button hint.
- Update README feature list and the judging-criteria map; docs/DEMO.md: insert F1 and F2 as short beats after the mission example, F3 only if the demo stays under 5 minutes (otherwise mention it in the wrap-up slide).
- Final: `pnpm typecheck && pnpm lint && pnpm test && pnpm golden && pnpm scenario` green (phone, desktop, Docker); push and tag v1.1.
```
