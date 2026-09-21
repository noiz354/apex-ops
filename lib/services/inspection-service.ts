import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, findings, inspections, workOrderEvents, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';
import { SLA_WINDOW_MS, slaLabel } from '../domain/work-orders';
import type { WoRow } from './wo-service';
import { requestHash, withIdempotency } from './idempotency';
import { nextNumber } from './sequence';

export interface InspectionRow {
  number: string;
  title: string;
  auditorName: string;
  progressPct: number;
  status: string;
  createdAt: string;
}

export interface FindingRow {
  number: string;
  title: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR';
  status: 'OPEN' | 'CONVERTED' | 'DISMISSED';
  inspectionNumber: string | null;
  assetCode: string | null;
  convertedWoNumber: string | null;
  createdAt: string;
}

export async function listInspections(db: Db, ctx: AuthContext): Promise<InspectionRow[]> {
  const rows = await db
    .select()
    .from(inspections)
    .where(eq(inspections.organizationId, ctx.orgId))
    .orderBy(desc(inspections.createdAt));

  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    auditorName: r.auditorName,
    progressPct: r.progressPct,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getInspection(db: Db, ctx: AuthContext, number: string): Promise<InspectionRow> {
  const rows = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.organizationId, ctx.orgId), eq(inspections.number, number)))
    .limit(1);

  if (!rows[0]) throw notFound('INSPECTION', number);
  const r = rows[0];
  return {
    number: r.number,
    title: r.title,
    auditorName: r.auditorName,
    progressPct: r.progressPct,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface CreateInspectionInput {
  title: string;
  auditorName?: string;
  year?: number;
}

export async function createInspection(
  db: Db,
  ctx: AuthContext,
  input: CreateInspectionInput,
): Promise<InspectionRow> {
  const year = input.year ?? new Date().getFullYear();
  return db.transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.orgId, 'INS', year);
    const [ins] = await tx
      .insert(inspections)
      .values({
        organizationId: ctx.orgId,
        number,
        title: input.title.slice(0, 200),
        auditorName: input.auditorName ?? ctx.name,
        progressPct: 0,
        status: 'SCHEDULED',
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'INSPECTION_CREATE',
      entityType: 'inspection',
      entityId: number,
      after: { title: ins.title, auditorName: ins.auditorName },
    });

    return {
      number: ins.number,
      title: ins.title,
      auditorName: ins.auditorName,
      progressPct: ins.progressPct,
      status: ins.status,
      createdAt: ins.createdAt.toISOString(),
    };
  });
}

export async function updateInspectionProgress(
  db: Db,
  ctx: AuthContext,
  number: string,
  progressPct: number,
  status?: string,
  opts: { requestId?: string; verdict?: 'FAIL' | 'PASS-OVERRIDE' | null } = {},
): Promise<InspectionRow> {
  const validatedProgress = Math.max(0, Math.min(100, Math.round(progressPct)));
  const nextStatus = status ?? (validatedProgress === 100 ? 'COMPLETED' : 'IN_PROGRESS');

  return db.transaction(async (tx) => {
    const before = await tx
      .select()
      .from(inspections)
      .where(and(eq(inspections.organizationId, ctx.orgId), eq(inspections.number, number)))
      .limit(1);

    if (!before[0]) throw notFound('INSPECTION', number);

    const [updated] = await tx
      .update(inspections)
      .set({
        progressPct: validatedProgress,
        status: nextStatus,
      })
      .where(and(eq(inspections.organizationId, ctx.orgId), eq(inspections.number, number)))
      .returning();

    if (opts.verdict === 'PASS-OVERRIDE') {
      await tx.insert(auditEvents).values({
        organizationId: ctx.orgId,
        actorUserId: ctx.userId,
        actorName: ctx.name,
        action: 'INSPECTION_PASS_OVERRIDE',
        entityType: 'inspection',
        entityId: number,
        before: { progressPct: before[0].progressPct, status: before[0].status },
        after: { progressPct: updated.progressPct, status: updated.status, verdict: 'PASS-OVERRIDE', countersign: 'none — self-assessed (supervisor PIN retired with GAP-3 step-up)' },
        requestId: opts.requestId ?? null,
      });
    }

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'INSPECTION_PROGRESS',
      entityType: 'inspection',
      entityId: number,
      before: { progressPct: before[0].progressPct, status: before[0].status },
      after: { progressPct: updated.progressPct, status: updated.status, ...(opts.verdict ? { verdict: opts.verdict } : {}) },
      requestId: opts.requestId ?? null,
    });

    return {
      number: updated.number,
      title: updated.title,
      auditorName: updated.auditorName,
      progressPct: updated.progressPct,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  });
}

