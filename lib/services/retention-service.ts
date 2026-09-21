import { and, asc, eq, isNotNull, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { pmRules, workOrders } from '../../db/schema';
import { WO_TERMINAL } from '../../lib/domain/work-orders';

export const RETENTION_DIGEST_SUNSET = '2026-12-15';
export const RETENTION_DIGEST_NOTE =
  'Deprecated: orphaned endpoint — no trigger, scheduler, cron, or consumer exists (nor is any planned); it will not be developed further and will be removed on the sunset date.';

export interface RetentionDigest {
  organizationId: string;
  generatedAt: string;
  urgentSlaThreats: {
    woNumber: string;
    title: string;
    priority: string;
    minutesRemaining: number;
    assignedTo: string | null;
  }[];
  upcomingPreventiveMaintenances: {
    ruleId: string;
    title: string;
    assetCode: string;
    nextDueAt: string;
    daysRemaining: number;
  }[];
  healthScorePct: number;
}

export async function generateRetentionDigest(
  db: Db,
  orgId: string,
): Promise<RetentionDigest> {
  const now = new Date();

  const activeWos = await db
    .select({
      number: workOrders.number,
      title: workOrders.title,
      priority: workOrders.priority,
      slaDueAt: workOrders.slaDueAt,
      assignedTo: workOrders.assignedTo,
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.organizationId, orgId),
        notInArray(workOrders.status, [...WO_TERMINAL]),
        isNotNull(workOrders.slaDueAt),
      ),
    )
    .orderBy(asc(workOrders.slaDueAt))
    .limit(10);

  const urgentSlaThreats = activeWos
    .filter((w) => w.slaDueAt && w.slaDueAt.getTime() - now.getTime() <= 240 * 60 * 1000)
    .map((w) => ({
      woNumber: w.number,
      title: w.title,
      priority: w.priority,
      minutesRemaining: Math.round((w.slaDueAt!.getTime() - now.getTime()) / (60 * 1000)),
      assignedTo: w.assignedTo,
    }));

  const upcomingPms = await db
    .select({
      id: pmRules.id,
      title: pmRules.title,
      assetCode: pmRules.assetCode,
      nextDueAt: pmRules.nextDueAt,
    })
    .from(pmRules)
    .where(and(eq(pmRules.organizationId, orgId), eq(pmRules.status, 'ACTIVE')))
    .orderBy(asc(pmRules.nextDueAt))
    .limit(5);

  const upcomingPreventiveMaintenances = upcomingPms.map((pm) => ({
    ruleId: pm.id,
    title: pm.title,
    assetCode: pm.assetCode,
    nextDueAt: pm.nextDueAt.toISOString(),
    daysRemaining: Math.max(0, Math.round((pm.nextDueAt.getTime() - now.getTime()) / (24 * 3600 * 1000))),
  }));

  const healthScorePct = Math.max(70, 100 - urgentSlaThreats.length * 5);

  return {
    organizationId: orgId,
    generatedAt: now.toISOString(),
    urgentSlaThreats,
    upcomingPreventiveMaintenances,
    healthScorePct,
  };
}
