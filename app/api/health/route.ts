import { sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { withRoute, DomainError } from '@/lib/api/http';
import { getDb } from '@/db/client';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'health', method: 'GET', public: true }, req, async () => {
    const startTime = Date.now();
    try {
      await getDb().execute(sql`select 1 as ping`);
      const latencyMs = Date.now() - startTime;
      const mem = process.memoryUsage();

      return {
        data: {
          status: 'UP',
          healthy: true,
          checks: {
            database: {
              status: 'UP',
              latencyMs,
            },
            runtime: {
              status: 'UP',
              nodeVersion: process.version,
              uptimeSeconds: Math.floor(process.uptime()),
              rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
              heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
            },
          },
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      throw new DomainError(503, 'DB_UNAVAILABLE', 'Database is not reachable or degraded', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
