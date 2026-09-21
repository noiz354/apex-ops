import type { Db } from '../../db/client';
import { getDb } from '../../db/client';

export type QueryRole = 'primary' | 'replica';

export function getDatabaseHandle(role: QueryRole = 'primary'): Db {
  if (role === 'replica' && process.env.DATABASE_READ_REPLICA_URL) {
    return getDb();
  }
  return getDb();
}

export function getReadDb(): Db {
  return getDatabaseHandle('replica');
}
