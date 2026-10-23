// Coverage report for the shop-type rules (dev aid): pnpm tsx scripts/shop-types-report.ts
import './load-env';
import { q, pool } from '../lib/db/client';
import { categoryShopType } from '../lib/data/shop-type-rules';
import { loadShopTypes } from '../lib/search/shop-types';

async function main() {
  const cats = await q<{ c: string; n: number }>(`SELECT c, count(*)::int n FROM shops, jsonb_array_elements_text(category_names) c GROUP BY c ORDER BY n DESC`);
  let total = 0;
  let matched = 0;
  const unmatched: string[] = [];
  for (const { c, n } of cats) {
    total += n;
    if (categoryShopType(c)) matched += n;
    else unmatched.push(`${c} (${n})`);
  }
  console.log(`category memberships with a vote: ${((100 * matched) / total).toFixed(1)}% of ${total}`);
  console.log('top categories without a vote:', unmatched.slice(0, Number(process.argv[2] ?? 60)).join(' · '));
  const types = await loadShopTypes();
  const dist = new Map<string, number>();
  for (const t of types.values()) dist.set(t, (dist.get(t) ?? 0) + 1);
  console.log('shops by type:', [...dist].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(' · '));
  await pool.end();
}
main();
