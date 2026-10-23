// Photo search (F1) against the real vision models: the three fixtures on each provider given
// (default: every provider with a key). Network + API keys required, so not part of `pnpm golden`.
// Usage: pnpm vision-check [openai] [google] [openrouter]
import './load-env';
import fs from 'node:fs';
import path from 'node:path';
import { identifyProduct } from '../lib/vision/identify';
import { NOT_RECOGNIZED, recognized, shelfPrice, visionQuery } from '../lib/vision/parse';

const dir = path.join(process.cwd(), 'tests/fixtures/vision');
const KEYS: Record<string, string> = { openai: 'OPENAI_API_KEY', google: 'GOOGLE_GENERATIVE_AI_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const CASES = [
  { file: 'samsung-box.jpg', ok: (q: string, price: number | null, rec: boolean) => rec && /سامسونگ|samsung/i.test(q) && /a17/i.test(q), expect: 'Samsung Galaxy A17' },
  { file: 'shelf-tag.jpg', ok: (q: string, price: number | null, rec: boolean) => rec && /a17/i.test(q) && price === 64_500_000, expect: 'A17 + 64,500,000 toman' },
  { file: 'unrelated.jpg', ok: (_q: string, _p: number | null, rec: boolean) => !rec, expect: NOT_RECOGNIZED },
];

async function main() {
  const asked = process.argv.slice(2).filter((a) => KEYS[a]);
  const providers = asked.length ? asked : Object.keys(KEYS).filter((p) => process.env[KEYS[p]]);
  let failed = 0;
  for (const p of providers) {
    process.env.LLM_PROVIDER = p;
    for (const c of CASES) {
      const r = await identifyProduct(new Uint8Array(fs.readFileSync(path.join(dir, c.file))), 'image/jpeg');
      const v = r.vision;
      const rec = v ? recognized(v) : false;
      const q = v ? visionQuery(v) : '';
      const price = v ? shelfPrice(v) : null;
      const ok = !r.error && c.ok(q, price, rec);
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${p}/${r.model}  ${c.file} (${(r.ms / 1000).toFixed(1)} s) — ${r.error ?? (rec ? `«${q}»${price ? ` · ${price}` : ''} · conf ${v!.confidence}` : NOT_RECOGNIZED)}  [expect ${c.expect}]`);
    }
  }
  console.log(`\nvision: ${providers.length * CASES.length - failed}/${providers.length * CASES.length} checks passed on ${providers.join(', ')}`);
  process.exit(failed ? 1 : 0);
}

main();
