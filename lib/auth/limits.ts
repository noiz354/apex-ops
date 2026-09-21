import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { rateLimits } from '../../db/schema';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  remaining?: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0, remaining: max - 1 };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 };
  }
  return { ok: true, retryAfterSec: 0, remaining: Math.max(0, max - bucket.count) };
}

export async function rateLimitShared(
  db: Db,
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({
        key,
        count: 1,
        resetAt,
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN 1 ELSE ${rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= now() THEN ${resetAt} ELSE ${rateLimits.resetAt} END`,
        },
      })
      .returning();

    if (!row) {
      return rateLimit(key, max, windowMs);
    }

    const isExceeded = row.count > max;
    const retryAfterSec = Math.max(0, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000));

    return {
      ok: !isExceeded,
      retryAfterSec: isExceeded ? retryAfterSec : 0,
      remaining: Math.max(0, max - row.count),
    };
  } catch {
    return rateLimit(key, max, windowMs);
  }
}

export function _resetLimits(): void {
  buckets.clear();
}
