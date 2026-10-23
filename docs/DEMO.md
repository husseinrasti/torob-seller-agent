# Demo script (spec §13)

Goal: from «گوشی سامسونگ تا ۶۰ میلیون» to a confirmed, mall/floor/unit visit plan in **under 2 minutes of interaction** on a phone‑sized screen — then show that the chat is saved and remembered.

## Before recording

1. Open **`<app-url>/demo-reset?demo_time=2026-10-25T16:00&name=داور`** — signs in as «داور» with an empty history and memory, and fixes the clock to a weekday (Sunday) at 16:00 Tehran time, so «الان باز است» and follow‑up outcomes are reproducible. The header shows «دمو · یکشنبه ۱۶:۰۰». Without `&name=…` it signs out and shows the login screen.
2. Phone or a 390 px viewport (Chrome DevTools → iPhone 12/13/14). Location stays at the default «فردوسی (پیش‌فرض)» (35.6957, 51.4105). On a desktop window (≥ 1024 px) the same script works: history, chat and map are side by side, so the «نقشه» and history buttons are not needed.
3. With an LLM key the agent speaks freely; without one the header shows «حالت آفلاین» and the same flow runs with the rule‑based model (all numbers still come from tools).
4. `SIM_SALT=hamrah-40` gives the mixed outcomes below for the top‑3 sellers.

The whole flow is automated by `pnpm scenario <app-url>` (33 checks incl. the mission as step 9; `--desktop` for 1440×900, `--dark` for dark mode); the screenshots below come from it (desktop ones in `docs/screenshots/desktop/`).

## Script

