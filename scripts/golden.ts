// Golden queries (spec §12): runs the same search code as the API and prints a pass/fail table.
// Usage: pnpm golden   (needs a seeded database)
import './load-env';
import { routeCategories } from '../lib/search/categories';
import { searchProducts } from '../lib/search/products';
import { findSellers } from '../lib/search/sellers';
import { parseDemoTime } from '../lib/data/hours';
import { DEFAULT_LOCATION } from '../lib/geo';
import { pool } from '../lib/db/client';
import { TOOL_DEFS } from '../lib/agent/tools';

type Expect = {
  text: string;
  category?: RegExp;
  topIds?: { ids: string[]; within: number };
  minResults?: number;
  budgetMax?: number;
  noBudget?: boolean;
};

const A17_128_4 = 'product_d24b597176bdf2a82035dcc2';
const GOLDEN: Expect[] = [
  {
    text: 'گوشی سامسونگ تا ۶۰ میلیون',
    category: /^گوشی موبایل$/,
    topIds: { ids: [A17_128_4, 'product_8eaba34d56960fb44ed580dd', 'product_adfdc73bc839d15cd7754318', 'product_3d1290a3534f581c9e3d12cc'], within: 5 },
    budgetMax: 60_000_000,
  },
  { text: 'سامسونگ A17 رم ۶', topIds: { ids: ['product_7d705eb898f0a45b69cb7edf'], within: 3 } },
  { text: 'هدفون بلوتوثی انکر', topIds: { ids: ['product_92ac53fa75e18e8e73f20b56', 'product_2d2917467fe1c75845ee81b6'], within: 5 } },
  { text: 'هندزفری سیمی اپل', topIds: { ids: ['product_05443fcee00eb5592135c294', 'product_d219da5984e3c0ede3fa190e'], within: 3 } },
  { text: 'قهوه ساز خانگی ارزون', category: /قهوه|اسپرسو/, minResults: 5 },
  { text: 'دوربین مداربسته برای مغازه', category: /دوربین مدار بسته/, minResults: 5 },
  { text: 'پاوربانک ۲۰ هزار', category: /پاوربانک/, minResults: 5, noBudget: true },
  { text: 'کاور گوشی سامسونگ A17', category: /کیف و کاور گوشی/, minResults: 3 },
  { text: 'لامپ ال ای دی ۲۰ وات', category: /لامپ LED/, minResults: 5 },
  { text: 'ساعت مچی مردانه کاسیو', category: /ساعت مچی/, minResults: 3 },
  { text: 'اسپیکر بلوتوثی تا ۲ میلیون', category: /اسپیکر/, budgetMax: 2_000_000 },
  { text: 'گوشی موبایل', minResults: 3 },
  { text: 'سیم برق ۲ در ۲.۵', category: /سیم و کابل/, minResults: 3 },
  { text: 'مودم 4G رومیزی', category: /مودم/, minResults: 3 },
  { text: 'کیو سی وای T13', topIds: { ids: ['product_a0b9dc5ecc796b0f79a33cf3'], within: 3 } },
];

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function main() {
  let passed = 0;
  console.log('\nGolden product queries');
  console.log('─'.repeat(110));
  for (const g of GOLDEN) {
    const t = Date.now();
    const problems: string[] = [];
    try {
      const route = await routeCategories(g.text);
      const res = await searchProducts({ text: g.text, keywords: route.keywords, categories: route.categories, budget: route.budget, limit: 8 });
      const ids = res.products.map((p) => p.product_id);
      if (g.category) {
        const topCat = res.products[0]?.category ?? '';
        if (!g.category.test(topCat) || !route.categories.some((c) => g.category!.test(c))) problems.push(`category ${topCat || '∅'} (route ${route.categories.join('/')})`);
      }
      if (g.topIds && !ids.slice(0, g.topIds.within).some((id) => g.topIds!.ids.includes(id))) problems.push(`expected id not in top ${g.topIds.within}`);
      if (g.minResults && res.products.length < g.minResults) problems.push(`${res.products.length} < ${g.minResults} results`);
      if (g.budgetMax && route.budget?.max !== g.budgetMax) problems.push(`budget ${JSON.stringify(route.budget)}`);
      if (g.noBudget && route.budget) problems.push(`unexpected budget ${JSON.stringify(route.budget)}`);
      const ok = problems.length === 0;
      if (ok) passed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${pad(g.text, 30)} ${pad(`${Date.now() - t} ms`, 8)} ${pad(route.source, 5)} ${ok ? (res.products[0]?.title ?? '').slice(0, 55) : problems.join('; ')}`);
    } catch (err) {
      console.log(`FAIL  ${pad(g.text, 30)} error: ${(err as Error).message}`);
    }
  }
  console.log('─'.repeat(110));
  console.log(`products: ${passed}/${GOLDEN.length} passed (need ≥ 12)\n`);

  // Seller checks (spec §12, adjusted per DECISIONS #14)
  const now = parseDemoTime('2026-10-25T16:00')!;
  const base = { product_ids: [A17_128_4], lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon, radius_m: 1000, now };
  await findSellers(base); // warm-up
  const t0 = performance.now();
  const s = await findSellers(base);
  const ms = performance.now() - t0;
  const inst = await findSellers({ ...base, filters: { installment: true } });
  const cluster = (k: string) => s.clusters.find((c) => c.mall_key === k)?.count ?? 0;
  const sellerChecks: Array<[string, boolean, string]> = [
    ['A17 128/4 sellers within 1 km = 24', s.count === 24, String(s.count)],
    ['≥ 20 with hours known', s.rows.filter((r) => r.hours_known).length >= 20, String(s.rows.filter((r) => r.hours_known).length)],
    ['cluster علاءالدین ≥ 5', cluster('علاءالدین') >= 5, String(cluster('علاءالدین'))],
    ['cluster چارسو ≥ 2', cluster('چارسو') >= 2, String(cluster('چارسو'))],
    ['rows carry three-field data + why', s.rows.every((r) => 'price' in r && 'freshness' in r && 'price_age_days' in r && r.why.length > 0), ''],
    ['installment=true → ≤ 2 rows', inst.count <= 2, String(inst.count)],
    ['installment=true → relaxation hint', inst.relaxations.length > 0, JSON.stringify(inst.relaxations.map((r) => `${r.label}+${r.would_add}`))],
    ['maybe_shops are separate, without price', s.maybe_shops.every((m) => !('price' in m)), String(s.maybe_shops.length)],
    ['findSellers warm < 300 ms', ms < 300, `${ms.toFixed(1)} ms`],
    (() => {
      // what the LLM sees per find_sellers call (UI gets the full payload)
      const compact = JSON.stringify(TOOL_DEFS.find_sellers.toModel({ ui: 'sellers', suggested_actions: [], ...s }));
      const full = JSON.stringify(s);
      return ['LLM tool payload compact (< 8k tokens)', compact.length / 3 < 8000, `${compact.length} chars vs ${full.length} full`] as [string, boolean, string];
    })(),
  ];
  let sellerOk = 0;
  console.log('Seller checks');
  console.log('─'.repeat(110));
  for (const [name, ok, detail] of sellerChecks) {
    if (ok) sellerOk++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${pad(name, 45)} ${detail}`);
  }
  console.log('─'.repeat(110));
  console.log(`sellers: ${sellerOk}/${sellerChecks.length} passed\n`);
  await pool.end();
  process.exit(passed >= 12 && sellerOk === sellerChecks.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
