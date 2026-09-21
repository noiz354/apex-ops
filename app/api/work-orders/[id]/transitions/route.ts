import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { transitionWorkOrder } from '@/lib/services/wo-service';

const TransitionSchema = z.object({
  action: z.enum(['hold', 'escalate', 'resume', 'start', 'complete', 'cancel', 'assign']),
  reason: z.string().max(500).nullish(),
  assigneeEmail: z.email().nullish(),
});

export async function POST(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'wo.transition', method: 'POST', permission: 'wo.transition' }, req, async (ctx, requestId) => {
    const { id } = await routeCtx.params;
    const input = TransitionSchema.parse(await req.json());
    const wo = await transitionWorkOrder(
      getDb(), ctx!, id, input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { data: wo };
  });
}
