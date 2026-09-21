import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, organizations, users, workOrderEvents, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, invalidTransition, notFound, staleState } from '../domain/errors';
import {
  SLA_WINDOW_MS, WO_LABELS, isTerminal, slaLabel, validateTransition,
  type WoAction, type WoStatus,
} from '../domain/work-orders';
import { requestHash, withIdempotency } from './idempotency';
import { nextNumber } from './sequence';

export interface WoRow {
  number: string;
  title: string;
  location: string;
  assetCode: string | null;
  priority: 'P1' | 'P2' | 'P3';
  status: WoStatus;
  statusLabel: string;
  slaLabel: string;
  slaDueAt: string | null;
  tech: string | null;
  holdReason: string | null;
  description: string | null;
  lotoRequired: boolean;
  isTerminal: boolean;
  updatedAt: string;
}

type WoJoinRow = { wo: typeof workOrders.$inferSelect; assigneeName: string | null };

function toDto(row: WoJoinRow, now = new Date()): WoRow {
  const status = row.wo.status as WoStatus;
  return {
    number: row.wo.number,
    title: row.wo.title,
    location: row.wo.location,
    assetCode: row.wo.assetCode,
    priority: row.wo.priority as WoRow['priority'],
    status,
    statusLabel: WO_LABELS[status],
    slaLabel: isTerminal(status) ? '—' : slaLabel(row.wo.slaDueAt, now),
    slaDueAt: row.wo.slaDueAt ? row.wo.slaDueAt.toISOString() : null,
    tech: row.assigneeName,
    holdReason: row.wo.holdReason,
    description: row.wo.description,
    lotoRequired: row.wo.lotoRequired,
    isTerminal: isTerminal(status),
    updatedAt: row.wo.updatedAt.toISOString(),
  };
}

const selectWo = (db: Db | Tx) =>
  db
    .select({ wo: workOrders, assigneeName: users.name })
    .from(workOrders)
    .leftJoin(users, eq(users.id, workOrders.assignedTo));

const byPriorityThenDue = [
  sql`CASE ${workOrders.priority} WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`,
  sql`${workOrders.slaDueAt} IS NULL`,
  asc(workOrders.slaDueAt),
];

export interface ListWoOpts {
  status?: string;
  priority?: 'P1' | 'P2' | 'P3' | 'ALL';
  assetCode?: string;
  limit?: number;
  offset?: number;
}

