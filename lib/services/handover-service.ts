import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, handovers } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HandoverRow {
  id: string;
  shiftFrom: string;
  shiftTo: string;
  leadFrom: string;
  leadTo: string;
  woRef: string | null;
  items: string;
  notes: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(r: typeof handovers.$inferSelect): HandoverRow {
  return {
    id: r.id,
    shiftFrom: r.shiftFrom,
    shiftTo: r.shiftTo,
    leadFrom: r.leadFrom,
    leadTo: r.leadTo,
    woRef: r.woRef ?? null,
    items: r.items,
    notes: r.notes,
    status: r.status as HandoverRow['status'],
    rejectReason: r.rejectReason ?? null,
    decidedBy: r.decidedBy ?? null,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listHandovers(db: Db, ctx: AuthContext): Promise<HandoverRow[]> {
  const rows = await db
    .select()
    .from(handovers)
    .where(eq(handovers.organizationId, ctx.orgId))
    .orderBy(desc(handovers.createdAt));
  return rows.map(toDto);
}

export interface CreateHandoverInput {
  shiftFrom: string;
  shiftTo: string;
  leadFrom: string;
  leadTo: string;
  woRef?: string | null;
  items?: string;
  notes?: string;
}

export async function createHandover(
  db: Db,
  ctx: AuthContext,
  input: CreateHandoverInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
):Promise<HandoverRow> {
  const exec = async (tx: Tx): Promise<HandoverRow> => {
    for (const [field, v] of [['shiftFrom', input.shiftFrom], ['shiftTo', input.shiftTo], ['leadFrom', input.leadFrom], ['leadTo', input.leadTo]] as const) {
      if (!v || !v.trim()) throw new DomainError(400, 'VALIDATION_ERROR', `${field} is required`);
      if (v.length > 160) throw new DomainError(400, 'VALIDATION_ERROR', `${field} exceeds 160 chars`);
    }
    if ((input.items ?? '').length > 500) throw new DomainError(400, 'VALIDATION_ERROR', 'items exceeds 500 chars');
    if ((input.notes ?? '').length > 500) throw new DomainError(400, 'VALIDATION_ERROR', 'notes exceeds 500 chars');

    const [row] = await tx
      .insert(handovers)
      .values({
        organizationId: ctx.orgId,
        shiftFrom: input.shiftFrom.trim(),
        shiftTo: input.shiftTo.trim(),
        leadFrom: input.leadFrom.trim(),
        leadTo: input.leadTo.trim(),
        woRef: input.woRef?.trim() || null,
        items: (input.items ?? '').trim(),
        notes: (input.notes ?? '').trim(),
        status: 'PENDING',
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'HANDOVER_CREATE',
      entityType: 'handover',
      entityId: row!.id,
      requestId: opts.requestId ?? null,
      before: null,
      after: { shiftFrom: row!.shiftFrom, shiftTo: row!.shiftTo, status: row!.status, woRef: row!.woRef },
    });
    return toDto(row!);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'handover.create', ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'handover.create', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export interface DecideInput {
  action: 'accept' | 'reject';
  reason?: string | null;
}

export async function decideHandover(
  db: Db,
  ctx: AuthContext,
  id: string,
  input: DecideInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<HandoverRow> {
  if (!UUID_RE.test(id)) {
    throw new DomainError(400, 'VALIDATION_ERROR', 'handover id must be a uuid');
  }
  const exec = async (tx: Tx): Promise<HandoverRow> => {
    const reason = input.reason?.trim() ?? '';
    if (input.action === 'reject' && reason.length < 3) {
      throw new DomainError(400, 'REASON_REQUIRED', 'reject requires a discrepancy reason (>= 3 chars) — a silent handover rejection is exactly what the audit trail exists to prevent');
    }
    if (reason.length > 500) throw new DomainError(400, 'VALIDATION_ERROR', 'reason exceeds 500 chars');

    const current = await tx
      .select()
      .from(handovers)
      .where(and(eq(handovers.organizationId, ctx.orgId), eq(handovers.id, id)))
      .limit(1);
    const before = current[0];
    if (!before) throw new DomainError(404, 'HANDOVER_NOT_FOUND', 'handover not found in this organization');
    if (before.status !== 'PENDING') {
      throw new DomainError(409, 'HANDOVER_TERMINAL', `handover is already ${before.status} — terminal decisions are immutable; create a new handover instead`);
    }

    const now = new Date();
    const nextStatus = input.action === 'accept' ? 'ACCEPTED' : 'REJECTED';
    const [updated] = await tx
      .update(handovers)
      .set({
        status: nextStatus,
        rejectReason: input.action === 'reject' ? reason : null,
        decidedBy: ctx.name,
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(handovers.organizationId, ctx.orgId), eq(handovers.id, id)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: input.action === 'accept' ? 'HANDOVER_ACCEPT' : 'HANDOVER_REJECT',
      entityType: 'handover',
      entityId: id,
      requestId: opts.requestId ?? null,
      before: { status: before.status, decidedBy: before.decidedBy },
      after: { status: nextStatus, rejectReason: input.action === 'reject' ? reason : null, decidedBy: ctx.name },
    });
    return toDto(updated!);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'handover.decide', id, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'handover.decide', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}
