import { and, asc, eq, notInArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents, workOrders } from '../../db/schema';
import { WO_TERMINAL } from '../domain/work-orders';
import type { AuthContext } from '../auth/session';
import { log } from '../log';

export interface VendorEscalationInput {
  vendorSlug: string;
  vendorName: string;
  workOrderNumber: string;
  reason: string;
  slaMinutesRemaining: number;
  contactEmail?: string;
  contactPhone?: string;
}

export interface SlaNotificationItem {
  id: string;
  type: 'sla_breach_threat' | 'p1_critical' | 'stock_alert';
  severity: 'P1' | 'P2' | 'P3';
  title: string;
  subtitle: string;
  minutesRemaining: number | null;
  woNumber?: string;
  createdAt: string;
}

export async function computeSlaNotifications(
  db: Db,
  orgId: string,
): Promise<SlaNotificationItem[]> {
  const now = new Date();
  const activeWos = await db
    .select({
      number: workOrders.number,
      title: workOrders.title,
      priority: workOrders.priority,
      status: workOrders.status,
      slaDueAt: workOrders.slaDueAt,
      location: workOrders.location,
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
    .limit(20);

  const items: SlaNotificationItem[] = [];
  for (const wo of activeWos) {
    if (!wo.slaDueAt) continue;
    const minutesRemaining = Math.round((wo.slaDueAt.getTime() - now.getTime()) / (60 * 1000));
    if (minutesRemaining <= 240) {
      items.push({
        id: `NOTIF-${wo.number}`,
        type: 'sla_breach_threat',
        severity: (wo.priority as 'P1' | 'P2' | 'P3') ?? 'P2',
        title: `${wo.number} · SLA At Risk (${minutesRemaining > 0 ? `${minutesRemaining}m remaining` : `${Math.abs(minutesRemaining)}m overdue`})`,
        subtitle: `${wo.title} · Location: ${wo.location} · Assigned: ${wo.assignedTo || 'Unassigned'}`,
        minutesRemaining,
        woNumber: wo.number,
        createdAt: now.toISOString(),
      });
    }
  }
  return items;
}

export async function sendVendorEscalation(
  db: Db,
  ctx: AuthContext,
  input: VendorEscalationInput,
): Promise<{ status: 'queued'; messageId: string }> {
  const messageId = `msg_esc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  log('info', 'vendor_escalation_dispatched', {
    messageId,
    orgId: ctx.orgId,
    vendorSlug: input.vendorSlug,
    woNumber: input.workOrderNumber,
    reason: input.reason,
    slaMinutesRemaining: input.slaMinutesRemaining,
  });

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'VENDOR_ESCALATE_ALERT',
    entityType: 'vendor',
    entityId: input.vendorSlug,
    after: {
      messageId,
      woNumber: input.workOrderNumber,
      vendorName: input.vendorName,
      slaRemaining: input.slaMinutesRemaining,
      reason: input.reason,
    },
  });

  if (input.reason?.includes('P1') || input.slaMinutesRemaining <= 30) {
    try {
      const { sendP1PushToUser } = await import('@/lib/push/push-service');
      await sendP1PushToUser(ctx.orgId, ctx.userId, {
        title: `[P1] ${input.vendorName} — ${input.workOrderNumber}`,
        body: `SLA breach: ${input.reason}. ${input.slaMinutesRemaining}m remaining. Tanggung jawab: ${input.vendorName}.`,
        url: `/work-orders/${input.workOrderNumber}`,
      });
    } catch (err) {
      console.warn('[escalate] P1 push fanout failed (non-blocking):', (err as Error)?.message);
    }
  }

  return { status: 'queued', messageId };
}
