import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, serviceRequests, workOrderEvents, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound, staleState } from '../domain/errors';
import {
  SR_LABELS, SR_SLA_WINDOW_MS, isSrTerminal, validateSrTransition,
  type SrAction, type SrStatus,
} from '../domain/service-requests';
import { SLA_WINDOW_MS, slaLabel } from '../domain/work-orders';
import { requestHash, withIdempotency } from './idempotency';
import { nextNumber } from './sequence';
import type { WoRow } from './wo-service';

export interface SrRow {
  number: string;
  title: string;
  requesterName: string;
  priority: 'P1' | 'P2' | 'P3';
  status: SrStatus;
  statusLabel: string;
  assetCode: string | null;
  slaLabel: string;
  slaDueAt: string | null;
  convertedWoNumber: string | null;
  createdAt: string;
}

function toSrDto(row: typeof serviceRequests.$inferSelect, now = new Date()): SrRow {
  const status = row.status as SrStatus;
  return {
    number: row.number,
    title: row.title,
    requesterName: row.requesterName,
    priority: row.priority as SrRow['priority'],
    status,
    statusLabel: SR_LABELS[status],
    assetCode: row.assetCode,
    slaLabel: isSrTerminal(status) ? '—' : slaLabel(row.slaDueAt, now),
    slaDueAt: row.slaDueAt ? row.slaDueAt.toISOString() : null,
    convertedWoNumber: row.convertedWoNumber,
    createdAt: row.createdAt.toISOString(),
  };
}

const srOrder = [
  sql`CASE ${serviceRequests.status} WHEN 'CONVERTED' THEN 1 WHEN 'CLOSED' THEN 1 ELSE 0 END`,
  sql`CASE ${serviceRequests.priority} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`,
  sql`${serviceRequests.slaDueAt} IS NULL`,
  asc(serviceRequests.slaDueAt),
];

export interface ListSrOpts {
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listServiceRequests(
  db: Db,
  ctx: AuthContext,
  opts?: ListSrOpts,
): Promise<SrRow[]> {
  const conditions = [eq(serviceRequests.organizationId, ctx.orgId)];
  if (opts?.status && opts.status !== 'ALL') {
    conditions.push(eq(serviceRequests.status, opts.status));
  }

  let query = db
    .select()
    .from(serviceRequests)
    .where(and(...conditions))
    .orderBy(...srOrder)
    .$dynamic();

  if (opts?.offset) {
    query = query.offset(opts.offset);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const rows = await query;
  return rows.map((r) => toSrDto(r));
}

export async function getServiceRequest(db: Db, ctx: AuthContext, number: string): Promise<SrRow> {
  const rows = await db
    .select()
    .from(serviceRequests)
    .where(and(eq(serviceRequests.organizationId, ctx.orgId), eq(serviceRequests.number, number)))
    .limit(1);
  if (!rows[0]) throw notFound('SERVICE_REQUEST', number);
  return toSrDto(rows[0]);
}

export interface SrHistoryEntry {
  ts: string;
  action: string;
  actorName: string;
  detail: string | null;
}

export async function listSrHistory(db: Db, ctx: AuthContext, number: string): Promise<SrHistoryEntry[]> {
  const rows = await db
    .select({
      ts: auditEvents.ts,
      action: auditEvents.action,
      actorName: auditEvents.actorName,
      after: auditEvents.after,
    })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.organizationId, ctx.orgId),
      eq(auditEvents.entityType, 'service_request'),
      eq(auditEvents.entityId, number),
    ))
    .orderBy(sql`${auditEvents.ts} desc`, sql`${auditEvents.id} desc`)
    .limit(20);
  return rows.map((r) => ({
    ts: r.ts.toISOString(),
    action: r.action,
    actorName: r.actorName,
    detail: (r.after as { reason?: string | null } | null)?.reason ?? null,
  }));
}


export interface CreateSrInput {
  title: string;
  requesterName: string;
  priority: 'P1' | 'P2' | 'P3';
  assetCode?: string | null;
}

