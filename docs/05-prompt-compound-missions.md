# Prompt — Compound requests: autonomous "missions" (plan → execute → verify → report)

Paste into Claude Code at the repo root.

```
Read docs/01-master-build-spec.md §6 (agent), docs/PROGRESS.md and docs/DECISIONS.md first. Then implement the feature below without breaking `pnpm scenario` (28/28), `pnpm golden`, `pnpm test`, lint and typecheck.

## The problem (real failing example)
User typed, in one message:
«من یه گوشی سامسونگ حدود قیمت ۵۰ میلیون تومن میخوام. محدوده سعادت آباد باشه. و خودت بپرس ببین قیمت‌هاشون آپدیت هست یا نه و اینکه الان باز هستند.»
The agent did not carry this out. A compound request like this must be understood as ONE mission with several sub-goals and executed autonomously to completion, then reported as a single consolidated result — the user should not have to drive each step.

Root causes to verify and fix (I checked the dataset; the first two are facts):
1. Location understanding is limited to the 30 `shops.location_label` values + mall names. «سعادت آباد» is not among them, so set_context cannot place the user.
2. Data coverage is sparse outside central Tehran: around سعادت‌آباد (35.7828, 51.3745) there are 0 shops within 1 km, 169 shops within 3 km, and only 2 shops selling Samsung phones within 3 km (1 offer in the 45–55M band). 85% of shops are in فردوسی/شیخ‌هادی/بهارستان. The agent must degrade honestly: widen the radius automatically, say explicitly that the requested neighbourhood has no (or few) listed sellers in the Torob dataset, and offer the nearest cluster.
3. Follow-ups (`contact_seller`) are asynchronous (UI polls). Inside one agent turn the model cannot wait for results, so it cannot answer «قیمت‌ها آپدیت هست یا نه» in the same message.
4. `stepCountIs(5)` is too small for a 7–8 tool chain, and the system prompt does not tell the model to finish a multi-goal request end to end before replying.
5. «حدود ۵۰ میلیون» must become a band (±10% → 45–55M), not a hard cap; «آپدیت هست یا نه» maps to the freshness field AND to a follow-up that confirms the price; «الان باز هستند» maps to filter open_now AND to reporting open/closed per seller.

## Design: Mission layer (deterministic executor + LLM at the edges)
Keep the existing free-form tool-calling agent. Add a mission path that the chat route uses when a message contains more than one goal, or any delegated verification («خودت بپرس», «چک کن», «پیگیری کن», «ببین باز هستن», «مطمئن شو»).

A. `lib/agent/mission/extract.ts` — `extractMission(text, state) → Mission | null` via `generateObject` with the fast model (zod schema):
```
Mission {
  product: { query: string; brand?: string; category_hint?: string } | null;
  budget: { min?: number; max?: number; mode: 'about' | 'max' | 'min' | 'range' } | null;   // «حدود ۵۰ میلیون» → {min:45e6, max:55e6, mode:'about'}
  location: { text?: string; radius_m?: number } | null;                                      // «محدوده سعادت آباد» → {text:'سعادت آباد'}
  conditions: { open_now?: boolean; installment?: boolean; torobpay?: boolean; fast_delivery?: boolean; warranty?: boolean };
  verify: { price_freshness?: boolean; contact_sellers?: boolean; availability?: boolean; hours?: boolean }; // «خودت بپرس… آپدیت هست یا نه» → price_freshness+contact_sellers; «الان باز هستند» → hours (+open_now condition)
  output: { top_n?: number; want_plan?: boolean; want_compare?: boolean };
  intent: 'balanced' | 'cheapest' | 'nearest' | 'now';
}
```
Rules: Persian number/budget parsing reuses lib/search/query.ts; «حدود/تقریباً/دور و بر» → about ±10%; «تا/حداکثر/زیر» → max; «از … تا …» → range. Unit tests with ≥12 Persian phrasings.

B. `lib/agent/mission/gazetteer.ts` — a static list of ~120 Tehran neighbourhoods/landmarks with lat/lon (سعادت‌آباد، شهرک غرب، ونک، تجریش، پونک، نارمک، تهران‌پارس، پیروزی، شهرری، صادقیه، گیشا، یوسف‌آباد، امیرآباد، انقلاب، جمهوری، لاله‌زار، بازار بزرگ، میدان ولیعصر، میدان آرژانتین، سیدخندان، رسالت، آزادی، ستارخان، مرزداران، جنت‌آباد، اکباتان، نیاوران، فرمانیه، پاسداران، شریعتی، هفت‌تیر، قلهک، دروس، الهیه، زعفرانیه، باغ فیض، … plus the 30 dataset location_labels mapped to their shop centroids). Normalize spellings (ZWNJ/space variants). `geocodeText(text)` tries: mall names → dataset location_labels (centroid) → gazetteer (trigram, threshold 0.45) → null. Expose it to set_context and the LocationSheet search.

C. `lib/agent/mission/run.ts` — `runMission(mission, state, emit)`: a deterministic pipeline that calls the SAME service functions the tools use (no duplicated logic) and emits progress events:
  1. locate: geocode location.text; if null → ask ONE question via clarify_need chips (nearby known areas) and stop. Set state.location/radius.
  2. search: searchProducts with the budget band; keep top 3–4 (prefer products with ≥2 sellers).
  3. sellers: findSellers for the top products at radius r. Coverage loop: r ∈ [state.radius_m, 2000, 3000, 5000, 8000] until ≥ 3 sellers or the list ends. Record `coverage: {requested_radius, used_radius, sellers_in_requested_radius}`. Apply conditions; if open_now empties the list, keep the list but mark closed ones (the user asked to know, not necessarily to hide).
  4. verify: if verify.contact_sellers or availability → start follow-ups for the top N (N = output.top_n ?? 5, channel 'message'; 'call' only if the user said تماس/زنگ) and **await them** with a deadline (new `awaitFollowups(ids, {timeoutMs: 8000})` in lib/sim/followups.ts). Price freshness is reported from the data regardless.
  5. report: build a `MissionResult`:
```
MissionResult {
  understood: string[];            // «گوشی سامسونگ»، «حدود ۵۰ میلیون (۴۵–۵۵)»، «محدوده سعادت‌آباد»، «بررسی به‌روز بودن قیمت»، «باز بودن الان»
  coverage: { requested_radius_m, used_radius_m, note?: string };  // note: «در خود سعادت‌آباد فروشنده‌ای برای این کالا در داده ترب ثبت نشده؛ نزدیک‌ترین‌ها در ۳ کیلومتری (باغ فیض) هستند»
  rows: Array<{ offer_id, shop_name, product_title, price, price_flag, freshness, price_age_days, open: {known, open, label}, distance_m, mall,
                followup: {status, new_price?, replied_at?} | null, verdict: 'recommended'|'ok'|'avoid'|'unknown', verdict_reason: string }>;
  recommendation: { offer_id, reason: string } | null;
  next_actions: string[];          // chips: «برنامه مراجعه»، «پیگیری ۳ تای بعدی»، «شعاع ۵ کیلومتر»، «مرکز شهر را هم ببین»
  steps: Array<{ id, label, status: 'done'|'skipped'|'failed', detail?: string }>;
}
```
  Verdict rules (deterministic): recommended = in budget band AND (followup confirmed OR fresh price) AND open (or hours unknown but not closed); avoid = out_of_stock OR suspicious price OR closed with no next opening today; otherwise ok; unknown when no follow-up and stale/unknown freshness.

D. Agent integration:
  - New tool `run_mission({ text })` that the model MUST call when the message has ≥2 goals or any delegated verification (state this in the system prompt with the exact trigger words). The tool returns MissionResult with `ui: 'mission'`. The model then writes ≤3 sentences in Persian summarizing coverage note + recommendation, nothing else; numbers only from the result.
  - Also accept `mode: 'auto'` in /api/chat: run extractMission server-side before the model; if it returns ≥2 goals, prepend a system hint «این پیام یک مأموریت چندمرحله‌ای است؛ ابتدا run_mission را فراخوانی کن» — belt and braces.
  - Raise `stopWhen: stepCountIs(10)`; per-step timeout stays 25 s; total mission budget 20 s (follow-up await ≤ 8 s; remaining follow-ups keep resolving in the background and the board updates live).
  - Progress streaming: use AI SDK data parts (`writer.write({type:'data-mission-progress', …})`) so the UI shows steps as they complete: «📍 سعادت‌آباد پیدا شد» → «🔎 ۳ گوشی در بازه ۴۵–۵۵ میلیون» → «🏬 در ۱ کیلومتر: ۰ · در ۳ کیلومتر: ۲ فروشنده» → «📨 پیگیری ۲ فروشنده…» → «✅ گزارش آماده».

E. UI:
  - `MissionProgress` card (steps with live status, collapses when done).
  - `MissionResult` card: header «این‌طور فهمیدم:» chips (tap a chip to edit that constraint → re-run), coverage banner (amber when used_radius > requested), a compact table (phone: stacked rows) with columns: فروشگاه/پاساژ · قیمت · تازگی · باز؟ · پیگیری · نتیجه, verdict pill with reason, recommendation callout, next_actions chips. Rows reuse SellerCard semantics (three fields) and open the shop sheet on tap. Follow-up cells update live while pending.
  - Hero: add a 5th scenario chip with the failing example text, and make it part of `pnpm scenario` (new step 9).

F. Tests & acceptance:
  - Unit: extractMission on ≥12 phrasings (below), gazetteer lookup (سعادت آباد/سعادت‌آباد/سعادتاباد → same point), verdict rules, coverage loop.
  - `scripts/missions.ts` (add to `pnpm golden`): run these compound requests end to end against the API (offline model allowed) and assert the MissionResult shape and key facts:
    1. «یه گوشی سامسونگ حدود ۵۰ میلیون میخوام، محدوده سعادت آباد، خودت بپرس قیمت‌ها آپدیته و الان بازن؟» → location = سعادت‌آباد; used_radius ≥ 3000 with coverage note; ≥1 row; follow-ups awaited (statuses not all pending); open labels present; recommendation or an explicit «پیشنهادی ندارم چون…».
    2. «هدفون بلوتوثی تا ۳ میلیون نزدیک میدان ولیعصر، فقط اونایی که الان بازن، ارزون‌ترین اول» → intent cheapest, open_now, rows sorted by price.
    3. «ارزون‌ترین A17 توی پاساژ علاءالدین کیه و موجود داره؟ زنگ بزن» → location = mall centroid, radius 300, channel call, availability verified.
    4. «یه پاوربانک ۲۰ هزار بین ۱ تا ۲ میلیون تجریش، قسطی باشه» → range budget, installment condition, relaxation note if empty.
    5. «گوشی سامسونگ تا ۶۰ میلیون نزدیک من، ۳ تا فروشنده بهتر رو پیگیری کن و برنامه مراجعه بده» → want_plan → plan built after follow-ups.
    6. «دوربین مداربسته برای مغازه، نارمک» → coverage note (no sellers within 5 km) and an offer to look at central Tehran; no fabricated rows.
    7. «قهوه ساز خونگی نمیدونم کدوم، حدود ۵ میلیون» → single-goal → NOT a mission (clarify/normal path).
    8. «همون گوشی قبلی رو این بار تو فردوسی چک کن» → uses memory/state (chosenProduct), location فردوسی.
  - `pnpm scenario` 28/28 still green plus the new step; screenshots `22-mission-progress.png`, `23-mission-result.png` (phone + desktop).
  - Record all deviations in docs/DECISIONS.md and update docs/PROGRESS.md and docs/DEMO.md (add the mission example as a demo beat right after step 1).

Honesty constraints: never invent sellers in an area with no data; the coverage note must state the dataset limitation plainly; simulated follow-ups keep their disclaimer; every number in MissionResult comes from DB/simulator rows.
```
