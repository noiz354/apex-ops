import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute, DomainError } from '@/lib/api/http';
import { getDb } from '@/db/client';
import {
  createCheckoutSession,
  getOrganizationSubscription,
  type PlanType,
} from '@/lib/services/billing-service';

const CheckoutSchema = z.object({
  plan: z.enum(['COMMUNITY', 'GROWTH', 'ENTERPRISE']),
  successUrl: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'billing.get', method: 'GET', permission: 'org.read' }, req, async (ctx) => {
    const sub = await getOrganizationSubscription(getDb(), ctx!.orgId);
    return { data: sub };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'billing.checkout', method: 'POST', permission: 'org.manage' }, req, async (ctx) => {
    const body = await req.json();
    const input = CheckoutSchema.parse(body);

    const defaultSuccess = `${req.nextUrl.origin}/settings?billing=success`;
    let successUrl = defaultSuccess;
    if (input.successUrl) {
      let parsed: URL;
      try {
        parsed = new URL(input.successUrl);
      } catch {
        throw new DomainError(400, 'BILLING_INVALID_URL', 'successUrl must be an absolute URL');
      }
      if (parsed.origin !== req.nextUrl.origin) {
        throw new DomainError(400, 'BILLING_INVALID_URL', 'successUrl must be same-origin');
      }
      successUrl = input.successUrl;
    }
    const res = await createCheckoutSession(
      getDb(),
      ctx!,
      input.plan as PlanType,
      successUrl,
    );

    return { status: 201, data: res };
  });
}
