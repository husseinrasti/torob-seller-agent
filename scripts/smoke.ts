// Loads `/` on an iPhone-sized viewport and saves a screenshot. Usage: pnpm smoke [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv[2] || process.env.APP_URL || 'http://localhost:3010';
const out = 'docs/screenshots/tmp';

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fa-IR' });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const res = await page.goto(base, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${out}/smoke-home.png` });
  const dir = await page.getAttribute('html', 'dir');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(JSON.stringify({ status: res?.status(), dir, horizontalOverflow: overflow, consoleErrors: errors }, null, 2));
  await browser.close();
  process.exit(res?.ok() && dir === 'rtl' && !overflow && !errors.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
