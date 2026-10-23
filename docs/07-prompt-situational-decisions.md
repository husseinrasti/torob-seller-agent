# Prompt — Situational decisions on the map ("it's 23:30 and I need a charger")

Paste into Claude Code at the repo root. Builds on docs/05 (missions) and docs/06 (feature pack); implement after 05, and before/independently of 06 if time is short — this is the highest-value item.

```
Read docs/01-master-build-spec.md, docs/05-prompt-compound-missions.md, docs/PROGRESS.md, docs/DECISIONS.md and lib/data/hours.ts. Then implement the feature below.

## Why (mentor feedback from Torob)
Trivial scenarios («گوشی زیر ۳۰ میلیون») are worthless: Torob's own search already does price filtering. The challenge is judged on a *good in‑person shopping experience*: interactive map widgets that solve real pain points with slightly complex decisions, explained in the demo. Reference scenario from the mentor:

«ساعت ۱۱:۳۰ شب است و شارژر موبایل می‌خواهم.» The agent finds that every shop within 2 km that sells chargers is closed. One shop 4 km away is open. But it also notices the user is ~1 km from an electronics bazaar (بورس لوازم الکترونیکی). So it says: «در ترب یکی در ۴ کیلومتری‌ات باز است» (shop card + location card + price + useful info) «ولی به نظر می‌رسد نزدیک X هستی؛ شاید تا این ساعت آن‌جا مغازه‌ای باز باشد که شارژر بفروشد ولی در ترب ثبت نشده باشد» (location card for the hub).

Design reference: Torob's own assistant «تربچت» (chat.torob.com) is deliberately minimal. Our UI must move toward that: less chrome, fewer simultaneous chips, one primary action per card, the map as a first-class answer component rather than a side panel.

## Dataset facts you must design around (verified)
- Charger sellers (category «شارژر گوشی» or offers in charger categories): 392 shops; 306 of them within 1 km of فردوسی/جمهوری (the mobile bazaar). Around سهروردی: 0 within 1 km, 6 within 2 km, 45 within 4 km. Around ونک: 0 within 4 km, 21 within 6 km. So «nothing nearby, something far, a bazaar in between» is the normal case, not the exception.
- Hours: 3,689 Saturday shifts are declared as 00:00–00:00. Treat a declared 00:00–00:00 shift as **unreliable/unknown**, never as "open 24 h" (check and fix lib/data/hours.ts if needed; add a unit test). Real closing times cluster at 18:00–21:30; latest common is 21:30. At 23:30 essentially nothing is verifiably open → the honest answer is about *probabilities and alternatives*, not a list.
- 2,684 shops have no offers; 887 of them have activity categories («category-only»). These are exactly the «ممکن است داشته باشد ولی در ترب ثبت نشده» signal.
- Shop density: the 500 m grid cells around فردوسی/شیخ‌هادی hold 500–1,000 shops each; this is the hub structure.

## What to build

### 1. Hubs («بورس‌ها») — `lib/data/hubs.ts` + table `hubs`
Derive commercial clusters from the data and merge with a small curated list.
- Derivation at seed time: assign each shop a `category_family` (reuse the 20 shop types from the map work) and grid shops into ~400 m cells; DBSCAN-like merge of adjacent cells with ≥ 25 shops; for each cluster compute centroid, radius (p90 distance), shop_count, listed_count (has_offers), category_only_count, per-family counts, hours profile (median open/close among declared, non-00:00 shifts; share with unknown hours), and a name: the most frequent mall or street token in addresses within the cluster plus the dominant family, e.g. «بورس موبایل جمهوری (علاءالدین/چارسو)», «بورس برق و روشنایی لاله‌زار», «بورس دوربین مداربسته جمهوری».
- Curated overrides/additions in `data/hubs.curated.json` (name, families, lat/lon, radius_m, typical_hours, note) for well-known Tehran bazaars even where the dataset is thin: بورس موبایل جمهوری، بورس برق لاله‌زار، بورس کامپیوتر (پایتخت/رضا، میرداماد)، بورس لوازم خانگی امین‌حضور، بورس ابزار حسن‌آباد/امام‌خمینی، بورس عکاسی جمهوری/سعدی، بورس ساعت و طلا بازار، بورس موبایل ولیعصر/ونک (پاساژهای ونک)، بورس موبایل تهرانپارس/رسالت… Mark curated entries `source: 'curated'` and show «بر اساس شناخت عمومی، نه داده ترب».
- `findHubs({lat, lon, family, radius_m}) → [{hub_id, name, distance_m, families, shop_count, listed_count, category_only_count, hours_profile, source, note}]`.

### 2. Decision engine — `lib/agent/decide.ts`
`decideWhereToBuy({need: {category|product_id}, location, now, urgency: 'now'|'today'|'flexible', max_detour_m}) → Decision` producing **tiers**, each with evidence and an honest confidence:
  T1 `open_listed_near`: open now (hours known, not 00:00–00:00), lists the product/category, within the requested radius.
  T2 `open_listed_far`: same but beyond the radius, up to 8 km, sorted by travel time (driving 25 km/h in the city, walking 80 m/min; choose by distance); include «closes in N min» and a hurry flag when N < 45.
  T3 `hub_nearby`: hubs within 3 km whose families match the need; confidence from hours_profile (share of shops in the hub typically open at `now`), category_only_count and curated note; wording: «ممکن است باز باشد؛ در ترب ثبت نشده».
  T4 `unknown_hours_near`: listed/category shops within radius whose hours are unknown — «ساعتش ثبت نشده، شاید باز باشد» (low confidence; offer a one-tap follow-up message).
  T5 `opens_soonest`: the earliest opening tomorrow (or later today) among near listed shops, with time.
  Decision = ordered tiers with a one-line verdict per tier, a `recommended` pointer (urgency 'now': T1 > T2 if travel ≤ 25 min else T3 > T4 > T5; 'today'/'flexible': T1 > T5 > T2), and `tradeoffs: string[]` («۴ کیلومتر دورتر ولی مطمئن» vs «۱ کیلومتر ولی نامطمئن»).
  Pure, deterministic, unit-tested with synthetic shops/hours.

### 3. Tool + mission integration
- Tool `decide_where_to_buy({need_text|product_id, urgency?})` — resolves category via routing, calls the engine with state.location, `now` (demo_time aware), radius. Returns `{ui:'decision', ...Decision}` with a compact LLM view.
- Triggers (system prompt + mission extractor): time words («الان», «این ساعت», «شب», «ساعت ۱۱», «فوری», «همین الان»), «بازه؟/کجا بازه», or when find_sellers returns 0 open sellers while open_now was requested → the agent must call this tool instead of replying «چیزی پیدا نشد».
- The mission `verify.hours`/`conditions.open_now` path uses the Decision for its coverage note.

### 4. Map-first answer widget — `DecisionMap` + `DecisionCards`
This is the centre of the feature; make it the best-looking component in the app.
- Full-width map card inside the chat (not the side panel): user pin; requested radius as a soft circle; T1/T2 shops as pins with a price label; the recommended one highlighted with a straight-line route and ETA bubble («≈ ۱۲ دقیقه با ماشین»); closed near shops as faint gray dots (tap → «بسته · فردا ۱۰:۰۰»); hubs as a shaded translucent area with a label pill («بورس موبایل جمهوری · ۱٫۱ کیلومتر · احتمالاً تا ۲۱:۳۰») and an amber ring when hours are only typical; T4 unknown-hours shops as dashed pins.
- Below the map: stacked tier cards in the engine's order, each with ONE primary action: T1/T2 «مسیریابی» (Neshan/Google) + secondary «پیگیری»; T3 «ببینم چه مغازه‌هایی آن‌جاست» (opens MallView/hub list from docs/06 F2 or a simple list of hub shops sorted by category) + «مسیر»; T4 «بپرس بازه؟» (follow-up message); T5 «یادآوری برای فردا» (just adds to the plan with a time).
- Interactive controls that re-run the engine client-side via the API, no LLM: time scrubber («الان · ۱ ساعت دیگر · فردا ۱۰:۰۰» or a slider over the next 24 h), radius chips, urgency toggle («فوری / امروز / هر وقت»), transport toggle (پیاده/ماشین). Changing any of them animates the pins/tiers.
- The agent's text is ≤ 2 sentences: the verdict and the trade-off, nothing the cards already say.

### 5. Minimal-design pass (TorobChat benchmark)
- Reduce the ContextBar to location · radius only by default; budget/conditions move into one «فیلترها» sheet. Hero: one input + at most 3 example chips; hide the scenario chip row after the first message.
- One primary button per card; secondary actions behind «…». Remove duplicated information between agent text and cards. Increase whitespace, reduce borders/shadows; keep the three-field block.
- Keep all existing behaviour; this is a visual/IA pass. Screenshot before/after for the README.

### 6. Scenarios & acceptance
Add to `pnpm scenario` and `scripts/missions.ts`, with `demo_time` and a chosen location (the default location is itself the hub, so use these):
  S1 «ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام» at هفت‌تیر (35.7150, 51.4255), demo_time 2026-10-25T23:30 → T1 empty (explicitly stated), T2 maybe empty at this hour (then say so), T3 = بورس موبایل جمهوری ~2 km with typical hours and a hub card, T4 unknown-hours shops if any within 2 km, T5 earliest opening tomorrow; map shows all; recommended tier chosen by urgency 'now'; text ≤ 2 sentences.
  S2 Same at demo_time 2026-10-25T18:40 → T1 has open shops with «تا ۱۹:۰۰ · عجله کن» flags; T2 includes shops closing later; verdict changes when the time scrubber is moved to 19:30.
  S3 «جمعه ظهر هدفون می‌خوام» at سهروردی → Friday-closure handling: most closed, hubs mostly closed («جمعه ۸۸٪ تعطیل»), T5 Saturday 10:00; no fabricated open shops.
  S4 «کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم» at فردوسی → walking-only, radius 600 m, «closes in» flags, nearest open first.
  S5 Regression: all previous scenario steps still pass (28/28 + mission steps).
Unit tests: hours 00:00–00:00 treated as unknown; hub derivation on synthetic data; decision tiers/ordering/urgency rules; travel-time estimates.
Screenshots: `24-decision-night.png`, `25-decision-evening.png`, `26-decision-time-scrubber.png` (phone + desktop). Update docs/DEMO.md: make S1 the **second demo beat** (right after the main scenario) and S2's time scrubber the «interactive decision» beat; update README and DECISIONS/PROGRESS.
```
