import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { transitionServiceRequest } from '@/lib/services/sr-service';

const SrTransitionSchema = z.object({
  action: z.enum(['triage', 'convert', 'close']),
  reason: z.string().max(500).nullish(),
  woTitle: z.string().min(3).max(200).nullish(),
  woPriority: z.enum(['P1', 'P2', 'P3']).nullish(),
});

export async function POST(req: NextRequest, routeCtx: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'sr.transition', method: 'POST', permission: 'sr.transition' }, req, async (ctx, requestId) => {
    const { id } = await routeCtx.params;
    const input = SrTransitionSchema.parse(await req.json());
    const result = await transitionServiceRequest(
      getDb(), ctx!, id, input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { data: result };
  });
}
