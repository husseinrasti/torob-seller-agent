// Drives the demo scenario (spec §13) on a 390px phone (or a 1440px desktop) and saves a screenshot per step.
// Usage: pnpm scenario [baseUrl] [--out=docs/screenshots] [--upto=9] [--desktop] [--dark]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || process.env.APP_URL || 'http://localhost:3010';
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'docs/screenshots/tmp';
const upto = Number(process.argv.find((a) => a.startsWith('--upto='))?.slice(7) || 10);
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
  check('0. minimal hero: ≤ 3 example chips (+ «نمونه‌های بیشتر» with in-mall/basket), camera hint', (await page.locator('[data-hero-chip]').count()) <= 3 && (await page.locator('[data-hero-new]').count()) === 2 && (await page.locator('[data-camera-hint]').isVisible()) && (await page.locator('[data-photo-input]').count()) === 1);
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
  // minimal ContextBar: «فیلترها» holds open-now / installment / budget
  await page.locator('[data-chip="filters"]').click();
  await page.locator('#f-open_now').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('[data-chip="radius"]').click();
  await page.getByRole('button', { name: '۵۰۰ متر' }).click();
  await page.waitForFunction(() => /در شعاع ۵۰۰ متر/.test(document.body.innerText), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const h2 = await page.locator('section[aria-busy] h3').last().innerText();
  check('3. open-now + 500 m shrink the list without /api/chat', chatCalls.length === before, `${h2}; chat calls during change: ${chatCalls.length - before}`);
  await snap(page, 'sellers-open-500m', 'section[aria-busy]');

  await page.locator('[data-chip="filters"]').click();
  await page.locator('#f-installment').click();
  await page.keyboard.press('Escape');
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
  check('4. «چرا این اول شد؟» explained from why/score_breakdown', /[۰-۹]+٪/.test(lastText) && /قیمت|فاصله/.test(lastText), lastText.slice(0, 120));
  await snap(page, 'why-first', '[data-role="assistant"]');

  // F8) a spec question about the chosen product: answered from its registered specs, evidence → spec table
  await page.locator('textarea').fill('این گوشی NFC داره؟');
  await page.locator('textarea').press('Enter');
  const specCard = page.locator('[data-spec-answer]').last();
  await specCard.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const specText = await specCard.innerText();
  await snapAs(page, '26-spec-answer', '[data-spec-answer]');
  await specCard.getByRole('button', { name: /NFC/ }).first().click();
  const focusRow = page.locator('[data-spec-table] tr[data-focus="true"]');
  await focusRow.waitFor({ timeout: 15_000 });
  check('F8. spec answer grounded in registered specs (evidence → spec table)', /بله، NFC دارد/.test(specText) && /NFC/.test(await focusRow.innerText()), specText.split('\n')[1]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // F11) «کی برم؟» from the seller list: per-hour heatmap, best window, Friday closures
  await page.getByRole('button', { name: 'کی برم؟' }).last().click();
  const visit = page.locator('[data-visit-time]').last();
  await visit.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const visitText = await visit.innerText();
  check('F11. best time to visit (window, Friday, unknown hours)', /یکشنبه بین [۰-۹]+ تا [۰-۹]+، [۰-۹]+٪/.test(visitText) && /جمعه [۰-۹]+٪ تعطیل/.test(visitText), visitText.split('\n').slice(-1)[0]);
  await snapAs(page, '25-visit-time', '[data-visit-time]');

  // F4) «خودم پیام بدهم»: a ready-to-send message (title, listed price, its age, mall/floor/unit) + WhatsApp/SMS links
  const card1 = page.locator('article[id^="shop-"]').first();
  await card1.getByRole('button', { name: 'پیگیری' }).click();
  await card1.getByRole('button', { name: 'خودم پیام بدهم' }).click();
  const msgBox = page.locator('[data-seller-message] textarea');
  await msgBox.waitFor({ timeout: 20_000 });
  const msg = await msgBox.inputValue();
  const wa = await page.locator('[data-seller-message] a[data-channel="whatsapp"]').getAttribute('href').catch(() => null);
  check(
    'F4. ready-to-send seller message (title, price, price age, mall/floor/unit; WhatsApp link with the text)',
    /A17/.test(msg) && /[۰-۹٬]+ تومان/.test(msg) && /آخرین تغییر قیمت/.test(msg) && /پاساژ/.test(msg) && Boolean(wa?.startsWith('https://wa.me/98') && wa.includes(encodeURIComponent('سلام'))),
    msg.split('\n')[1]?.slice(0, 90),
  );
  await snapAs(page, '27-seller-message');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // F5) «کارت چانه‌زنی» on a pricier seller: market range, ≤ 4 talking points, a target price
  const marketCard = page.locator('article[id^="shop-"]', { hasText: 'گوشی مارکت' }).first();
  await marketCard.locator('[data-more]').click();
  await marketCard.getByRole('button', { name: 'کارت چانه‌زنی' }).click();
  const bargain = page.locator('[data-bargain]').last();
  await bargain.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const bargainText = await bargain.innerText();
  const points = await bargain.locator('li').count();
  check('F5. bargaining card (position, ≤ 4 points, target price or «منصفانه»)', /میانه بازار/.test(bargainText) && points >= 1 && points <= 4 && /قیمت هدف|منصفانه/.test(bargainText), `${points} points`);
  await snapAs(page, '28-bargain-card', '[data-bargain]');
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

  // F2) in-mall mode: the seller list's mall chip → «نمای داخل پاساژ» → floors, sellers first, neighbours badged
  const mallChip = page.locator('button', { hasText: /در پاساژ علاءالدین/ }).last();
  await mallChip.scrollIntoViewIfNeeded();
  await mallChip.click();
  await page.locator('[data-open-mall-view]').last().click();
  const mallView = page.locator('[data-mall-view]').last();
  await mallView.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const floorTabs = await mallView.locator('[data-floor-tab]').count();
  const kinds = await mallView.locator('[data-mall-shop]').evaluateAll((els) => els.map((e) => e.getAttribute('data-mall-shop')));
  const order = kinds.map((k) => (k === 'seller' ? 0 : k === 'neighbour' ? 1 : 2));
  check('F2. mall view: ≥ 3 floor tabs, sellers first, «همسایه جایگزین» badged', floorTabs >= 3 && order[0] === 0 && order.every((x, i) => i === 0 || order[i - 1] <= x) && (await mallView.locator('[data-neighbour]').count()) > 0, `${floorTabs} floors · ${kinds.filter((k) => k === 'seller').length} sellers on this floor`);
  check('F2. three-field prices, floor follow-up, hours line, nearby malls', (await mallView.locator('[data-floor-followup]').count()) === 1 && /آخرین تغییر قیمت/.test(await mallView.innerText()) && (await mallView.locator('[data-mall-hours]').innerText()).length > 10 && (await mallView.locator('[data-nearby-mall]').count()) > 0);
  await snapAs(page, '29-mall-view', '[data-mall-view]');

  // F3) «… همه یکجا نزدیک فردوسی»: basket lines → one seller per item, ≥ 2 in one mall → the visit plan → «پیگیری همه»
  await page.locator('textarea').fill('گوشی A17، کاور A17، گلس، پاوربانک ۲۰ هزار، همه یکجا نزدیک فردوسی');
  await page.locator('textarea').press('Enter');
  const basket = page.locator('[data-basket-plan]').last();
  await basket.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const inOneMall = Number(await basket.getAttribute('data-in-one-mall'));
  check('F3. basket: ≥ 2 items in one mall, grouped plan, BasketBar', inOneMall >= 2 && (await basket.locator('[data-basket-stop]').count()) >= 1 && (await basket.locator('section[data-plan-id]').count()) === 1 && (await page.locator('[data-basket-bar]').isVisible()), `${inOneMall} in one mall · ${(await basket.locator('header').first().innerText()).replace(/\n/g, ' / ')}`);
  await snapAs(page, '30-basket-plan', '[data-basket-plan]');
  await basket.locator('[data-basket-verify]').click();
  const verifiedPlan = page.locator('[data-basket-plan]').last();
  await page.waitForFunction(() => document.querySelectorAll('[data-basket-plan]').length >= 2, null, { timeout: 60_000 });
  await waitIdle(page);
  const vText = await verifiedPlan.innerText();
  check('F3. «پیگیری همه» awaited: every item has an answer, simulation disclaimer', !/در حال پیگیری|تأیید نشده/.test(vText.split('برنامه مراجعه')[0]) && /شبیه‌سازی‌شده/.test(vText));
  await snapAs(page, '31-basket-verified', '[data-basket-plan]');
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

  // F1) photo search: a shelf price tag → «سامسونگ Galaxy A17», the tag price against the market and nearby
  // sellers; an unrelated photo → «نتونستم تشخیص بدم، اسمش رو بنویس» (fixtures: tests/fixtures/vision)
  await page.locator('[data-photo-input]').setInputFiles('tests/fixtures/vision/shelf-tag.jpg');
  const photo = page.locator('[data-photo-match]').last();
  await photo.waitFor({ timeout: 60_000 });
  await waitIdle(page);
  const photoText = await photo.innerText();
  check('F1. shelf-tag photo → A17 top candidate, tag price vs market and nearby sellers, privacy line', (await photo.getAttribute('data-photo-match')) === 'recognized' && /A17/.test(photoText) && /۶۴٬?۵۰۰٬?۰۰۰|۶۴,۵۰۰,۰۰۰/.test(photoText) && /میانه بازار/.test(photoText) && /ذخیره نمی‌شود/.test(photoText) && (await page.locator('[data-photo-thumb]').count()) >= 1, photoText.split('\n').slice(0, 3).join(' / '));
  await snapAs(page, '32-photo-match', '[data-photo-match]');
  await page.locator('[data-photo-input]').setInputFiles('tests/fixtures/vision/unrelated.jpg');
  await page.waitForFunction(() => document.querySelectorAll('[data-photo-match]').length >= 2, null, { timeout: 60_000 });
  await waitIdle(page);
  check('F1. unrelated photo → «نتونستم تشخیص بدم، اسمش رو بنویس»', /نتونستم تشخیص بدم، اسمش رو بنویس/.test(await page.locator('[data-photo-match]').last().innerText()));
  // the vision provider can be out of credit: record it and keep going (the decision steps need no LLM)
  if (await page.locator('[data-photo-match="recognized"]').count()) {
    await page.locator('[data-photo-match="recognized"]').last().locator('[data-photo-yes]').click();
    await page.locator('[data-role="assistant"]').last().getByText(/فروشنده در شعاع/).waitFor({ timeout: 60_000 });
    await waitIdle(page);
    check('F1. «همین است» → sellers of the matched product', /A17/.test(await page.locator('section', { hasText: 'فروشنده در شعاع' }).last().innerText()));
  } else check('F1. «همین است» → sellers of the matched product', false, 'no recognized photo (vision provider unavailable?)');
  if (upto < 10) return finish();

  // 10) situational decisions (S1–S4): the map is the answer; time/radius/urgency controls re-run without the LLM
  const decisionFor = async (demo: string, text: string) => {
    await page.goto(`${base}/demo-reset?demo_time=${encodeURIComponent(demo)}&name=${encodeURIComponent(USER)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-hero-chip]').first().waitFor({ timeout: 30_000 });
    const n = await page.locator('[data-decision]').count();
    await page.locator('textarea').fill(text);
    await page.locator('textarea').press('Enter');
    await page.waitForFunction((k) => document.querySelectorAll('[data-decision]').length > k, n, { timeout: 60_000 });
    await waitIdle(page);
    await page.waitForTimeout(1200); // map tiles + fitBounds
    return page.locator('[data-decision]').last();
  };
  const tierText = async (d: ReturnType<Page['locator']>, key: string) => (await d.locator(`[data-tier="${key}"]`).innerText().catch(() => '')).replace(/\n/g, ' ');

  // S1 23:30 at هفت‌تیر: nothing open near → the bazaar, the earliest opening tomorrow
  let d = await decisionFor('2026-10-25T23:30', 'ساعت ۱۱:۳۰ شب، شارژر گوشی می‌خوام نزدیک میدان هفت تیر');
  const s1 = await d.innerText();
  check('S1. night: T1 empty (said), bazaar card, earliest opening, map with hub', /هیچ فروشنده‌ی ثبت‌شده/.test(await tierText(d, 'open_listed_near')) && /بورس موبایل جمهوری/.test(s1) && /فردا/.test(await tierText(d, 'opens_soonest')) && (await d.locator('.hk-dm-hub').count()) >= 1 && (await d.locator('.hk-dm-user').count()) === 1, (await d.getAttribute('data-recommended')) ?? '');
  const reply = (await page.locator('[data-role="assistant"]').last().innerText()).split('\n').filter((l) => l.trim() && !/دستیار هوشمند|حالت ساده/.test(l)).pop() ?? '';
  check('S1. agent text ≤ 2 sentences', reply.split(/[.؟!](?:\s|$)/).filter((x) => x.trim()).length <= 2, reply.slice(0, 120));
  await snapAs(page, '24-decision-night', '[data-decision]');

  // S2 18:40: open near with «عجله کن», later-closing ones farther; the time scrubber moves the verdict
  d = await decisionFor('2026-10-25T18:40', 'همین الان شارژر گوشی می‌خوام نزدیک میدان هفت تیر');
  check('S2. evening: open near with «عجله کن», recommended T1', (await d.locator('[data-tier="open_listed_near"] [data-hurry]').count()) >= 1 && (await d.getAttribute('data-recommended')) === 'open_listed_near');
  await snapAs(page, '25-decision-evening', '[data-decision]');
  const v1 = await d.locator('[data-decision-verdict]').innerText();
  await d.locator('[data-time-scrubber]').fill('50');
  await page.waitForFunction((t) => document.querySelector('[data-decision]:last-of-type [data-decision-verdict]')?.textContent !== t, v1, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(900);
  const v2 = await page.locator('[data-decision]').last().locator('[data-decision-verdict]').innerText();
  check('S2. time scrubber to 19:30 re-runs without the LLM and changes the verdict', v2 !== v1 && /ساعت ۱۹:۳۰/.test(v2), v2);
  await snapAs(page, '26-decision-time-scrubber', '[data-decision]');

  // S3 Friday noon at سهروردی: Friday closures, no invented open shop, the next opening after Friday
  d = await decisionFor('2026-10-30T11:00', 'جمعه ظهر هدفون می‌خوام نزدیک سهروردی');
  const s3 = await d.innerText();
  check('S3. Friday: «جمعه N٪ … تعطیل», next opening after Friday', /جمعه [۰-۹]+٪/.test(s3) && /(?:شنبه|یکشنبه) [۰-۹]{2}:[۰-۹]{2}/.test(await tierText(d, 'opens_soonest')), (await d.locator('[data-decision-verdict]').innerText()).slice(0, 100));
  await snapAs(page, '27-decision-friday', '[data-decision]');

  // S4 «۱۵ دقیقه دیگه قطار دارم» at فردوسی: walking, 600 m, nearest open first
  d = await decisionFor('2026-10-25T16:00', 'کابل تایپ‌سی، ۱۵ دقیقه دیگه قطار دارم');
  check('S4. train in 15 min: walking, 600 m, nearest open first', (await d.locator('[data-seg="transport:walk"][aria-checked="true"]').count()) === 1 && /۶۰۰ متر/.test(await d.locator('[data-decision-verdict]').innerText()) && (await d.getAttribute('data-recommended')) === 'open_listed_near', await d.locator('[data-decision-verdict]').innerText());

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