export async function forceDispatchInspection(
  db: Db,
  ctx: AuthContext,
  number: string,
  input: { reason?: string } = {},
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<InspectionRow> {
  const exec = async (tx: Tx): Promise<InspectionRow> => {
    const rows = await tx
      .select()
      .from(inspections)
      .where(and(eq(inspections.organizationId, ctx.orgId), eq(inspections.number, number)))
      .limit(1);

    if (!rows[0]) throw notFound('INSPECTION', number);
    const cur = rows[0];

    if (cur.status === 'COMPLETED') {
      throw new DomainError(409, 'ALREADY_COMPLETED',
        `Inspection ${number} is already COMPLETED and cannot be re-dispatched`);
    }

    const [updated] = await tx
      .update(inspections)
      .set({ status: 'IN_PROGRESS' })
      .where(and(eq(inspections.organizationId, ctx.orgId), eq(inspections.number, number)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'INSPECTION_FORCE_DISPATCH',
      entityType: 'inspection',
      entityId: number,
      before: { progressPct: cur.progressPct, status: cur.status },
      after: { progressPct: updated.progressPct, status: updated.status, reason: input.reason ?? null },
      requestId: opts.requestId ?? null,
    });

    return {
      number: updated.number,
      title: updated.title,
      auditorName: updated.auditorName,
      progressPct: updated.progressPct,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash({ number, reason: input.reason ?? null });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'inspection.force_dispatch', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}

export async function listFindings(
  db: Db,
  ctx: AuthContext,
  filter?: { inspectionNumber?: string; status?: string },
): Promise<FindingRow[]> {
  const conditions = [eq(findings.organizationId, ctx.orgId)];
  if (filter?.inspectionNumber) {
    conditions.push(eq(findings.inspectionNumber, filter.inspectionNumber));
  }
  if (filter?.status) {
    conditions.push(eq(findings.status, filter.status));
  }

  const rows = await db
    .select()
    .from(findings)
    .where(and(...conditions))
    .orderBy(desc(findings.createdAt));

  return rows.map((r) => ({
    number: r.number,
    title: r.title,
    severity: r.severity as FindingRow['severity'],
    status: r.status as FindingRow['status'],
    inspectionNumber: r.inspectionNumber,
    assetCode: r.assetCode,
    convertedWoNumber: r.convertedWoNumber,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getFinding(db: Db, ctx: AuthContext, number: string): Promise<FindingRow> {
  const rows = await db
    .select()
    .from(findings)
    .where(and(eq(findings.organizationId, ctx.orgId), eq(findings.number, number)))
    .limit(1);

  if (!rows[0]) throw notFound('FINDING', number);
  const r = rows[0];
  return {
    number: r.number,
    title: r.title,
    severity: r.severity as FindingRow['severity'],
    status: r.status as FindingRow['status'],
    inspectionNumber: r.inspectionNumber,
    assetCode: r.assetCode,
    convertedWoNumber: r.convertedWoNumber,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface CreateFindingInput {
  title: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MODERATE' | 'MINOR';
  inspectionNumber?: string | null;
  assetCode?: string | null;
  extra?: { description?: string | null; zone?: string | null };
}

export async function createFinding(
  db: Db,
  ctx: AuthContext,
  input: CreateFindingInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<FindingRow> {
  const year = new Date().getFullYear();
  const exec = async (tx: Tx): Promise<FindingRow> => {
    const number = await nextNumber(tx, ctx.orgId, 'FND', year);
    const [fnd] = await tx
      .insert(findings)
      .values({
        organizationId: ctx.orgId,
        number,
        title: input.title.slice(0, 200),
        severity: input.severity,
        status: 'OPEN',
        inspectionNumber: input.inspectionNumber ?? null,
        assetCode: input.assetCode ?? null,
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'FINDING_CREATE',
      entityType: 'finding',
      entityId: number,
      after: {
        title: fnd.title,
        severity: fnd.severity,
        assetCode: fnd.assetCode,
        inspectionNumber: fnd.inspectionNumber,
        description: input.extra?.description ?? null,
        zone: input.extra?.zone ?? null,
      },
    });

    return {
      number: fnd.number,
      title: fnd.title,
      severity: fnd.severity as FindingRow['severity'],
      status: fnd.status as FindingRow['status'],
      inspectionNumber: fnd.inspectionNumber,
      assetCode: fnd.assetCode,
      convertedWoNumber: fnd.convertedWoNumber,
      createdAt: fnd.createdAt.toISOString(),
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash(input);
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'finding.create', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export interface ConvertFindingInput {
  woTitle?: string;
  woPriority?: 'P1' | 'P2' | 'P3';
  location?: string;
  reason?: string;
  lotoConfirmed?: boolean;
}

export async function convertFindingToWo(
  db: Db,
  ctx: AuthContext,
  findingNumber: string,
  input: ConvertFindingInput = {},
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<{ finding: FindingRow; wo: WoRow }> {
  const exec = async (tx: Tx): Promise<{ finding: FindingRow; wo: WoRow }> => {
    const fndRows = await tx
      .select()
      .from(findings)
      .where(and(eq(findings.organizationId, ctx.orgId), eq(findings.number, findingNumber)))
      .limit(1);

    if (!fndRows[0]) throw notFound('FINDING', findingNumber);
    const fnd = fndRows[0];

    if (fnd.status === 'CONVERTED' || fnd.convertedWoNumber) {
      throw new DomainError(409, 'ALREADY_CONVERTED',
          `Finding ${findingNumber} has already been converted to ${fnd.convertedWoNumber}`);
    }

    if (input.lotoConfirmed !== true) {
      throw new DomainError(400, 'LOTO_NOT_CONFIRMED',
        `Finding ${findingNumber} conversion requires explicit LOTO confirmation (lotoConfirmed: true)`);
    }

    const now = new Date();
    const year = now.getFullYear();
    const woNumber = await nextNumber(tx, ctx.orgId, 'WO', year);
    const priority = input.woPriority ?? (fnd.severity === 'CRITICAL' ? 'P1' : 'P2');
    const dueAt = new Date(now.getTime() + SLA_WINDOW_MS[priority]);

    const [wo] = await tx
      .insert(workOrders)
      .values({
        organizationId: ctx.orgId,
        number: woNumber,
        title: (input.woTitle?.trim() || `Corrective Action: ${fnd.title}`).slice(0, 200),
        assetCode: fnd.assetCode,
        location: input.location || fnd.assetCode || 'Facility Plant',
        priority,
        status: 'OPEN',
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
      toStatus: 'OPEN',
      reason: `Auto-converted from inspection finding ${fnd.number}`,
      requestId: opts.requestId ?? null,
    });

    const [updatedFnd] = await tx
      .update(findings)
      .set({
        status: 'CONVERTED',
        convertedWoNumber: woNumber,
      })
      .where(and(eq(findings.organizationId, ctx.orgId), eq(findings.number, findingNumber)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'FINDING_CONVERT_WO',
      entityType: 'finding',
      entityId: findingNumber,
      before: { status: fnd.status },
      after: {
        status: 'CONVERTED',
        convertedWoNumber: woNumber,
        reason: input.reason ?? null,
      },
    });

    return {
      finding: {
        number: updatedFnd.number,
        title: updatedFnd.title,
        severity: updatedFnd.severity as FindingRow['severity'],
        status: updatedFnd.status as FindingRow['status'],
        inspectionNumber: updatedFnd.inspectionNumber,
        assetCode: updatedFnd.assetCode,
        convertedWoNumber: updatedFnd.convertedWoNumber,
        createdAt: updatedFnd.createdAt.toISOString(),
      },
      wo: {
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
        description: wo.description,
        lotoRequired: wo.lotoRequired,
        isTerminal: false,
        updatedAt: wo.updatedAt.toISOString(),
      },
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash({ findingNumber, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'inspection.convert', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export interface DismissFindingInput {
  justification: string;
}

function toFindingDto(r: typeof findings.$inferSelect): FindingRow {
  return {
    number: r.number,
    title: r.title,
    severity: r.severity as FindingRow['severity'],
    status: r.status as FindingRow['status'],
    inspectionNumber: r.inspectionNumber,
    assetCode: r.assetCode,
    convertedWoNumber: r.convertedWoNumber,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function dismissFinding(
  db: Db,
  ctx: AuthContext,
  findingNumber: string,
  input: DismissFindingInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<{ finding: FindingRow }> {
  const justification = input.justification?.trim() ?? '';
  if (justification.length < 10) {
    throw new DomainError(400, 'VALIDATION_ERROR',
      `Dismissal justification must be at least 10 characters (got ${justification.length})`);
  }

  const exec = async (tx: Tx): Promise<{ finding: FindingRow }> => {
    const fndRows = await tx
      .select()
      .from(findings)
      .where(and(eq(findings.organizationId, ctx.orgId), eq(findings.number, findingNumber)))
      .limit(1);

    if (!fndRows[0]) throw notFound('FINDING', findingNumber);
    const fnd = fndRows[0];

    if (fnd.status === 'CONVERTED') {
      throw new DomainError(409, 'ALREADY_CONVERTED',
        `Finding ${findingNumber} has already been converted to ${fnd.convertedWoNumber} and cannot be dismissed`);
    }
    if (fnd.status === 'DISMISSED') {
      throw new DomainError(409, 'ALREADY_DISMISSED',
        `Finding ${findingNumber} has already been dismissed`);
    }

    const [updated] = await tx
      .update(findings)
      .set({ status: 'DISMISSED' })
      .where(and(eq(findings.organizationId, ctx.orgId), eq(findings.number, findingNumber)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'FINDING_DISMISS',
      entityType: 'finding',
      entityId: findingNumber,
      before: { status: fnd.status },
      after: { status: 'DISMISSED', justification: justification.slice(0, 1000) },
      requestId: opts.requestId ?? null,
    });

    return { finding: toFindingDto(updated) };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash({ findingNumber, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'finding.dismiss', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}
