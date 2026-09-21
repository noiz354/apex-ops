import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents, evidence, woTasks, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';

export interface WoTaskRow {
  id: string;
  workOrderNumber: string;
  stepOrder: number;
  title: string;
  instruction: string;
  status: 'LOCKED' | 'PENDING' | 'IN_PROGRESS' | 'DONE';
  requiresPhoto: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface EvidenceRow {
  id: string;
  workOrderNumber: string;
  taskId: string | null;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  uploadedBy: string;
  createdAt: string;
}

export async function listWoTasks(db: Db, ctx: AuthContext, woNumber: string): Promise<WoTaskRow[]> {
  const rows = await db
    .select()
    .from(woTasks)
    .where(and(eq(woTasks.organizationId, ctx.orgId), eq(woTasks.workOrderNumber, woNumber)))
    .orderBy(asc(woTasks.stepOrder));

  return rows.map((r) => ({
    id: r.id,
    workOrderNumber: r.workOrderNumber,
    stepOrder: r.stepOrder,
    title: r.title,
    instruction: r.instruction,
    status: r.status as WoTaskRow['status'],
    requiresPhoto: r.requiresPhoto,
    verifiedBy: r.verifiedBy,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listWoEvidence(db: Db, ctx: AuthContext, woNumber: string): Promise<EvidenceRow[]> {
  const rows = await db
    .select()
    .from(evidence)
    .where(and(eq(evidence.organizationId, ctx.orgId), eq(evidence.workOrderNumber, woNumber)))
    .orderBy(asc(evidence.createdAt));

  return rows.map((r) => ({
    id: r.id,
    workOrderNumber: r.workOrderNumber,
    taskId: r.taskId,
    fileName: r.fileName,
    filePath: r.filePath,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    sha256Hash: r.sha256Hash,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface UpdateTaskInput {
  taskId: string;
  woNumber: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
}

export async function updateWoTask(db: Db, ctx: AuthContext, input: UpdateTaskInput): Promise<WoTaskRow> {
  return db.transaction(async (tx) => {
    const taskRows = await tx
      .select()
      .from(woTasks)
      .where(and(
        eq(woTasks.organizationId, ctx.orgId),
        eq(woTasks.workOrderNumber, input.woNumber),
        eq(woTasks.id, input.taskId),
      ))
      .limit(1);

    if (!taskRows[0]) {
      throw notFound('TASK', input.taskId);
    }

    const currentTask = taskRows[0];

    if (input.status === 'DONE') {
      const priorIncomplete = await tx
        .select()
        .from(woTasks)
        .where(and(
          eq(woTasks.organizationId, ctx.orgId),
          eq(woTasks.workOrderNumber, input.woNumber),
          sql`${woTasks.stepOrder} < ${currentTask.stepOrder}`,
          sql`${woTasks.status} != 'DONE'`,
        ))
        .limit(1);

      if (priorIncomplete.length > 0) {
        throw new DomainError(422, 'SEQUENCE_VIOLATION',
          `Step ${priorIncomplete[0].stepOrder} must be completed before Step ${currentTask.stepOrder}`);
      }

      if (currentTask.requiresPhoto) {
        const ev = await tx
          .select()
          .from(evidence)
          .where(and(
            eq(evidence.organizationId, ctx.orgId),
            eq(evidence.workOrderNumber, input.woNumber),
            eq(evidence.taskId, input.taskId),
          ))
          .limit(1);

        if (ev.length === 0) {
          throw new DomainError(422, 'PHOTO_REQUIRED',
          `Photo evidence required before completing Step ${currentTask.stepOrder} (${currentTask.title})`);
        }
      }
    }

    const now = new Date();
    const updated = await tx
      .update(woTasks)
      .set({
        status: input.status,
        verifiedBy: input.status === 'DONE' ? ctx.name : null,
        verifiedAt: input.status === 'DONE' ? now : null,
      })
      .where(and(
        eq(woTasks.organizationId, ctx.orgId),
        eq(woTasks.id, input.taskId),
      ))
      .returning();

    if (input.status === 'DONE') {
      await tx
        .update(woTasks)
        .set({ status: 'PENDING' })
        .where(and(
          eq(woTasks.organizationId, ctx.orgId),
          eq(woTasks.workOrderNumber, input.woNumber),
          eq(woTasks.stepOrder, currentTask.stepOrder + 1),
          eq(woTasks.status, 'LOCKED'),
        ));
    }

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'WO_TASK_UPDATE',
      entityType: 'work_order_task',
      entityId: input.taskId,
      before: { status: currentTask.status },
      after: {
        status: input.status,
        stepOrder: currentTask.stepOrder,
        woNumber: input.woNumber,
        verifiedBy: ctx.name,
      },
    });

    const res = updated[0];
    return {
      id: res.id,
      workOrderNumber: res.workOrderNumber,
      stepOrder: res.stepOrder,
      title: res.title,
      instruction: res.instruction,
      status: res.status as WoTaskRow['status'],
      requiresPhoto: res.requiresPhoto,
      verifiedBy: res.verifiedBy,
      verifiedAt: res.verifiedAt ? res.verifiedAt.toISOString() : null,
      createdAt: res.createdAt.toISOString(),
    };
  });
}

export interface AddEvidenceInput {
  workOrderNumber: string;
  taskId?: string | null;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
}

export async function addEvidence(db: Db, ctx: AuthContext, input: AddEvidenceInput): Promise<EvidenceRow> {
  const { randomBytes } = await import('node:crypto');
  const id = `ev-${Date.now()}-${randomBytes(4).toString('hex')}`;

  const inserted = await db.insert(evidence).values({
    organizationId: ctx.orgId,
    id,
    workOrderNumber: input.workOrderNumber,
    taskId: input.taskId ?? null,
    fileName: input.fileName,
    filePath: input.filePath,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    sha256Hash: input.sha256Hash,
    uploadedBy: ctx.name,
  }).returning();

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'EVIDENCE_UPLOAD',
    entityType: 'evidence',
    entityId: id,
    after: {
      workOrderNumber: input.workOrderNumber,
      taskId: input.taskId ?? null,
      fileName: input.fileName,
      sha256Hash: input.sha256Hash,
    },
  });

  const r = inserted[0];
  return {
    id: r.id,
    workOrderNumber: r.workOrderNumber,
    taskId: r.taskId,
    fileName: r.fileName,
    filePath: r.filePath,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    sha256Hash: r.sha256Hash,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface AddTaskInput {
  woNumber: string;
  title: string;
  instruction?: string | null;
  requiresPhoto?: boolean;
}

export async function addWoTask(db: Db, ctx: AuthContext, input: AddTaskInput): Promise<WoTaskRow> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 160) {
    throw new DomainError(400, 'VALIDATION_ERROR', 'Task title must be 3–160 characters');
  }
  const instruction = (input.instruction ?? '').trim().slice(0, 500);

  return db.transaction(async (tx) => {
    const wo = await tx
      .select({ number: workOrders.number })
      .from(workOrders)
      .where(and(eq(workOrders.organizationId, ctx.orgId), eq(workOrders.number, input.woNumber)))
      .limit(1);
    if (!wo[0]) throw notFound('WORK_ORDER', input.woNumber);

    const maxRow = await tx
      .select({ maxOrder: sql<number>`coalesce(max(${woTasks.stepOrder}), 0)` })
      .from(woTasks)
      .where(and(eq(woTasks.organizationId, ctx.orgId), eq(woTasks.workOrderNumber, input.woNumber)));
    const stepOrder = Number(maxRow[0]?.maxOrder ?? 0) + 1;

    const { randomBytes } = await import('node:crypto');
    const id = `WOTSK-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

    const inserted = await tx
      .insert(woTasks)
      .values({
        organizationId: ctx.orgId,
        id,
        workOrderNumber: input.woNumber,
        stepOrder,
        title,
        instruction,
        status: 'PENDING',
        requiresPhoto: input.requiresPhoto ?? false,
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'WO_TASK_ADD',
      entityType: 'work_order_task',
      entityId: id,
      after: {
        woNumber: input.woNumber,
        stepOrder,
        title,
        requiresPhoto: input.requiresPhoto ?? false,
      },
    });

    const r = inserted[0];
    return {
      id: r.id,
      workOrderNumber: r.workOrderNumber,
      stepOrder: r.stepOrder,
      title: r.title,
      instruction: r.instruction,
      status: r.status as WoTaskRow['status'],
      requiresPhoto: r.requiresPhoto,
      verifiedBy: r.verifiedBy,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