| # | Tap / say | What appears | Point to make | Screenshot |
|---|---|---|---|---|
| 0 | Type a name in «اسمت چیه؟» → «ورود» | Hero «سلام داور!» with 4 scenario chips, «موقعیت من», «انتخاب روی نقشه» | Sign in with just a name; chats are saved per user | `01-login.png`, `02-home.png` |
| 1 | Tap **«گوشی سامسونگ تا ۶۰ میلیون نزدیک من»** | 4 product cards: A17 128/4 (from ۵۳٬۹۰۰٬۰۰۰ · ۲۶ فروشنده), A07 64/4, A07 128/6, A17 128/6 flagged «کمی بالاتر از بودجه», each with a «چرا» line | Budget parsed deterministically; reasons are templated from data, not invented | `03-products.png` |
| 1b | *(40 s)* Tap **«گفتگوی تازه»** (＋), then the 5th chip **«مأموریت چندمرحله‌ای»** — the real request that the plain agent used to drop | One mission with live steps: «سعادت‌آباد پیدا شد» → «۴ گوشی در بازه ۴۵–۵۵ میلیون» → «در ۱ کیلومتر: ۰ · در ۲ کیلومتر: ۰ · در ۳ کیلومتر: ۱ …» → «پیام به ۱ فروشنده…» → one report: «این‌طور فهمیدم» chips (× removes one and re-runs), the coverage note (no listed seller in سعادت‌آباد itself; the nearest is 2.1 km away, near «آسمان»), the seller row with price, freshness, open/closed and the seller's reply, a verdict, and a recommendation or «پیشنهادی ندارم چون…», plus «مرکز شهر را هم ببین». Then «گفتگوهای قبلی» → back to the first chat for step 2 | One message → carried out to the end; dataset limits said plainly, nothing invented | `22-mission-progress.png`, `23-mission-result.png` |
| 2 | Tap **«مقایسه»** on the first two → **«مقایسه کن»** → **«انتخاب»** under A17 128/4 | Compare table (differing specs + price/seller rows), then the seller list | Step 1 → step 2 without typing | `04-compare.png` |
| 3 | — | «۲۴ فروشنده در شعاع ۱ کیلومتر», cluster chips (چارسو ۶، علاءالدین ۶، بازار موبایل ایران ۴، بزرگمهر ۲، خانه موبایل ۲); cards with mall · floor · unit | Mall navigation parsed from free‑text addresses | `05-sellers.png`, `06-seller-cards.png` |
| 3b | Tap **«نقشه»** (desktop: the map column) | Radius circle, **every shop of the area** with an icon for its type (teal: lists products · gray: no listings · amber bubble: only the activity category matches), shops of one building grouped into pills with a shop icon and their count, the seller list as numbered pins; type chips with counts above the map → tap **«موبایل و لوازم جانبی»** and back to «همه»; tap pin **«۱»** → shop sheet: type, address with mall/floor/unit, today's hours, the chosen product's offer with «پیگیری» / «به برنامه», score shares, other products. Tapping a pill zooms in; inside a mall it lists the shops | Any shop on the map can be found by type, opened and acted on | `07-map.png`, `07b-map-type-filter.png`, `08-map-shop-details.png` |
| 3c | Tap **«باز الان»**, then the radius chip → **«۵۰۰ متر»** | List shrinks to 18 in place — no chat round trip | ContextBar re-filters without the LLM | `09-sellers-open-500m.png` |
| 3d | Tap **«قسطی»** | 0 results + banner «حذف فیلتر قسطی (+۱۸)» → tap it | Relaxation hints; only 128 shops declare installments | `10-installment-relaxation.png` |
| 4 | Point at the first card, then type **«چرا این اول شد؟»** | Three separate fields: قیمت ثبت‌شده · آخرین تغییر قیمت (green/amber/red) · موجودی «تأیید نشده»; answer from `why` + `score_breakdown` | Transparency rules of the challenge | `11-why-first.png` |
| 5 | Tap **«پیگیری ۳ تای اول»** | Follow‑up board: within ~4 s ✅ تأیید شد · ⚠️ قیمت جدید ۵۷٬۹۳۰٬۰۰۰ · ❌ ناموجود; transcripts; disclaimer «شبیه‌سازی‌شده…». Then «خودکار: … جایگزین پیدا کن» → alternatives: same phone in the same mall first, similar products ±20% | Simulation is honest and deterministic; alternatives are automatic | `12-followups-contacting.png`, `13-followups-resolved.png`, `14-alternatives.png`, `15-alternatives-similar.png` |
| 6 | Tap **«قبول قیمت جدید»**, then **«برنامه مراجعه»** | Plan grouped by mall (پاساژ بزرگمهر → پاساژ چارسو), ETA, «باز در زمان رسیدن», Neshan/Google/OSM links; the out‑of‑stock shop is left out; tap **«چک‌لیست خرید»** → رجیستری، پلمب، سریال گارانتی، تست دوربین و باتری، فاکتور | From comparison to a concrete walk | `16-trip-plan.png`, `17-checklist.png` |
| 7 | Tap **«اشتراک‌گذاری»** and open the link | Read‑only `/plan/<id>` page | Shareable outcome | `18-shared-plan.png` |
| 8 | Tap **«گفتگوی تازه»** (＋) | «سلام داور!» + «از جایی که مانده بودیم»: the last search as a chip and «ادامه «گوشی سامسونگ تا ۶۰ میلیون…»» | Memory across chats (location, radius, searches, products) | `19-memory-new-chat.png` |
| 8b | Open **«گفتگوهای قبلی»** (☰ on a phone, sidebar on desktop) and tap the previous chat (or «ادامه») | The whole chat comes back — seller list, follow‑up board with its outcomes, visit plan — and can be continued; the URL carries `?c=<chat id>` | History and resume | `20-history.png`, `21-resumed-chat.png` |

## Talking points (30 s wrap‑up)

- **Product/UX:** four steps, chat + controls, mall → floor → unit, open‑at‑arrival, Persian everywhere; phone and desktop layouts; every shop on the map by type, filterable and selectable.
- **Transparency:** listed price ≠ price age ≠ confirmed stock; unknown stays unknown; category‑only shops are separate.
- **Intelligence:** tool‑calling agent with explainable ranking, proactive follow‑ups and alternatives, memory across chats; compound requests run as one mission (place, budget band, widening, follow‑ups awaited, verdicts); graceful offline fallback.
- **Engineering/deploy:** one `docker compose up -d`, auto‑seed in ~30 s, healthz, CI, golden + scenario tests.
- **Honesty:** seller contact is simulated because the dataset's phone numbers are fake; a real channel plugs into the same `followups` table. Sign‑in is name‑only (no password) — fine for a demo, not for real accounts.
