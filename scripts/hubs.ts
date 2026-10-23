// Rebuild the «بورس‌ها» table from the shops + data/hubs.curated.json (also done by the seed).
// Usage: pnpm hubs
import './load-env';
import { pool } from '../lib/db/client';
import { rebuildHubs } from '../lib/search/hubs';

rebuildHubs()
  .then((hubs) => {
    for (const h of hubs) console.log(`${h.source.padEnd(8)} ${h.name} · ${h.shop_count} shops · r ${h.radius_m} m`);
    console.log(`\nhubs: ${hubs.length}`);
  })
  .finally(() => pool.end());
