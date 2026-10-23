// Drives the demo scenario (spec §13) on a 390px phone (or a 1440px desktop) and saves a screenshot per step.
// Usage: pnpm scenario [baseUrl] [--out=docs/screenshots] [--upto=9] [--desktop] [--dark]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || process.env.APP_URL || 'http://localhost:3010';
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'docs/screenshots/tmp';
const upto = Number(process.argv.find((a) => a.startsWith('--upto='))?.slice(7) || 9);
const dark = process.argv.includes('--dark');
const desktop = process.argv.includes('--desktop');
const USER = 'داور';
const DEMO_TIME = '2026-10-25T16:00';

type Check = { step: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (step: string, ok: boolean, detail?: string) => {
  checks.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
};

let shot = 0;
async function snap(page: Page, name: string, locator?: string, which: 'first' | 'last' = 'last') {
  shot++;
  const file = `${out}/${String(shot).padStart(2, '0')}-${name}.png`;
  if (locator) {
    const el = which === 'first' ? page.locator(locator).first() : page.locator(locator).last();
    await el.evaluate((n) => n.scrollIntoView({ block: 'start', inline: 'nearest' })).catch(() => {});
  }
  await page.waitForTimeout(350);
  await page.screenshot({ path: file });
  console.log(`      📸 ${file}`);
}

/** Extra screenshot that does not shift the numbering of the others (e.g. 07b-map-type-filter.png). */
async function snapExtra(page: Page, name: string) {
  const file = `${out}/${String(shot).padStart(2, '0')}b-${name}.png`;
  await page.waitForTimeout(350);
  await page.screenshot({ path: file });
  console.log(`      📸 ${file}`);
}

/** Screenshot with a fixed name (same file name on phone and desktop runs). */
async function snapAs(page: Page, name: string, locator?: string) {
  const file = `${out}/${name}.png`;
  if (locator) await page.locator(locator).last().evaluate((n) => n.scrollIntoView({ block: 'start', inline: 'nearest' })).catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({ path: file });
  console.log(`      📸 ${file}`);
}

async function waitIdle(page: Page) {
  // the composer shows the stop button while a reply streams
  await page.waitForFunction(() => !document.querySelector('button[aria-label="توقف"]'), null, { timeout: 60_000 });
  await page.waitForTimeout(300);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const started = Date.now();
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const ctx = await browser.newContext(
    desktop
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'fa-IR' }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fa-IR', hasTouch: true, isMobile: true },
  );
  if (dark) await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'));
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  // product photos come from image.torob.com, which is not reachable from every network — not an app error
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('image.torob.com') && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  const chatCalls: string[] = [];
  page.on('request', (r) => new URL(r.url()).pathname === '/api/chat' && r.method() === 'POST' && chatCalls.push(r.url()));

  // signed out → name-only login screen
  await page.goto(`${base}/demo-reset?demo_time=${DEMO_TIME}`, { waitUntil: 'networkidle' });
  check('0. login screen (name only)', await page.getByLabel('اسمت چیه؟').isVisible());
  await snap(page, 'login');
  // demo user with a clean history and memory
  await page.goto(`${base}/demo-reset?demo_time=${DEMO_TIME}&name=${encodeURIComponent(USER)}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'گوشی سامسونگ تا ۶۰ میلیون نزدیک من' }).waitFor({ timeout: 30_000 });
  await snap(page, 'home');

  // 1) chip → product cards
  await page.getByRole('button', { name: 'گوشی سامسونگ تا ۶۰ میلیون نزدیک من' }).click();
  await page.getByRole('button', { name: 'فروشنده‌های نزدیک' }).first().waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const cards = await page.getByRole('button', { name: 'فروشنده‌های نزدیک' }).count();
  check('1. product cards with why lines', cards >= 3, `${cards} cards`);
  await snap(page, 'products', 'article', 'first');

  // 2) compare two → table → pick A17 128/4
  const compareBtns = page.getByRole('button', { name: 'مقایسه', exact: true });
  await compareBtns.nth(0).click();
  await compareBtns.nth(1).click();
  await page.getByRole('button', { name: 'مقایسه کن' }).click();
  await page.locator('table').waitFor({ timeout: 60_000 });
  await waitIdle(page);
  check('2. compare table', (await page.locator('table tbody tr').count()) >= 4);
  await snap(page, 'compare', 'table');
  if (upto < 3) return finish();

  await page.getByRole('button', { name: 'انتخاب', exact: true }).first().click();
  await page.locator('section[aria-busy] h3').last().waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const header = await page.locator('section[aria-busy] h3').last().innerText();
  check('3. sellers list', /۲۴ فروشنده/.test(header), header);
  await snap(page, 'sellers', 'section[aria-busy]');
  await snap(page, 'seller-cards', 'article[id^="shop-"]', 'first');

  // F10) trust signals: «کامل بودن اطلاعات» on every card, the website button, both payment wordings
  await page.getByRole('button', { name: /نمایش همه/ }).last().click().catch(() => {});
  await page.waitForTimeout(300);
  const trustRows = await page.locator('[data-trust-row]').count();
  const webCard = page.locator('article[id^="shop-"]', { hasText: 'گوشی مارکت' }).first();
  const webLink = await webCard.getByRole('link', { name: 'وب‌سایت' }).getAttribute('href').catch(() => null);
  const declared = await page.locator('article[id^="shop-"]', { hasText: 'آروان دیسین' }).first().innerText().catch(() => '');
  check(
    'F10. trust signals on seller cards (completeness, website, payment channel)',
    trustRows >= 10 && Boolean(webLink?.startsWith('http')) && /پرداخت اعتباری اعلام‌شده \(کانال نامشخص\)/.test(declared),
    `${trustRows} cards · ${webLink}`,
  );
  await webCard.getByRole('button', { name: /کامل بودن اطلاعات/ }).click();
  await snapAs(page, '24-trust-signals', 'article[id^="shop-"]:has-text("گوشی مارکت")');

  // F11) «کی برم؟» from the seller list: per-hour heatmap, best window, Friday closures
  await page.getByRole('button', { name: 'کی برم؟' }).last().click();
  const visit = page.locator('[data-visit-time]').last();
  await visit.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const visitText = await visit.innerText();
  check('F11. best time to visit (window, Friday, unknown hours)', /یکشنبه بین [۰-۹]+ تا [۰-۹]+، [۰-۹]+٪/.test(visitText) && /جمعه [۰-۹]+٪ تعطیل/.test(visitText), visitText.split('\n').slice(-1)[0]);
  await snapAs(page, '25-visit-time', '[data-visit-time]');

  // 3a) map with every shop of the area + numbered sellers; tapping a seller opens its details
  if (!desktop) await page.getByRole('button', { name: 'نقشه' }).click();
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  const markers = await page.locator('.maplibregl-marker').count();
  const typeBar = page.getByRole('toolbar', { name: 'نوع فروشگاه' });
  const chips = (await typeBar.getByRole('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(
    '3. map shows sellers and all shops of the area, by shop type',
    markers >= 10 && chips.length >= 6 && /^همه [۰-۹]+$/.test(chips[0]),
    `${markers} pins · ${chips.slice(0, 4).join(' / ')}`,
  );
  await snap(page, 'map');
  const mobileChip = typeBar.getByRole('button', { name: /موبایل و لوازم جانبی/ });
  await mobileChip.click();
  await page.waitForTimeout(1200);
  check('3. a shop-type chip filters the map', (await mobileChip.getAttribute('aria-pressed')) === 'true');
  await snapExtra(page, 'map-type-filter');
  await mobileChip.click();
  await page.locator('button.maplibregl-marker', { hasText: /^۱$/ }).first().click();
  await page.getByText('کالای انتخابی شما را ثبت کرده است').waitFor({ timeout: 20_000 });
  const sheetHead = await page.getByRole('dialog').innerText();
  check('3. selecting a shop on the map opens its details with its type', /موبایل و لوازم جانبی/.test(sheetHead));
  await snap(page, 'map-shop-details');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (!desktop) await page.getByRole('button', { name: 'نقشه' }).click();

  // 3b) ContextBar changes re-filter without the LLM
  const before = chatCalls.length;
  await page.locator('[data-chip="open_now"]').click();
  await page.locator('[data-chip="radius"]').click();
  await page.getByRole('button', { name: '۵۰۰ متر' }).click();
  await page.waitForFunction(() => /در شعاع ۵۰۰ متر/.test(document.body.innerText), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const h2 = await page.locator('section[aria-busy] h3').last().innerText();
  check('3. open-now + 500 m shrink the list without /api/chat', chatCalls.length === before, `${h2}; chat calls during change: ${chatCalls.length - before}`);
  await snap(page, 'sellers-open-500m', 'section[aria-busy]');

  await page.locator('[data-chip="installment"]').click();
  await page.getByRole('button', { name: /حذف فیلتر قسطی/ }).waitFor({ timeout: 30_000 });
  const h3 = await page.locator('section[aria-busy] h3').last().innerText();
  check('3. installment → ≤2 + relaxation banner', /^[۰-۲] /.test(h3.trim()) || /[۰۱۲] فروشنده/.test(h3), h3);
  await snap(page, 'installment-relaxation', 'section[aria-busy]');
  await page.getByRole('button', { name: /حذف فیلتر قسطی/ }).click();
  await page.waitForTimeout(800);
  check('3. relaxation removed the filter without /api/chat', chatCalls.length === before);
  if (upto < 4) return finish();

  // 4) three-field cards + «چرا این اول شد؟»
  const firstCard = page.locator('article[id^="shop-"]').first();
  const cardText = await firstCard.innerText();
  check('4. three separate fields on cards', /قیمت ثبت‌شده/.test(cardText) && /آخرین تغییر قیمت/.test(cardText) && /موجودی/.test(cardText));
  await page.locator('textarea').fill('چرا این اول شد؟');
  await page.locator('textarea').press('Enter');
  await page.waitForTimeout(500);
  await waitIdle(page);
  const lastText = await page.locator('[data-role="assistant"]').last().innerText();
  check('4. «چرا این اول شد؟» explained from why/score_breakdown', /اول|امتیاز|قیمت|فاصله/.test(lastText), lastText.slice(0, 120));
  await snap(page, 'why-first', '[data-role="assistant"]');
  if (upto < 5) return finish();

  // 5) follow up the top 3 → live board with mixed outcomes → automatic alternatives
  const t5 = Date.now();
  await page.getByRole('button', { name: /پیگیری ۳ تای اول/ }).first().click();
  await page.getByText('تابلو پیگیری').last().waitFor({ timeout: 30_000 });
  await snap(page, 'followups-contacting', 'section:has-text("تابلو پیگیری")');
  await page.waitForFunction(() => /تأیید · /.test(Array.from(document.querySelectorAll('section')).filter((s) => s.textContent?.includes('تابلو پیگیری')).pop()?.textContent ?? ''), null, { timeout: 15_000 });
  const resolvedIn = (Date.now() - t5) / 1000;
  const boardText = await page.locator('section', { hasText: 'تابلو پیگیری' }).last().innerText();
  check('5. three follow-ups resolve within 5 s of the board appearing', resolvedIn <= 8, `${resolvedIn.toFixed(1)} s incl. request`);
  check('5. mixed outcomes (confirmed + out of stock)', /[۱-۳] تأیید/.test(boardText) && /[۱-۳] ناموجود/.test(boardText), boardText.split('\n')[1]);
  check('5. simulation disclaimer visible', /شبیه‌سازی‌شده/.test(boardText));
  await snap(page, 'followups-resolved', 'section:has-text("تابلو پیگیری")');
  await page.getByText('خودکار:').last().waitFor({ timeout: 20_000 });
  await page.getByText('جایگزین‌ها').last().waitFor({ timeout: 30_000 });
  await waitIdle(page);
  const altText = await page.locator('section', { hasText: 'جایگزین‌ها' }).last().innerText();
  check('5. out_of_stock → alternatives automatically', /همین کالا/.test(altText), altText.split('\n').slice(0, 4).join(' / '));
  await snap(page, 'alternatives', 'section:has-text("جایگزین‌ها")');
  await page.getByRole('tab', { name: /کالای مشابه/ }).last().click();
  await snap(page, 'alternatives-similar', 'section:has-text("جایگزین‌ها")');
  if (upto < 6) return finish();

  // 6) accept the changed price, build the visit plan, open the checklist
  const accept = page.getByRole('button', { name: 'قبول قیمت جدید' });
  if (await accept.count()) await accept.first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'برنامه مراجعه', exact: true }).first().click();
  await page.locator('section[data-plan-id]').last().waitFor({ timeout: 30_000 });
  await waitIdle(page);
  const planText = await page.locator('section[data-plan-id]').last().innerText();
  check('6. trip plan with malls, ETA and open-at-arrival', /برنامه مراجعه/.test(planText) && /پاساژ/.test(planText) && /(باز|بسته) در زمان رسیدن/.test(planText), planText.split('\n').slice(0, 3).join(' / '));
  check('6. navigation links (Neshan / Google / OSM)', (await page.locator('section[data-plan-id] a[href*="neshan.org"]').count()) > 0);
  const oosShop = altText.match(/«(.+?)» ناموجود/)?.[1];
  check('6. plan skips the out-of-stock shop', Boolean(oosShop) && !planText.includes(oosShop!), oosShop);
  check('6. plan shows resolved follow-up statuses', !/در حال پیگیری/.test(planText));
  check('F11. plan header: best time for this route', /بهترین زمان برای این مسیر/.test(planText));
  await snap(page, 'trip-plan', 'section[data-plan-id]');
  await page.locator('section[data-plan-id]').last().getByRole('button', { name: 'چک‌لیست خرید' }).click();
  await page.getByText('چک‌لیست خرید حضوری').last().waitFor({ timeout: 30_000 });
  await waitIdle(page);
  const listText = await page.locator('section', { hasText: 'چک‌لیست خرید حضوری' }).last().innerText();
  check('6. purchase checklist for a phone', /رجیستری/.test(listText) && /پلمب/.test(listText) && /فاکتور/.test(listText));
  await snap(page, 'checklist', 'section:has-text("چک‌لیست خرید حضوری")');
  if (upto < 7) return finish();

  // 7) shared plan link opens the read-only page (8 follows)
  const planId = await page.locator('section[data-plan-id]').last().getAttribute('data-plan-id');
  const shared = await ctx.newPage();
  const res = await shared.goto(`${base}/plan/${planId}`, { waitUntil: 'networkidle' });
  const sharedText = await shared.locator('main').innerText();
  check('7. /plan/[id] opens read-only', res?.status() === 200 && /برنامه مراجعه/.test(sharedText) && /فقط خواندنی/.test(sharedText));
  await shared.screenshot({ path: `${out}/${String(++shot).padStart(2, '0')}-shared-plan.png` });
  console.log(`      📸 ${out}/${String(shot).padStart(2, '0')}-shared-plan.png`);
  await shared.close();
  if (upto < 8) return finish();

  // 8) memory + history: a new chat greets by name, remembers the search and resumes the previous chat
  await page.getByRole('button', { name: 'گفتگوی تازه' }).filter({ visible: true }).first().click();
  await page.getByText('از جایی که مانده بودیم').waitFor({ timeout: 20_000 });
  const heroText = await page.locator('[data-scroller]').innerText();
  check('8. new chat greets by name and remembers the last search', heroText.includes(`سلام ${USER}`) && heroText.includes('گوشی سامسونگ تا ۶۰ میلیون'));
  await snap(page, 'memory-new-chat');
  if (!desktop) {
    await page.getByRole('button', { name: 'گفتگوهای قبلی' }).click();
    await page.getByRole('navigation', { name: 'گفتگوهای قبلی' }).waitFor({ timeout: 10_000 });
    await snap(page, 'history');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /^ادامه «/ }).first().click();
  await page.locator('section[data-plan-id]').last().waitFor({ timeout: 30_000 });
  const resumed = await page.locator('[data-scroller]').innerText();
  check('8. previous chat resumes with its cards (plan, follow-ups, sellers)', /تابلو پیگیری/.test(resumed) && /برنامه مراجعه/.test(resumed) && /فروشنده در شعاع/.test(resumed));
  check('8. URL carries the chat id', /[?&]c=[0-9a-f-]{36}/.test(page.url()), page.url());
  await snap(page, 'resumed-chat', 'section[data-plan-id]');
  if (upto < 9) return finish();

  // 9) a compound request is one mission: locate → products in the band → widen the radius → follow up → one report
  await page.getByRole('button', { name: 'گفتگوی تازه' }).filter({ visible: true }).first().click();
  const missionChip = page.locator('[data-mission-chip]');
  await missionChip.waitFor({ timeout: 20_000 });
  const chatBefore = chatCalls.length;
  await missionChip.click();
  const progress = page.locator('[data-mission-progress]').last();
  await progress.waitFor({ timeout: 30_000 });
  await progress.getByText(/پیام به|تماس با/).waitFor({ timeout: 30_000 }).catch(() => {});
  await snapAs(page, '22-mission-progress', '[data-mission-progress]');
  const result = page.locator('[data-mission-result]').last();
  await result.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const report = await result.innerText();
  const coverage = await result.locator('[data-coverage]').innerText().catch(() => '');
  const rows = await result.locator('[data-mission-row]').filter({ visible: true }).count();
  check(
    '9. compound request runs as one mission (one chat call, all steps)',
    chatCalls.length - chatBefore === 1 && (await page.locator('[data-mission-progress][data-done="true"]').count()) >= 1,
    `chat calls: ${chatCalls.length - chatBefore}`,
  );
  check('9. understood: Samsung phone, band ۴۵–۵۵ million, سعادت‌آباد', /گوشی سامسونگ/.test(report) && /۴۵–۵۵/.test(report) && /سعادت‌آباد/.test(report));
  check('9. coverage note: no listed sellers in the area itself, radius widened', /ثبت نشده/.test(coverage) && /ترب/.test(coverage), coverage.slice(0, 120));
  check('9. sellers followed up and awaited, open/closed reported', rows >= 1 && /تأیید شد|ناموجود|قیمت جدید|پاسخ نداد/.test(report) && /باز است|بسته|ساعت کاری/.test(report), `${rows} rows`);
  check('9. recommendation or an explicit «پیشنهادی ندارم چون…»', /پیشنهاد:|پیشنهادی ندارم چون|هنوز پیشنهاد قطعی/.test(report));
  await snapAs(page, '23-mission-result', '[data-mission-result]');

  return finish();

  async function finish() {
    // Persian digits audit: ASCII digits not glued to Latin letters (model codes like A17/4G are fine)
    const asciiNumbers = await page.evaluate(() => Array.from(document.body.innerText.matchAll(/(?<![A-Za-z0-9_.\-/])[0-9]+(?![A-Za-z0-9_\-/])/g)).slice(0, 12).map((m) => document.body.innerText.slice(Math.max(0, (m.index ?? 0) - 25), (m.index ?? 0) + 8).replace(/\n/g, ' ')));
    check('Persian digits in UI text', asciiNumbers.length === 0, asciiNumbers.join(' | '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check('no horizontal scroll', !overflow);
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    await browser.close();
    process.exit(checks.every((c) => c.ok) ? 0 : 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
