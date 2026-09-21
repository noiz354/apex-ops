import { migrate } from 'drizzle-orm/pglite/migrator';
import { createDb, DEFAULT_DATA_DIR } from './client';
import { seedAll } from './seed';

async function main() {
  const dir = process.env.PGDATA_DIR || DEFAULT_DATA_DIR;
  console.log(`[db:setup] data dir: ${dir}`);
  const { db, close } = createDb(dir);
  try {
    await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
    console.log('[db:setup] migrations applied');
    await seedAll(db);
    console.log('[db:setup] seed complete (idempotent)');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('[db:setup] FAILED:', err);
  process.exit(1);
});
