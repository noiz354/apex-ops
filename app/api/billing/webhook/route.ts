import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { processStripeWebhook } from '@/lib/services/billing-service';

export async function POST(req: NextRequest) {
  return withRoute({ op: 'billing.webhook', method: 'POST', public: true }, req, async () => {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    const result = await processStripeWebhook(getDb(), rawBody, signature);
    return { data: result };
  });
}
