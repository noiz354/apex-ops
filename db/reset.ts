import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createDb, DEFAULT_DATA_DIR } from './client';
import { seedAll } from './seed';

async function main() {
  const dir = process.env.PGDATA_DIR || DEFAULT_DATA_DIR;
  console.log(`[db:reset] wiping ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  const { db, close } = createDb(dir);
  try {
    await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
    await seedAll(db);
    console.log('[db:reset] done — fresh database seeded');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('[db:reset] FAILED:', err);
  process.exit(1);
});
