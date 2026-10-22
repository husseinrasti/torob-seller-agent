// Finds a SIM_SALT that gives mixed follow-up outcomes for the demo (spec §13 step 5):
// top-3 sellers of A17 128/4 at the default location, 1 km, balanced intent, demo time Sunday 16:00.
// Usage: pnpm tsx scripts/tune-salt.ts [prefix]
import './load-env';
import { findSellers } from '../lib/search/sellers';
import { groundTruth, followupResult } from '../lib/sim/seller';
import { parseDemoTime, openState } from '../lib/data/hours';
import { DEFAULT_LOCATION } from '../lib/geo';
import { pool, q } from '../lib/db/client';
import type { WeeklyHours } from '../lib/data/hours';

async function main() {
  const prefix = process.argv[2] || 'hamrah-';
  const now = parseDemoTime('2026-10-25T16:00')!;
  const res = await findSellers({ product_ids: ['product_d24b597176bdf2a82035dcc2'], lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon, radius_m: 1000, intent: 'balanced', now });
  const top = res.rows.slice(0, 3);
  const hours = await q<{ shop_id: string; weekly_hours: WeeklyHours }>('SELECT shop_id, weekly_hours FROM shops WHERE shop_id = ANY($1::text[])', [top.map((r) => r.shop_id)]);
  console.log('top-3:', top.map((r) => `${r.shop_name} (${r.offer_id}, ${r.freshness})`).join(' | '));
  for (let i = 1; i < 5000; i++) {
    const salt = `${prefix}${i}`;
    const outcomes = top.map((r) => {
      const wh = hours.find((h) => h.shop_id === r.shop_id)?.weekly_hours;
      const os = openState(wh, now);
      const truth = groundTruth({ offer_id: r.offer_id, price: r.price, freshness: r.freshness }, salt);
      return followupResult(truth, 'message', os.known && os.open === false).status;
    });
    // demo wants: ✅ confirmed, ❌ out_of_stock, ⚠️ price_changed (any order, top-1 confirmed preferred)
    const set = new Set(outcomes);
    if (outcomes[0] === 'confirmed' && set.has('out_of_stock') && set.has('price_changed')) {
      console.log(`SIM_SALT=${salt} → ${outcomes.join(', ')}`);
      break;
    }
  }
  await pool.end();
}

main();