export async function createServiceRequest(
  db: Db,
  ctx: AuthContext,
  input: CreateSrInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<SrRow> {
  const year = new Date().getFullYear();
  return db.transaction(async (tx) => {
    const result = await withIdempotency<SrRow>(
      tx, ctx.orgId, opts.idempotencyKey ?? null, 'POST /api/service-requests',
      requestHash(input),
      async () => {
        const number = await nextNumber(tx, ctx.orgId, 'SR', year);
        const now = new Date();
        const [sr] = await tx
          .insert(serviceRequests)
          .values({
            organizationId: ctx.orgId,
            number,
            title: input.title.trim(),
            requesterName: input.requesterName.trim(),
            priority: input.priority,
            status: 'OPEN',
            assetCode: input.assetCode ?? null,
            slaDueAt: new Date(now.getTime() + SR_SLA_WINDOW_MS[input.priority]),
          })
          .returning();
        await audit(tx, ctx, 'SR_CREATE', number, { priority: input.priority, assetCode: input.assetCode ?? null }, opts.requestId);
        return { status: 201, body: toSrDto(sr) };
      },
    );
    return result.body;
  });
}


export interface SrTransitionInput {
  action: SrAction;
  reason?: string | null;
  woTitle?: string | null;
  woPriority?: 'P1' | 'P2' | 'P3' | null;
}

export interface SrTransitionResult {
  sr: SrRow;
  workOrder?: WoRow;
}

export async function transitionServiceRequest(
  db: Db,
  ctx: AuthContext,
  number: string,
  input: SrTransitionInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<SrTransitionResult> {
  return db.transaction(async (tx) => {
    const result = await withIdempotency<SrTransitionResult>(
      tx, ctx.orgId, opts.idempotencyKey ?? null,
      `POST /api/service-requests/${number}/transitions`,
      requestHash({ number, ...input }),
      async () => {
        const rows = await tx
          .select()
          .from(serviceRequests)
          .where(and(eq(serviceRequests.organizationId, ctx.orgId), eq(serviceRequests.number, number)))
          .limit(1);
        const sr = rows[0];
        if (!sr) throw notFound('SERVICE_REQUEST', number);

        const current = sr.status as SrStatus;
        const verdict = validateSrTransition(current, input.action, input.reason ?? null);
        if (!verdict.ok) {
          if (verdict.code === 'SR_REASON_REQUIRED') {
            throw new DomainError(400, verdict.code, verdict.message);
          }
          throw new DomainError(409, verdict.code, verdict.message, { current, action: input.action });
        }

        const nextStatus = verdict.to!;
        const now = new Date();
        let convertedWoNumber = sr.convertedWoNumber;
        let createdWo: WoRow | undefined;

        if (input.action === 'convert') {
          const year = now.getFullYear();
          const woNumber = await nextNumber(tx, ctx.orgId, 'WO', year);
          const woPriority = input.woPriority ?? (sr.priority as 'P1' | 'P2' | 'P3');
          const [wo] = await tx
            .insert(workOrders)
            .values({
              organizationId: ctx.orgId,
              number: woNumber,
              title: (input.woTitle?.trim() || sr.title).slice(0, 200),
              assetCode: sr.assetCode,
              location: sr.assetCode ?? '',
              priority: woPriority,
              status: 'OPEN',
              slaDueAt: new Date(now.getTime() + SLA_WINDOW_MS[woPriority]),
              assignedTo: null,
            })
            .returning();
          await tx.insert(workOrderEvents).values({
            organizationId: ctx.orgId,
            workOrderNumber: woNumber,
            actorUserId: ctx.userId,
            actorName: ctx.name,
            action: 'CREATE',
            fromStatus: null,
            toStatus: 'OPEN',
            reason: `Converted from ${sr.number}`,
            requestId: opts.requestId ?? null,
          });
          convertedWoNumber = woNumber;
          createdWo = {
            number: wo.number,
            title: wo.title,
            location: wo.location,
            assetCode: wo.assetCode,
            priority: wo.priority as WoRow['priority'],
            status: 'OPEN',
            statusLabel: 'OPEN',
            slaLabel: slaLabel(wo.slaDueAt, now),
            slaDueAt: wo.slaDueAt ? wo.slaDueAt.toISOString() : null,
            tech: null,
            holdReason: null,
            description: null,
            lotoRequired: false,
            isTerminal: false,
            updatedAt: wo.updatedAt.toISOString(),
          };
        }

        const updated = await tx
          .update(serviceRequests)
          .set({ status: nextStatus, convertedWoNumber })
          .where(and(
            eq(serviceRequests.organizationId, ctx.orgId),
            eq(serviceRequests.number, number),
            eq(serviceRequests.status, current),
          ))
          .returning();
        if (updated.length === 0) {
          throw staleState(`${number} changed status concurrently — reload and retry`, { number, expected: current });
        }

        await audit(
          tx, ctx, `SR_${input.action.toUpperCase()}`, number,
          { from: current, to: nextStatus, reason: input.reason?.trim() || null, convertedWoNumber },
          opts.requestId,
        );

        const dto = toSrDto(updated[0], now);
        return { status: 200, body: createdWo ? { sr: dto, workOrder: createdWo, convertedWoNumber } : { sr: dto } };
      },
    );
    return result.body;
  });
}

async function audit(
  tx: Tx,
  ctx: AuthContext,
  action: string,
  entityId: string,
  after: Record<string, unknown>,
  requestId?: string,
) {
  await tx.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action,
    entityType: 'service_request',
    entityId,
    after,
    requestId: requestId ?? null,
  });
}
