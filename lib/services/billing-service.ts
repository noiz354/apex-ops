import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { assets, auditEvents, organizations, subscriptions, users } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';

export function isBillingDemoMode(): boolean {
  return (process.env.BILLING_DEMO_MODE ?? '').toLowerCase() === 'true';
}

export type PlanType = 'COMMUNITY' | 'GROWTH' | 'ENTERPRISE';
export type SubStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';

export interface PlanEntitlements {
  maxAssets: number;
  maxUsers: number;
  hasScadaTelemetry: boolean;
  hasMerkleAuditProof: boolean;
  hasCustomChecklists: boolean;
  hasProcurementMatch: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanEntitlements> = {
  COMMUNITY: {
    maxAssets: 25,
    maxUsers: 5,
    hasScadaTelemetry: false,
    hasMerkleAuditProof: false,
    hasCustomChecklists: false,
    hasProcurementMatch: false,
  },
  GROWTH: {
    maxAssets: 250,
    maxUsers: 25,
    hasScadaTelemetry: true,
    hasMerkleAuditProof: false,
    hasCustomChecklists: true,
    hasProcurementMatch: true,
  },
  ENTERPRISE: {
    maxAssets: 100000,
    maxUsers: 10000,
    hasScadaTelemetry: true,
    hasMerkleAuditProof: true,
    hasCustomChecklists: true,
    hasProcurementMatch: true,
  },
};

export interface SubscriptionDetails {
  organizationId: string;
  plan: PlanType;
  status: SubStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  entitlements: PlanEntitlements;
  usage: {
    totalAssets: number;
    totalUsers: number;
  };
}

export async function getOrganizationSubscription(
  db: Db,
  orgId: string,
): Promise<SubscriptionDetails> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .limit(1);

  const [assetCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assets)
    .where(eq(assets.organizationId, orgId));

  const [userCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.organizationId, orgId));

  const plan = (sub?.plan as PlanType) || 'COMMUNITY';
  const status = (sub?.status as SubStatus) || 'ACTIVE';

  return {
    organizationId: orgId,
    plan,
    status,
    currentPeriodEnd: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    entitlements: PLAN_LIMITS[plan],
    usage: {
      totalAssets: assetCount?.count ?? 0,
      totalUsers: userCount?.count ?? 0,
    },
  };
}

export async function createCheckoutSession(
  db: Db,
  ctx: AuthContext,
  targetPlan: PlanType,
  successUrl: string,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  if (targetPlan !== 'COMMUNITY' && isBillingDemoMode()) {
    return createDemoCheckoutSession(db, ctx, targetPlan, successUrl);
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new DomainError(
      503,
      'BILLING_NOT_CONFIGURED',
      'Subscription checkout is not configured (STRIPE_SECRET_KEY missing)',
    );
  }
  if (targetPlan === 'COMMUNITY') {
    throw new DomainError(400, 'BILLING_INVALID_PLAN', 'COMMUNITY is the default plan and needs no checkout');
  }
  const priceId =
    targetPlan === 'GROWTH' ? process.env.STRIPE_PRICE_GROWTH : process.env.STRIPE_PRICE_ENTERPRISE;
  if (!priceId) {
    throw new DomainError(
      503,
      'BILLING_PRICE_UNCONFIGURED',
      `No Stripe price configured for plan ${targetPlan}`,
    );
  }

  const params = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: successUrl,
    client_reference_id: ctx.orgId,
    'metadata[organizationId]': ctx.orgId,
    'metadata[plan]': targetPlan,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new DomainError(502, 'BILLING_PROVIDER_ERROR', `Stripe checkout failed (HTTP ${res.status})`);
  }
  const session = (await res.json()) as { id?: string; url?: string };
  if (!session.id || !session.url) {
    throw new DomainError(502, 'BILLING_PROVIDER_ERROR', 'Stripe returned a malformed checkout session');
  }

  await db
    .insert(subscriptions)
    .values({
      organizationId: ctx.orgId,
      plan: targetPlan,
      status: 'TRIALING',
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000), // 14-day trial
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        plan: targetPlan,
        status: 'TRIALING',
        updatedAt: new Date(),
      },
    });

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'BILLING_CHECKOUT_INITIATED',
    entityType: 'subscription',
    entityId: ctx.orgId,
    after: { targetPlan, sessionId: session.id },
  });

  return { checkoutUrl: session.url, sessionId: session.id };
}

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      customer?: string;
      subscription?: string;
      metadata?: { organizationId?: string; plan?: string };
      status?: string;
      cancel_at_period_end?: boolean;
      current_period_end?: number;
    };
  };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): void {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new DomainError(
      503,
      'BILLING_NOT_CONFIGURED',
      'Stripe webhook is not configured (STRIPE_WEBHOOK_SECRET missing)',
    );
  }
  if (!signatureHeader) {
    throw new DomainError(401, 'BILLING_SIGNATURE_MISSING', 'Missing stripe-signature header');
  }
  const parts = signatureHeader.split(',').reduce((acc, curr) => {
    const [k, v] = curr.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {} as Record<string, string>);

  if (!parts.t || !parts.v1) {
    throw new DomainError(400, 'BILLING_BAD_SIGNATURE', 'Malformed stripe-signature header');
  }
  const hmac = createHmac('sha256', webhookSecret);
  hmac.update(`${parts.t}.${rawBody}`);
  const digest = hmac.digest('hex');
  const a = Buffer.from(parts.v1, 'utf8');
  const b = Buffer.from(digest, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new DomainError(400, 'BILLING_BAD_SIGNATURE', 'Invalid webhook signature');
  }
}

