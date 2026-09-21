import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents } from '../../db/schema';
import type { AuthContext } from '../auth/session';

export interface AuditRow {
  id: number;
  ts: string;
  actorName: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  entryHash: string | null;
}

export interface AuditPage {
  rows: AuditRow[];
  counts: { entityType: string; total: number }[];
  total: number;
  truncated: boolean;
}

export const AUDIT_PAGE_LIMIT = 500;

export interface ListAuditOpts {
  limit?: number;
  offset?: number;
  entityType?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditEvents(
  db: Db,
  ctx: AuthContext,
  opts: ListAuditOpts | number = AUDIT_PAGE_LIMIT,
): Promise<AuditPage> {
  const options: ListAuditOpts = typeof opts === 'number' ? { limit: opts } : opts;
  const limit = options.limit ?? AUDIT_PAGE_LIMIT;
  const offset = options.offset ?? 0;

  const conditions = [eq(auditEvents.organizationId, ctx.orgId)];
  if (options.entityType && options.entityType !== 'all') {
    conditions.push(eq(auditEvents.entityType, options.entityType));
  }
  if (options.from) {
    conditions.push(sql`${auditEvents.ts} >= ${options.from}`);
  }
  if (options.to) {
    conditions.push(sql`${auditEvents.ts} <= ${options.to}`);
  }

  const [rows, grouped, countRes] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.ts), desc(auditEvents.id))
      .offset(offset)
      .limit(limit + 1),
    db
      .select({
        entityType: sql<string>`coalesce(${auditEvents.entityType}, 'other')`,
        total: sql<number>`count(*)::int`,
      })
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, ctx.orgId))
      .groupBy(sql`coalesce(${auditEvents.entityType}, 'other')`)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditEvents)
      .where(and(...conditions)),
  ]);

  const truncated = rows.length > limit;
  return {
    rows: rows.slice(0, limit).map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      actorName: r.actorName,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      requestId: r.requestId,
      entryHash: r.entryHash,
    })),
    counts: grouped.map((g) => ({ entityType: g.entityType, total: g.total })),
    total: countRes[0]?.total ?? 0,
    truncated,
  };
}

import { createHash } from 'crypto';

export async function getAuditEvent(
  db: Db,
  ctx: AuthContext,
  id: number,
): Promise<AuditRow | null> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, ctx.orgId), eq(auditEvents.id, id)))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    ts: r.ts.toISOString(),
    actorName: r.actorName,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    before: r.before,
    after: r.after,
    requestId: r.requestId,
    entryHash: r.entryHash,
  };
}

export interface HashChainVerificationResult {
  valid: boolean;
  verifiedCount: number;
  rootHash: string;
  genesisHash: string;
  tamperedEventId: number | null;
  verificationTimestamp: string;
}

export async function verifyAuditHashChain(
  db: Db,
  ctx: AuthContext,
): Promise<HashChainVerificationResult> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, ctx.orgId))
    .orderBy(asc(auditEvents.id));

  const genesisHash = createHash('sha256')
    .update(`${ctx.orgId}:genesis_apex_ops_v1`)
    .digest('hex');

  let prevHash = genesisHash;

  for (const r of rows) {
    const payload = `${prevHash}:${r.id}:${r.action}:${r.entityType || ''}:${r.entityId || ''}:${r.ts.getTime()}`;
    const calculatedHash = createHash('sha256').update(payload).digest('hex');

    if (r.entryHash && r.entryHash !== calculatedHash) {
      return {
        valid: false,
        verifiedCount: rows.indexOf(r),
        rootHash: prevHash,
        genesisHash,
        tamperedEventId: r.id,
        verificationTimestamp: new Date().toISOString(),
      };
    }

    prevHash = calculatedHash;
  }

  return {
    valid: true,
    verifiedCount: rows.length,
    rootHash: prevHash,
    genesisHash,
    tamperedEventId: null,
    verificationTimestamp: new Date().toISOString(),
  };
}

