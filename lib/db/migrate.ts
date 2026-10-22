import '../../scripts/load-env';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const folder = process.env.MIGRATIONS_DIR || path.join(process.cwd(), 'drizzle');
  await migrate(drizzle(pool), { migrationsFolder: folder });
  await pool.end();
  console.log(`[migrate] applied migrations from ${folder}`);
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
