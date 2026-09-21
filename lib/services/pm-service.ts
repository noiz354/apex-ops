import { and, asc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, pmRules, workOrderEvents, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';
import { SLA_WINDOW_MS, slaLabel } from '../domain/work-orders';
import type { WoRow } from './wo-service';
import { requestHash, withIdempotency } from './idempotency';
import { nextNumber } from './sequence';

export interface PmRuleRow {
  id: string;
  title: string;
  assetCode: string;
  intervalDays: number;
  priority: 'P1' | 'P2' | 'P3';
  status: 'ACTIVE' | 'PAUSED';
  lastGeneratedAt: string | null;
  nextDueAt: string;
  isOverdue: boolean;
  createdAt: string;
}

function toPmRuleDto(r: typeof pmRules.$inferSelect, now = new Date()): PmRuleRow {
  return {
    id: r.id,
    title: r.title,
    assetCode: r.assetCode,
    intervalDays: r.intervalDays,
    priority: r.priority as PmRuleRow['priority'],
    status: r.status as PmRuleRow['status'],
    lastGeneratedAt: r.lastGeneratedAt ? r.lastGeneratedAt.toISOString() : null,
    nextDueAt: r.nextDueAt.toISOString(),
    isOverdue: r.nextDueAt.getTime() < now.getTime(),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listPmRules(db: Db, ctx: AuthContext): Promise<PmRuleRow[]> {
  const rows = await db
    .select()
    .from(pmRules)
    .where(eq(pmRules.organizationId, ctx.orgId))
    .orderBy(asc(pmRules.nextDueAt));
  return rows.map((r) => toPmRuleDto(r));
}

export async function getPmRule(db: Db, ctx: AuthContext, id: string): Promise<PmRuleRow> {
  const rows = await db
    .select()
    .from(pmRules)
    .where(and(eq(pmRules.organizationId, ctx.orgId), eq(pmRules.id, id)))
    .limit(1);

  if (!rows[0]) throw notFound('PM_RULE', id);
  return toPmRuleDto(rows[0]);
}

export interface CreatePmRuleInput {
  id?: string;
  title: string;
  assetCode: string;
  intervalDays: number;
  priority?: 'P1' | 'P2' | 'P3';
  nextDueDays?: number;
}

export async function createPmRule(
  db: Db,
  ctx: AuthContext,
  input: CreatePmRuleInput,
): Promise<PmRuleRow> {
  const now = new Date();
  const nextDue = new Date(now.getTime() + (input.nextDueDays ?? input.intervalDays) * 24 * 3600 * 1000);

  return db.transaction(async (tx) => {
    const ruleId = input.id || await nextNumber(tx, ctx.orgId, 'PM', now.getFullYear());

    const [rule] = await tx
      .insert(pmRules)
      .values({
        organizationId: ctx.orgId,
        id: ruleId,
        title: input.title.slice(0, 200),
        assetCode: input.assetCode,
        intervalDays: input.intervalDays,
        priority: input.priority ?? 'P2',
        status: 'ACTIVE',
        nextDueAt: nextDue,
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'PM_RULE_CREATE',
      entityType: 'pm_rule',
      entityId: ruleId,
      after: { title: rule.title, intervalDays: rule.intervalDays },
    });

    return toPmRuleDto(rule, now);
  });
}

export async function togglePmRule(
  db: Db,
  ctx: AuthContext,
  id: string,
  targetStatus: 'ACTIVE' | 'PAUSED',
): Promise<PmRuleRow> {
  const [updated] = await db
    .update(pmRules)
    .set({ status: targetStatus })
    .where(and(eq(pmRules.organizationId, ctx.orgId), eq(pmRules.id, id)))
    .returning();

  if (!updated) throw notFound('PM_RULE', id);

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: `PM_RULE_${targetStatus}`,
    entityType: 'pm_rule',
    entityId: id,
    after: { status: targetStatus },
  });

  return toPmRuleDto(updated);
}

export async function generatePmWorkOrder(
  db: Db,
  ctx: AuthContext,
  ruleId: string,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<{ rule: PmRuleRow; wo: WoRow }> {
  const exec = async (tx: Tx): Promise<{ rule: PmRuleRow; wo: WoRow }> => {
    const rules = await tx
      .select()
      .from(pmRules)
      .where(and(eq(pmRules.organizationId, ctx.orgId), eq(pmRules.id, ruleId)))
      .limit(1);

    if (!rules[0]) throw notFound('PM_RULE', ruleId);
    const rule = rules[0];

    if (rule.status === 'PAUSED') {
      throw new DomainError(422, 'RULE_PAUSED',
          `Cannot generate work order from paused rule ${ruleId}`);
    }

    const now = new Date();
    const year = now.getFullYear();
    const woNumber = await nextNumber(tx, ctx.orgId, 'WO', year);
    const priority = rule.priority as 'P1' | 'P2' | 'P3';
    const dueAt = new Date(now.getTime() + SLA_WINDOW_MS[priority]);

    const [wo] = await tx
      .insert(workOrders)
      .values({
        organizationId: ctx.orgId,
        number: woNumber,
        title: `Scheduled PM: ${rule.title}`,
        assetCode: rule.assetCode,
        location: rule.assetCode,
        priority,
        status: 'SCHEDULED',
        slaDueAt: dueAt,
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
      toStatus: 'SCHEDULED',
      reason: `Automated PM generation from rule ${rule.id}`,
      requestId: opts.requestId ?? null,
    });

    const nextDue = new Date(now.getTime() + rule.intervalDays * 24 * 3600 * 1000);
    const [updatedRule] = await tx
      .update(pmRules)
      .set({
        lastGeneratedAt: now,
        nextDueAt: nextDue,
      })
      .where(and(eq(pmRules.organizationId, ctx.orgId), eq(pmRules.id, ruleId)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'PM_GENERATE_WO',
      entityType: 'pm_rule',
      entityId: ruleId,
      after: {
        generatedWoNumber: woNumber,
        nextDueAt: nextDue.toISOString(),
      },
    });

    return {
      rule: toPmRuleDto(updatedRule, now),
      wo: {
        number: wo.number,
        title: wo.title,
        location: wo.location,
        assetCode: wo.assetCode,
        priority: wo.priority as WoRow['priority'],
        status: 'SCHEDULED',
        statusLabel: 'SCHEDULED',
        slaLabel: slaLabel(wo.slaDueAt, now),
        slaDueAt: wo.slaDueAt ? wo.slaDueAt.toISOString() : null,
        tech: null,
        holdReason: null,
        description: null,
        lotoRequired: false,
        isTerminal: false,
        updatedAt: wo.updatedAt.toISOString(),
      },
    };
  };

  const key = opts.idempotencyKey
    ?? `auto:pm-generate:${ruleId}:${new Date().toISOString().slice(0, 10)}`;
  const hash = requestHash({ ruleId });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, key, 'pm.generate', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}
