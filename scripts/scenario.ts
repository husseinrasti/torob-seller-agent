// Drives the demo scenario (spec §13) on a 390px viewport and saves a screenshot per step.
// Usage: pnpm scenario [baseUrl] [--out=docs/screenshots] [--upto=7]
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || process.env.APP_URL || 'http://localhost:3010';
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'docs/screenshots/tmp';
const upto = Number(process.argv.find((a) => a.startsWith('--upto='))?.slice(7) || 7);
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
    await page.evaluate(() => window.scrollBy(0, -170));
  }
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fa-IR', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  const chatCalls: string[] = [];
  page.on('request', (r) => r.url().includes('/api/chat') && chatCalls.push(r.url()));

  await page.goto(`${base}/demo-reset?demo_time=${DEMO_TIME}`, { waitUntil: 'networkidle' });
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

  // 3a) map panel with numbered sellers
  await page.getByRole('button', { name: 'نقشه' }).click();
  await page.locator('.maplibregl-canvas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  const markers = await page.locator('.maplibregl-marker').count();
  check('3. map panel shows sellers', markers >= 10, `${markers} markers`);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await snap(page, 'map');
  await page.getByRole('button', { name: 'نقشه' }).click();

  // 3b) ContextBar changes re-filter without the LLM
  const before = chatCalls.length;
  await page.locator('button[aria-pressed]', { hasText: 'باز الان' }).first().click();
  await page.getByRole('button', { name: 'تغییر شعاع' }).click();
  await page.getByRole('button', { name: '۵۰۰ متر' }).click();
  await page.waitForFunction(() => /در شعاع ۵۰۰ متر/.test(document.body.innerText), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  const h2 = await page.locator('section[aria-busy] h3').last().innerText();
  check('3. open-now + 500 m shrink the list without /api/chat', chatCalls.length === before, `${h2}; chat calls during change: ${chatCalls.length - before}`);
  await snap(page, 'sellers-open-500m', 'section[aria-busy]');

  await page.locator('button[aria-pressed]', { hasText: 'قسطی' }).first().click();
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

  return finish();

  async function finish() {
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