export async function processStripeWebhook(
  db: Db,
  rawBody: string,
  signatureHeader?: string | null,
): Promise<{ status: string; processed: boolean; replayed?: boolean }> {
  verifyWebhookSignature(rawBody, signatureHeader);

  let event: WebhookEventPayload;
  try {
    event = JSON.parse(rawBody) as WebhookEventPayload;
  } catch {
    throw new DomainError(400, 'BILLING_BAD_PAYLOAD', 'Webhook body is not valid JSON');
  }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) {
    throw new DomainError(400, 'BILLING_BAD_PAYLOAD', 'Webhook body is not a Stripe event');
  }

  const obj = event.data.object;
  const orgId = obj.metadata?.organizationId;
  if (!orgId) {
    return { status: 'ignored_no_org', processed: false };
  }

  const hash = requestHash(event);
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, orgId, event.id, 'stripe.webhook', hash, async () => {
      const body = await execWebhookEvent(tx, event);
      return { status: 200, body };
    });
    return { ...res.body, replayed: res.replayed };
  });
}

async function execWebhookEvent(
  tx: Tx,
  event: WebhookEventPayload,
): Promise<{ status: string; processed: boolean }> {
  const obj = event.data.object;
  const orgId = obj.metadata?.organizationId as string;
  const plan = (obj.metadata?.plan as PlanType) || 'ENTERPRISE';

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const periodEnd = obj.current_period_end
        ? new Date(obj.current_period_end * 1000)
        : new Date(Date.now() + 30 * 24 * 3600 * 1000);

      await tx
        .insert(subscriptions)
        .values({
          organizationId: orgId,
          stripeCustomerId: obj.customer ?? null,
          stripeSubscriptionId: obj.subscription ?? obj.id,
          plan,
          status: 'ACTIVE',
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: subscriptions.organizationId,
          set: {
            plan,
            status: 'ACTIVE',
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
            updatedAt: new Date(),
          },
        });

      await tx
        .update(organizations)
        .set({ plan })
        .where(eq(organizations.id, orgId));

      await tx.insert(auditEvents).values({
        organizationId: orgId,
        actorName: 'stripe_webhook',
        action: 'SUBSCRIPTION_ACTIVATED',
        entityType: 'subscription',
        entityId: orgId,
        after: { eventId: event.id, plan, status: 'ACTIVE' },
      });

      return { status: 'subscription_updated', processed: true };
    }

    case 'invoice.payment_failed': {
      await tx
        .update(subscriptions)
        .set({ status: 'PAST_DUE', updatedAt: new Date() })
        .where(eq(subscriptions.organizationId, orgId));

      await tx.insert(auditEvents).values({
        organizationId: orgId,
        actorName: 'stripe_webhook',
        action: 'SUBSCRIPTION_PAYMENT_FAILED',
        entityType: 'subscription',
        entityId: orgId,
        after: { eventId: event.id, status: 'PAST_DUE' },
      });

      return { status: 'past_due_flagged', processed: true };
    }

    case 'customer.subscription.deleted': {
      await tx
        .update(subscriptions)
        .set({ plan: 'COMMUNITY', status: 'CANCELED', updatedAt: new Date() })
        .where(eq(subscriptions.organizationId, orgId));

      await tx
        .update(organizations)
        .set({ plan: 'COMMUNITY' })
        .where(eq(organizations.id, orgId));

      await tx.insert(auditEvents).values({
        organizationId: orgId,
        actorName: 'stripe_webhook',
        action: 'SUBSCRIPTION_CANCELED',
        entityType: 'subscription',
        entityId: orgId,
        after: { eventId: event.id, plan: 'COMMUNITY', status: 'CANCELED' },
      });

      return { status: 'downgraded_to_community', processed: true };
    }

    default:
      return { status: 'unhandled_event', processed: false };
  }
}

async function createDemoCheckoutSession(
  db: Db,
  ctx: AuthContext,
  targetPlan: PlanType,
  successUrl: string,
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const orgSuffix = ctx.orgId.replace(/-/g, '').slice(0, 8);
  const sessionId = `cs_demo_${targetPlan.toLowerCase()}_${orgSuffix}`;
  const checkoutUrl = `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${sessionId}`;

  await db
    .insert(subscriptions)
    .values({
      organizationId: ctx.orgId,
      plan: targetPlan,
      status: 'TRIALING',
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000), // 14-day trial
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        plan: targetPlan,
        status: 'TRIALING',
        updatedAt: new Date(),
      },
    });

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'BILLING_CHECKOUT_INITIATED',
    entityType: 'subscription',
    entityId: ctx.orgId,
    after: { targetPlan, sessionId, demo: true },
  });

  return { checkoutUrl, sessionId };
}
