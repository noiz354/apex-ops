import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, partMovements, parts, users } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, forbiddenOp, notFound } from '../domain/errors';
import { verifyTotp } from '../auth/totp';
import { requestHash, withIdempotency } from './idempotency';

export interface PartRow {
  sku: string;
  name: string;
  unitPriceCents: number;
  priceFormatted: string;
  bin: string;
  onHand: number;
  reserved: number;
  available: number;
  minStock: number;
  isLowStock: boolean;
  createdAt: string;
}

function toPartDto(p: typeof parts.$inferSelect): PartRow {
  const available = Math.max(0, p.onHand - p.reserved);
  const dollars = (p.unitPriceCents / 100).toFixed(2);
  return {
    sku: p.sku,
    name: p.name,
    unitPriceCents: p.unitPriceCents,
    priceFormatted: `$${dollars}`,
    bin: p.bin,
    onHand: p.onHand,
    reserved: p.reserved,
    available,
    minStock: p.minStock,
    isLowStock: p.onHand <= p.minStock,
    createdAt: p.createdAt.toISOString(),
  };
}

export interface ListPartsOpts {
  limit?: number;
  offset?: number;
  lowStockOnly?: boolean;
}

export async function listParts(
  db: Db,
  ctx: AuthContext,
  opts?: ListPartsOpts,
): Promise<PartRow[]> {
  const conditions = [eq(parts.organizationId, ctx.orgId)];
  if (opts?.lowStockOnly) {
    conditions.push(sql`${parts.onHand} <= ${parts.minStock}`);
  }

  let query = db
    .select()
    .from(parts)
    .where(and(...conditions))
    .orderBy(asc(parts.sku))
    .$dynamic();

  if (opts?.offset) {
    query = query.offset(opts.offset);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const rows = await query;
  return rows.map(toPartDto);
}

export async function getPart(db: Db, ctx: AuthContext, sku: string): Promise<PartRow> {
  const rows = await db
    .select()
    .from(parts)
    .where(and(eq(parts.organizationId, ctx.orgId), eq(parts.sku, sku)))
    .limit(1);
  if (!rows[0]) throw notFound('PART', sku);
  return toPartDto(rows[0]);
}

export interface StockMutationInput {
  sku: string;
  type: 'ISSUE' | 'RECEIVE' | 'ADJUST' | 'RESERVE' | 'RELEASE';
  qty: number;
  refNumber?: string | null;
  reason?: string | null;
}

export interface MovementRow {
  id: string;
  sku: string;
  type: string;
  qty: number;
  refNumber: string | null;
  reason: string | null;
  actorName: string;
  stepUpAt: string | null;
  requestId: string | null;
  beforeOnHand: number;
  afterOnHand: number;
  createdAt: string;
}

export interface ListMovementsOpts {
  limit?: number;
  sku?: string;
}

export async function listMovements(
  db: Db,
  ctx: AuthContext,
  opts: ListMovementsOpts = {},
): Promise<MovementRow[]> {
  const conditions = [eq(partMovements.organizationId, ctx.orgId)];
  if (opts.sku) {
    conditions.push(eq(partMovements.sku, opts.sku));
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(partMovements)
    .where(and(...conditions))
    .orderBy(desc(partMovements.createdAt), desc(partMovements.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    type: r.type,
    qty: r.qty,
    refNumber: r.refNumber,
    reason: r.reason,
    actorName: r.actorName,
    stepUpAt: r.stepUpAt ? r.stepUpAt.toISOString() : null,
    requestId: r.requestId,
    beforeOnHand: r.beforeOnHand,
    afterOnHand: r.afterOnHand,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function verifyStepUpCode(db: Db, ctx: AuthContext, code: string): Promise<string> {
  const rows = await db
    .select({ totpSecret: users.totpSecret })
    .from(users)
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.id, ctx.userId)))
    .limit(1);
  const secret = rows[0]?.totpSecret ?? null;
  if (!secret) {
    throw forbiddenOp(
      'STEP_UP_UNAVAILABLE',
      'Approver MFA is not enrolled — enroll an authenticator before approving stock mutations.',
    );
  }
  if (!verifyTotp(secret, code)) {
    throw forbiddenOp(
      'STEP_UP_INVALID',
      'Approver code rejected — enter the current 6-digit code from your authenticator app.',
    );
  }
  return new Date().toISOString();
}

export async function mutateStock(
  db: Db,
  ctx: AuthContext,
  input: StockMutationInput,
  opts: { idempotencyKey?: string | null; requestId?: string; stepUpAt?: string | null } = {},
): Promise<PartRow> {
  if (input.qty <= 0) {
    throw new DomainError(422, 'INVALID_QUANTITY', 'Mutation quantity must be positive');
  }

  const exec = async (tx: Tx): Promise<PartRow> => {
    const existing = await tx
      .select()
      .from(parts)
      .where(and(eq(parts.organizationId, ctx.orgId), eq(parts.sku, input.sku)))
      .limit(1);

    if (!existing[0]) {
      throw notFound('PART', input.sku);
    }

    const current = existing[0];
    let newOnHand = current.onHand;
    let newReserved = current.reserved;

    switch (input.type) {
      case 'ISSUE':
        if (current.onHand < input.qty) {
          throw new DomainError(422, 'INSUFFICIENT_STOCK',
          `Cannot issue ${input.qty} pcs: only ${current.onHand} on hand`);
        }
        newOnHand -= input.qty;
        break;

      case 'RECEIVE':
        newOnHand += input.qty;
        break;

      case 'RESERVE':
        if (current.onHand - current.reserved < input.qty) {
          throw new DomainError(422, 'INSUFFICIENT_AVAILABLE',
          `Cannot reserve ${input.qty} pcs: insufficient available stock`);
        }
        newReserved += input.qty;
        break;

      case 'RELEASE':
        newReserved = Math.max(0, newReserved - input.qty);
        break;

      case 'ADJUST':
        if (!input.reason?.trim()) {
          throw new DomainError(400, 'REASON_REQUIRED', 'Inventory adjustment requires a mandatory business justification');
        }
        newOnHand = input.qty;
        break;
    }

    const updated = await tx
      .update(parts)
      .set({
        onHand: newOnHand,
        reserved: newReserved,
      })
      .where(and(eq(parts.organizationId, ctx.orgId), eq(parts.sku, input.sku)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: `PART_${input.type}`,
      entityType: 'part',
      entityId: input.sku,
      requestId: opts.requestId ?? null,
      before: { onHand: current.onHand, reserved: current.reserved },
      after: {
        onHand: newOnHand,
        reserved: newReserved,
        ref: input.refNumber ?? null,
        reason: input.reason ?? null,
        stepUpAt: opts.stepUpAt ?? null,
      },
    });

    await tx.insert(partMovements).values({
      organizationId: ctx.orgId,
      sku: input.sku,
      type: input.type,
      qty: input.qty,
      refNumber: input.refNumber ?? null,
      reason: input.reason ?? null,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      stepUpAt: opts.stepUpAt ? new Date(opts.stepUpAt) : null,
      requestId: opts.requestId ?? null,
      idemHash: requestHash(input),
      beforeOnHand: current.onHand,
      afterOnHand: newOnHand,
    });

    return toPartDto(updated[0]);
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const key = opts.idempotencyKey;
  const hash = requestHash(input);
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, key, 'inventory.mutate', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}
