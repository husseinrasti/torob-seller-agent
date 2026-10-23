// Renders the synthetic photo-search fixtures (tests/fixtures/vision/*.jpg) with headless Chrome.
// They are drawings, not photos of real products: a phone box, a Persian shelf price tag and a landscape.
// Usage: pnpm tsx scripts/make-vision-fixtures.ts
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.join(process.cwd(), 'tests/fixtures/vision');
const font = `data:font/woff2;base64,${fs.readFileSync(path.join(process.cwd(), 'public/fonts/Vazirmatn-Variable.woff2')).toString('base64')}`;
const base = `<style>@font-face{font-family:V;src:url(${font}) format('woff2');font-weight:100 900}*{box-sizing:border-box;margin:0}body{font-family:V,sans-serif}</style>`;

const FIXTURES: Record<string, { w: number; h: number; html: string }> = {
  'samsung-box': {
    w: 900,
    h: 900,
    html: `<div style="width:900px;height:900px;background:radial-gradient(circle at 30% 20%,#fafafa,#d9d9d9);display:flex;align-items:center;justify-content:center">
      <div style="width:560px;height:760px;border-radius:18px;background:linear-gradient(160deg,#1d2b4f,#0a0f1f);box-shadow:30px 40px 60px rgba(0,0,0,.35);position:relative;color:#fff;transform:rotate(-4deg)">
        <div style="position:absolute;top:44px;left:48px;font:700 34px Arial;letter-spacing:9px">SAMSUNG</div>
        <div style="position:absolute;top:150px;left:150px;width:260px;height:470px;border-radius:38px;background:linear-gradient(200deg,#9fb7e8,#5b6f9e);border:6px solid #c9d3ea">
          <div style="position:absolute;top:26px;left:26px;width:94px;height:150px;border-radius:30px;background:#1a2340">
            <div style="margin:12px auto;width:58px;height:58px;border-radius:50%;background:#333c5a;border:4px solid #8090b8"></div>
            <div style="margin:0 auto;width:58px;height:58px;border-radius:50%;background:#333c5a;border:4px solid #8090b8"></div>
          </div>
        </div>
        <div style="position:absolute;bottom:92px;left:48px;font:600 54px Arial">Galaxy A17</div>
        <div style="position:absolute;bottom:50px;left:50px;font:400 22px Arial;opacity:.8">4G · 128GB · 4GB RAM</div>
      </div></div>`,
  },
  'shelf-tag': {
    w: 1100,
    h: 760,
    html: `<div style="width:1100px;height:760px;background:linear-gradient(#6b4a2f,#4a3220);display:flex;align-items:center;justify-content:center">
      <div dir="rtl" style="width:820px;padding:42px 54px;background:#fffdf5;border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.45);transform:rotate(2deg);border-top:22px solid #d61f26">
        <div style="font-size:30px;font-weight:700;color:#d61f26">فروشگاه موبایل</div>
        <div style="margin-top:22px;font-size:44px;font-weight:800;color:#111">گوشی سامسونگ Galaxy A17 4G</div>
        <div style="margin-top:8px;font-size:30px;color:#444">حافظه ۱۲۸ گیگ · رم ۴ گیگ · گارانتی ۱۸ ماهه</div>
        <div style="margin-top:34px;font-size:30px;color:#555">قیمت:</div>
        <div style="font-size:82px;font-weight:900;color:#111">۶۴٬۵۰۰٬۰۰۰ <span style="font-size:42px">تومان</span></div>
      </div></div>`,
  },
  unrelated: {
    w: 1000,
    h: 700,
    html: `<div style="width:1000px;height:700px;position:relative;overflow:hidden;background:linear-gradient(#7ec8f0,#cdeffd)">
      <div style="position:absolute;top:70px;right:120px;width:130px;height:130px;border-radius:50%;background:#ffd84a;box-shadow:0 0 80px #ffe680"></div>
      <div style="position:absolute;bottom:-260px;left:-200px;width:900px;height:560px;border-radius:50%;background:#5fae4a"></div>
      <div style="position:absolute;bottom:-300px;right:-260px;width:1000px;height:560px;border-radius:50%;background:#4a9a3a"></div>
      <div style="position:absolute;bottom:170px;left:300px;width:34px;height:150px;background:#6b4423"></div>
      <div style="position:absolute;bottom:280px;left:220px;width:200px;height:190px;border-radius:50%;background:#2f7d32"></div>
      <div style="position:absolute;top:120px;left:140px;width:180px;height:56px;border-radius:40px;background:#fff;opacity:.9"></div>
    </div>`,
  },
};

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  for (const [name, f] of Object.entries(FIXTURES)) {
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${base}</head><body>${f.html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 82 });
    await page.close();
    console.log(`${out}/${name}.jpg`);
  }
  await browser.close();
}

main();
