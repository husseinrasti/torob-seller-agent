# Demo script (spec §13)

Goal: from «گوشی سامسونگ تا ۶۰ میلیون» to a confirmed, mall/floor/unit visit plan in **under 2 minutes of interaction** on a phone‑sized screen.

## Before recording

1. Open **`<app-url>/demo-reset?demo_time=2026-10-25T16:00`** — clears the session and fixes the clock to a weekday (Sunday) at 16:00 Tehran time, so «الان باز است» and follow‑up outcomes are reproducible. The header shows «دمو · یکشنبه ۱۶:۰۰».
2. Phone or a 390 px viewport (Chrome DevTools → iPhone 12/13/14). Location stays at the default «فردوسی (پیش‌فرض)» (35.6957, 51.4105).
3. With an LLM key the agent speaks freely; without one the header shows «حالت آفلاین» and the same flow runs with the rule‑based model (all numbers still come from tools).
4. `SIM_SALT=hamrah-40` gives the mixed outcomes below for the top‑3 sellers.

The whole flow is automated by `pnpm scenario <app-url>` (20 checks); the screenshots below come from it.

## Script

| # | Tap / say | What appears | Point to make | Screenshot |
|---|---|---|---|---|
| 0 | — | Hero with 4 scenario chips, «موقعیت من», «انتخاب روی نقشه» | Zero‑onboarding; location is explicit | `01-home.png` |
| 1 | Tap **«گوشی سامسونگ تا ۶۰ میلیون نزدیک من»** | 4 product cards: A17 128/4 (from ۵۳٬۹۰۰٬۰۰۰ · ۲۶ فروشنده), A07 64/4, A07 128/6, A17 128/6 flagged «کمی بالاتر از بودجه», each with a «چرا» line | Budget parsed deterministically; reasons are templated from data, not invented | `02-products.png` |
| 2 | Tap **«مقایسه»** on the first two → **«مقایسه کن»** → **«انتخاب»** under A17 128/4 | Compare table (differing specs + price/seller rows), then the seller list | Step 1 → step 2 without typing | `03-compare.png` |
| 3 | — | «۲۴ فروشنده در شعاع ۱ کیلومتر», cluster chips (چارسو ۶، علاءالدین ۶، بازار موبایل ایران ۴، بزرگمهر ۲، خانه موبایل ۲); cards with mall · floor · unit | Mall navigation parsed from free‑text addresses | `04-sellers.png`, `05-seller-cards.png` |
| 3b | Tap **«نقشه»** | MapLibre map: radius circle, numbered sellers; tap a pin → its card | Map is lazy; list works without it | `06-map.png` |
| 3c | Tap **«باز الان»**, then the radius chip → **«۵۰۰ متر»** | List shrinks to 18 in place — no chat round trip | ContextBar re-filters without the LLM | `07-sellers-open-500m.png` |
| 3d | Tap **«قسطی»** | 0 results + banner «حذف فیلتر قسطی (+۱۸)» → tap it | Relaxation hints; only 128 shops declare installments | `08-installment-relaxation.png` |
| 4 | Point at the first card, then type **«چرا این اول شد؟»** | Three separate fields: قیمت ثبت‌شده · آخرین تغییر قیمت (green/amber/red) · موجودی «تأیید نشده»; answer from `why` + `score_breakdown` | Transparency rules of the challenge | `09-why-first.png` |
| 5 | Tap **«پیگیری ۳ تای اول»** | Follow‑up board: within ~4 s ✅ تأیید شد · ⚠️ قیمت جدید ۵۷٬۹۳۰٬۰۰۰ · ❌ ناموجود; transcripts; disclaimer «شبیه‌سازی‌شده…». Then «خودکار: … جایگزین پیدا کن» → alternatives: same phone in the same mall first, similar products ±20% | Simulation is honest and deterministic; alternatives are automatic | `10-…`, `11-followups-resolved.png`, `12-alternatives.png`, `13-alternatives-similar.png` |
| 6 | Tap **«قبول قیمت جدید»**, then **«برنامه مراجعه»** | Plan grouped by mall (پاساژ بزرگمهر → پاساژ چارسو), ETA, «باز در زمان رسیدن», Neshan/Google/OSM links; tap **«چک‌لیست خرید»** → رجیستری، پلمب، سریال گارانتی، تست دوربین و باتری، فاکتور | From comparison to a concrete walk | `14-trip-plan.png`, `15-checklist.png` |
| 7 | Tap **«اشتراک‌گذاری»** and open the link | Read‑only `/plan/<id>` page | Shareable outcome | `16-shared-plan.png` |

## Talking points (30 s wrap‑up)

- **Product/UX:** four steps, chat + controls, mall → floor → unit, open‑at‑arrival, Persian everywhere, works on a phone.
- **Transparency:** listed price ≠ price age ≠ confirmed stock; unknown stays unknown; category‑only shops are separate.
- **Intelligence:** tool‑calling agent with explainable ranking, proactive follow‑ups and alternatives; graceful offline fallback.
- **Engineering/deploy:** one `docker compose up -d`, auto‑seed in ~30 s, healthz, CI, golden + scenario tests.
- **Honesty:** seller contact is simulated because the dataset's phone numbers are fake; a real channel plugs into the same `followups` table.
