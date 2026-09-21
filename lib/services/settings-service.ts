import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, settingsKv } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';

export const SETTINGS_KEY_RE = /^[A-Za-z0-9_.:-]{2,120}$/;
export const SETTINGS_VALUE_MAX = 16_384;

export type SettingKind = 'value' | 'secret';

export interface SettingRow {
  key: string;
  kind: SettingKind;
  value: unknown;
  last4: string | null;
  hasSecret: boolean;
  updatedAt: string;
  updatedBy: string;
}

function toDto(r: typeof settingsKv.$inferSelect): SettingRow {
  const base: SettingRow = {
    key: r.key,
    kind: r.kind as SettingKind,
    value: undefined,
    last4: r.last4,
    hasSecret: r.kind === 'secret',
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  };
  if (r.kind !== 'secret') {
    try {
      base.value = JSON.parse(r.value);
    } catch {
      base.value = r.value;
    }
  }
  return base;
}

export async function listSettings(db: Db, ctx: AuthContext): Promise<SettingRow[]> {
  const rows = await db
    .select()
    .from(settingsKv)
    .where(eq(settingsKv.organizationId, ctx.orgId))
    .orderBy(asc(settingsKv.key));
  return rows.map(toDto);
}

export interface PutSettingInput {
  value: unknown;
  kind?: SettingKind;
}

export async function putSetting(
  db: Db,
  ctx: AuthContext,
  key: string,
  input: PutSettingInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<SettingRow> {
  const exec = async (tx: Tx): Promise<SettingRow> => {
    if (!SETTINGS_KEY_RE.test(key)) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'key must be 2–120 chars of [A-Za-z0-9_.:-] (no spaces/slashes)');
    }
    const kind: SettingKind = input.kind ?? 'value';
    if (kind === 'secret') {
      throw new DomainError(400, 'SECRET_VIA_ROTATE', 'secrets are only written via POST …/[key]/rotate — plaintext is never PUT');
    }
    const encoded = JSON.stringify(input.value);
    if (encoded === undefined) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'value must be JSON-serializable');
    }
    if (encoded.length > SETTINGS_VALUE_MAX) {
      throw new DomainError(400, 'VALIDATION_ERROR', `value exceeds ${SETTINGS_VALUE_MAX} bytes`);
    }

    const beforeRows = await tx
      .select({ kind: settingsKv.kind, value: settingsKv.value, last4: settingsKv.last4 })
      .from(settingsKv)
      .where(and(eq(settingsKv.organizationId, ctx.orgId), eq(settingsKv.key, key)))
      .limit(1);
    const before = beforeRows[0];

    const [row] = await tx
      .insert(settingsKv)
      .values({ organizationId: ctx.orgId, key, kind, value: encoded, last4: null, updatedBy: ctx.name })
      .onConflictDoUpdate({
        target: [settingsKv.organizationId, settingsKv.key],
        set: { kind, value: encoded, last4: null, updatedBy: ctx.name, updatedAt: new Date() },
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'SETTINGS_UPDATE',
      entityType: 'setting',
      entityId: key,
      requestId: opts.requestId ?? null,
      before: before ? { kind: before.kind, value: before.kind === 'secret' ? '[hash]' : before.value } : null,
      after: { kind, value: encoded },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'settings.put', key, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'settings.put', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}

export interface RotateResult {
  key: string;
  last4: string;
  secret: string;
  updatedAt: string;
}

export async function rotateSecret(
  db: Db,
  ctx: AuthContext,
  key: string,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<RotateResult> {
  const exec = async (tx: Tx): Promise<RotateResult> => {
    if (!SETTINGS_KEY_RE.test(key)) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'key must be 2–120 chars of [A-Za-z0-9_.:-] (no spaces/slashes)');
    }
    const secret = `apx_live_sec_${randomBytes(16).toString('hex')}`;
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const last4 = secret.slice(-4);

    const beforeRows = await tx
      .select({ value: settingsKv.value, last4: settingsKv.last4 })
      .from(settingsKv)
      .where(and(eq(settingsKv.organizationId, ctx.orgId), eq(settingsKv.key, key)))
      .limit(1);
    const before = beforeRows[0];

    const now = new Date();
    await tx
      .insert(settingsKv)
      .values({ organizationId: ctx.orgId, key, kind: 'secret', value: secretHash, last4, updatedBy: ctx.name })
      .onConflictDoUpdate({
        target: [settingsKv.organizationId, settingsKv.key],
        set: { kind: 'secret', value: secretHash, last4, updatedBy: ctx.name, updatedAt: now },
      });

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'SETTINGS_SECRET_ROTATE',
      entityType: 'setting',
      entityId: key,
      requestId: opts.requestId ?? null,
      before: before ? { last4: before.last4 } : null,
      after: { last4 },
    });
    return { key, last4, secret, updatedAt: now.toISOString() };
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'settings.rotate', key });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'settings.rotate', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}
