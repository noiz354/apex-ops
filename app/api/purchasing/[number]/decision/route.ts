import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { decidePurchase } from '@/lib/services/procurement-service';

const DecideSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(300).nullish().transform((v) => v ?? undefined),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withRoute({ op: 'po.decide', method: 'POST', permission: 'po.approve' }, req, async (ctx, requestId) => {
    const { number } = await params;
    const body = await req.json();
    const input = DecideSchema.parse(body);
    const row = await decidePurchase(
      getDb(),
      ctx!,
      number,
      input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { status: 200, data: row };
  });
}