export async function listWorkOrders(
  db: Db,
  ctx: AuthContext,
  opts?: ListWoOpts,
): Promise<WoRow[]> {
  const conditions = [eq(workOrders.organizationId, ctx.orgId)];
  if (ctx.role === 'Vendor Partner Tech') {
    conditions.push(eq(workOrders.assignedTo, ctx.userId));
  }
  if (opts?.status && opts.status !== 'ALL') {
    conditions.push(eq(workOrders.status, opts.status));
  }
  if (opts?.priority && opts.priority !== 'ALL') {
    conditions.push(eq(workOrders.priority, opts.priority));
  }
  if (opts?.assetCode) {
    conditions.push(eq(workOrders.assetCode, opts.assetCode));
  }

  let query = selectWo(db)
    .where(and(...conditions))
    .orderBy(...byPriorityThenDue)
    .$dynamic();

  if (opts?.offset) {
    query = query.offset(opts.offset);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const rows = (await query) as WoJoinRow[];
  return rows.map((r) => toDto(r));
}

export async function getWorkOrder(db: Db, ctx: AuthContext, number: string): Promise<WoRow> {
  const conditions = [eq(workOrders.organizationId, ctx.orgId), eq(workOrders.number, number)];
  if (ctx.role === 'Vendor Partner Tech') {
    conditions.push(eq(workOrders.assignedTo, ctx.userId));
  }
  const rows = (await selectWo(db)
    .where(and(...conditions))
    .limit(1)) as WoJoinRow[];
  if (!rows[0]) throw notFound('WORK_ORDER', number);
  return toDto(rows[0]);
}

export interface CreateWoInput {
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  assetCode?: string | null;
  location?: string | null;
  description?: string | null;
  lotoRequired?: boolean | null;
  assigneeEmail?: string | null;
}

export async function createWorkOrder(
  db: Db,
  ctx: AuthContext,
  input: CreateWoInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<WoRow> {
  const year = new Date().getFullYear();
  return db.transaction(async (tx) => {
    const result = await withIdempotency<WoRow>(
      tx, ctx.orgId, opts.idempotencyKey ?? null, 'POST /api/work-orders',
      requestHash(input),
      async () => {
        const number = await nextNumber(tx, ctx.orgId, 'WO', year);
        const now = new Date();
        let assigneeId: string | null = null;
        let assigneeName: string | null = null;
        if (input.assigneeEmail) {
          const [tech] = await tx
            .select()
            .from(users)
            .where(and(eq(users.organizationId, ctx.orgId), eq(users.email, input.assigneeEmail.trim().toLowerCase()), eq(users.isActive, true)))
            .limit(1);
          if (!tech) throw new DomainError(400, 'ASSIGNEE_NOT_FOUND', `No active user '${input.assigneeEmail}' in this organization`);
          assigneeId = tech.id;
          assigneeName = tech.name;
        }
        const [wo] = await tx
          .insert(workOrders)
          .values({
            organizationId: ctx.orgId,
            number,
            title: input.title.trim(),
            assetCode: input.assetCode ?? null,
            location: input.location?.trim() || '',
            priority: input.priority,
            status: 'OPEN',
            slaDueAt: new Date(now.getTime() + SLA_WINDOW_MS[input.priority]),
            assignedTo: assigneeId,
            description: input.description?.trim() || null,
            lotoRequired: input.lotoRequired ?? false,
          })
          .returning();
        await tx.insert(workOrderEvents).values({
          organizationId: ctx.orgId,
          workOrderNumber: number,
          actorUserId: ctx.userId,
          actorName: ctx.name,
          action: 'CREATE',
          fromStatus: null,
          toStatus: 'OPEN',
          reason: null,
          requestId: opts.requestId ?? null,
        });
        await tx.insert(auditEvents).values({
          organizationId: ctx.orgId,
          actorUserId: ctx.userId,
          actorName: ctx.name,
          action: 'WO_CREATE',
          entityType: 'work_order',
          entityId: number,
          after: { title: wo.title, priority: wo.priority, assigneeEmail: input.assigneeEmail ?? null, lotoRequired: wo.lotoRequired },
          requestId: opts.requestId ?? null,
        });
        if (assigneeId) {
          await tx.insert(workOrderEvents).values({
            organizationId: ctx.orgId,
            workOrderNumber: number,
            actorUserId: ctx.userId,
            actorName: ctx.name,
            action: 'ASSIGN',
            fromStatus: null,
            toStatus: 'OPEN',
            reason: 'assigned at create',
            requestId: opts.requestId ?? null,
          });
        }
        return { status: 201, body: toDto({ wo, assigneeName }) };
      },
    );
    return result.body;
  });
}

export interface TransitionInput {
  action: WoAction;
  reason?: string | null;
  assigneeEmail?: string | null;
}

export async function transitionWorkOrder(
  db: Db,
  ctx: AuthContext,
  number: string,
  input: TransitionInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<WoRow> {
  return db.transaction(async (tx) => {
    const result = await withIdempotency<WoRow>(
      tx, ctx.orgId, opts.idempotencyKey ?? null, `POST /api/work-orders/${number}/transitions`,
      requestHash({ number, ...input }),
      async () => {
        const rows = await tx
          .select()
          .from(workOrders)
          .where(and(eq(workOrders.organizationId, ctx.orgId), eq(workOrders.number, number)))
          .limit(1);
        const wo = rows[0];
        if (!wo) throw notFound('WORK_ORDER', number);

        const current = wo.status as WoStatus;
        const verdict = validateTransition(current, input.action, input.reason ?? null);
        if (!verdict.ok) {
          if (verdict.code === 'WO_REASON_REQUIRED') {
            throw new DomainError(400, verdict.code, verdict.message);
          }
          throw invalidTransition(verdict.message, { current, action: input.action });
        }

        let assigneeId = wo.assignedTo;
        let assigneeName: string | null = null;
        if (input.action === 'assign') {
          if (!input.assigneeEmail) {
            throw new DomainError(400, 'ASSIGNEE_REQUIRED', 'assigneeEmail is required for the assign action');
          }
          const [tech] = await tx
            .select()
            .from(users)
            .where(and(eq(users.organizationId, ctx.orgId), eq(users.email, input.assigneeEmail.trim().toLowerCase()), eq(users.isActive, true)))
            .limit(1);
          if (!tech) throw new DomainError(400, 'ASSIGNEE_NOT_FOUND', `No active user '${input.assigneeEmail}' in this organization`);
          assigneeId = tech.id;
          assigneeName = tech.name;
        }

        const nextStatus = verdict.to ?? current;
        const set: Partial<typeof workOrders.$inferInsert> = {
          status: nextStatus,
          assignedTo: assigneeId,
          updatedAt: new Date(),
        };
        if (input.action === 'hold') set.holdReason = (input.reason ?? '').trim();
        if (input.action === 'resume' || input.action === 'start') set.holdReason = null;

        const updated = await tx
          .update(workOrders)
          .set(set)
          .where(and(eq(workOrders.organizationId, ctx.orgId), eq(workOrders.number, number), eq(workOrders.status, current)))
          .returning();
        if (updated.length === 0) {
          throw staleState(`${number} changed status concurrently — reload and retry`, { number, expected: current });
        }

        await tx.insert(workOrderEvents).values({
          organizationId: ctx.orgId,
          workOrderNumber: number,
          actorUserId: ctx.userId,
          actorName: ctx.name,
          action: input.action.toUpperCase(),
          fromStatus: current,
          toStatus: verdict.to,
          reason: input.reason?.trim() || (input.action === 'assign' ? `assigned to ${assigneeName}` : null),
          requestId: opts.requestId ?? null,
        });
        await tx.insert(auditEvents).values({
          organizationId: ctx.orgId,
          actorUserId: ctx.userId,
          actorName: ctx.name,
          action: `WO_${input.action.toUpperCase()}`,
          entityType: 'work_order',
          entityId: number,
          before: { status: current, assignedTo: wo.assignedTo },
          after: { status: nextStatus, assignedTo: assigneeId, reason: input.reason ?? null },
          requestId: opts.requestId ?? null,
        });

        if (input.action === 'complete') {
          await tx
            .update(organizations)
            .set({ activatedAt: new Date() })
            .where(and(eq(organizations.id, ctx.orgId), sql`${organizations.activatedAt} IS NULL`));
        }

        const fresh = { ...updated[0], status: nextStatus };
        const name = assigneeName ?? (assigneeId ? (await tx.select({ name: users.name }).from(users).where(eq(users.id, assigneeId)).limit(1))[0]?.name ?? null : null);
        return { status: 200, body: toDto({ wo: fresh, assigneeName: name }) };
      },
    );
    return result.body;
  });
}


export interface WoEventDto {
  workOrderNumber: string;
  action: string;
  actorName: string;
  reason: string | null;
  ts: string;
}

export interface DashboardData {
  kpis: {
    open: number;
    p1: number;
    onHold: number;
    techs: number;
    slaCompliance: number | null;
  };
  rows: WoRow[];
  events: WoEventDto[];
}

export async function getDashboard(db: Db, ctx: AuthContext): Promise<DashboardData> {
  const [c] = await db
    .select({
      open: sql<number>`(count(*) filter (where ${workOrders.status} not in ('COMPLETED','CANCELLED')))::int`,
      p1: sql<number>`(count(*) filter (where ${workOrders.status} not in ('COMPLETED','CANCELLED') and ${workOrders.priority} = 'P1'))::int`,
      onHold: sql<number>`(count(*) filter (where ${workOrders.status} = 'ON_HOLD'))::int`,
      techs: sql<number>`(count(distinct ${workOrders.assignedTo}) filter (where ${workOrders.status} not in ('COMPLETED','CANCELLED') and ${workOrders.assignedTo} is not null))::int`,
      completedTotal: sql<number>`(count(*) filter (where ${workOrders.status} = 'COMPLETED'))::int`,
      completedInSla: sql<number>`(count(*) filter (where ${workOrders.status} = 'COMPLETED' and (${workOrders.slaDueAt} is null or ${workOrders.updatedAt} <= ${workOrders.slaDueAt})))::int`,
    })
    .from(workOrders)
    .where(eq(workOrders.organizationId, ctx.orgId));

  const rows = (await selectWo(db)
    .where(and(eq(workOrders.organizationId, ctx.orgId), sql`${workOrders.status} not in ('COMPLETED','CANCELLED')`))
    .orderBy(...byPriorityThenDue)
    .limit(5)) as WoJoinRow[];

  const events = await db
    .select({
      workOrderNumber: workOrderEvents.workOrderNumber,
      action: workOrderEvents.action,
      actorName: workOrderEvents.actorName,
      reason: workOrderEvents.reason,
      ts: workOrderEvents.ts,
    })
    .from(workOrderEvents)
    .where(eq(workOrderEvents.organizationId, ctx.orgId))
    .orderBy(sql`${workOrderEvents.ts} desc`)
    .limit(5);

  return {
    kpis: {
      open: c.open,
      p1: c.p1,
      onHold: c.onHold,
      techs: c.techs,
      slaCompliance: c.completedTotal === 0 ? null : Math.round((c.completedInSla / c.completedTotal) * 1000) / 10,
    },
    rows: rows.map((r) => toDto(r)),
    events: events.map((e) => ({ ...e, ts: e.ts.toISOString() })),
  };
}

export async function listAssignableTechs(db: Db, ctx: AuthContext): Promise<{ name: string; email: string; role: string }[]> {
  const rows = await db
    .select({ name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.isActive, true)))
    .orderBy(users.name);
  return rows;
}


export interface WoHistoryEntry {
  ts: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string;
  reason: string | null;
}

export async function listWoEvents(db: Db, ctx: AuthContext, number: string): Promise<WoHistoryEntry[]> {
  const rows = await db
    .select({
      ts: workOrderEvents.ts,
      action: workOrderEvents.action,
      fromStatus: workOrderEvents.fromStatus,
      toStatus: workOrderEvents.toStatus,
      actorName: workOrderEvents.actorName,
      reason: workOrderEvents.reason,
    })
    .from(workOrderEvents)
    .where(and(eq(workOrderEvents.organizationId, ctx.orgId), eq(workOrderEvents.workOrderNumber, number)))
    .orderBy(sql`${workOrderEvents.ts} desc`, sql`${workOrderEvents.id} desc`)
    .limit(30);
  return rows.map((r) => ({ ...r, ts: r.ts.toISOString() }));
}
