import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

export type Db = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const DEFAULT_DATA_DIR = '.data/pg';

declare global {
  var __apexDb: Db | undefined;
  var __apexPglite: PGlite | undefined;
}

function prepare(dataDir: string): PGlite {
  const abs = resolve(dataDir);
  mkdirSync(abs, { recursive: true });
  return new PGlite(abs);
}

export function getDb(): Db {
  if (!globalThis.__apexDb) {
    globalThis.__apexPglite = prepare(process.env.PGDATA_DIR || DEFAULT_DATA_DIR);
    globalThis.__apexDb = drizzle(globalThis.__apexPglite, { schema });
  }
  return globalThis.__apexDb;
}

export function createDb(dataDir: string): { db: Db; close: () => Promise<void> } {
  const client = prepare(dataDir);
  const db = drizzle(client, { schema });
  return { db, close: () => client.close() };
}
