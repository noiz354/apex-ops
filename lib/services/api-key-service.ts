import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { apiKeys, auditEvents } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError } from '../domain/errors';
import { nextNumber } from './sequence';

export interface ApiKeyRow {
  id: string;
  name: string;
  last4: string;
  createdBy: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeyRow {
  secret: string;
}

function toRow(r: typeof apiKeys.$inferSelect): ApiKeyRow {
  return {
    id: r.id,
    name: r.name,
    last4: r.last4,
    createdBy: r.createdBy,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listApiKeys(db: Db, ctx: AuthContext): Promise<ApiKeyRow[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, ctx.orgId), isNull(apiKeys.revokedAt)))
    .orderBy(asc(apiKeys.createdAt));
  return rows.map(toRow);
}

export async function createApiKey(
  db: Db,
  ctx: AuthContext,
  input: { name: string; expiresInDays?: number | null },
): Promise<CreatedApiKey> {
  const name = input.name.trim();
  if (!name) throw new DomainError(400, 'VALIDATION_ERROR', 'Key name is required');
  if (name.length > 80) throw new DomainError(400, 'VALIDATION_ERROR', 'Key name must be ≤ 80 characters');

  const secret = `ak_live_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(secret).digest('hex');
  const year = new Date().getFullYear();

  const created = await db.transaction(async (tx) => {
    const id = await nextNumber(tx, ctx.orgId, 'AK', year);
    const expiresAt =
      input.expiresInDays && input.expiresInDays > 0
        ? new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000)
        : null;
    const [row] = await tx
      .insert(apiKeys)
      .values({
        organizationId: ctx.orgId,
        id,
        name,
        keyHash,
        last4: secret.slice(-4),
        createdBy: ctx.userId,
        expiresAt,
      })
      .returning();
    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'API_KEY_CREATE',
      entityType: 'api_key',
      entityId: id,
      after: { name, last4: row.last4, expiresAt: expiresAt?.toISOString() ?? null },
    });
    return row;
  });

  return { ...toRow(created), secret };
}

export async function revokeApiKey(db: Db, ctx: AuthContext, id: string): Promise<ApiKeyRow> {
  const existing = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.organizationId, ctx.orgId), eq(apiKeys.id, id)))
    .limit(1);
  const row = existing[0];
  if (!row) throw new DomainError(404, 'API_KEY_NOT_FOUND', `API key ${id} not found`);
  if (row.revokedAt) throw new DomainError(409, 'API_KEY_ALREADY_REVOKED', `API key ${id} is already revoked`);

  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.organizationId, ctx.orgId), eq(apiKeys.id, id)))
    .returning();
  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'API_KEY_REVOKE',
    entityType: 'api_key',
    entityId: id,
    after: { name: row.name, last4: row.last4 },
  });
  return toRow(revoked);
}
