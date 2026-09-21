import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { forceDispatchInspection } from '@/lib/services/inspection-service';

const ForceDispatchSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRoute(
    { op: 'inspections.force_dispatch', method: 'POST', permission: 'assets.read' },
    req,
    async (ctx, requestId) => {
      const body = ForceDispatchSchema.parse(await req.json().catch(() => ({})));
      const row = await forceDispatchInspection(
        getDb(),
        ctx!,
        id,
        { reason: body.reason },
        { idempotencyKey: req.headers.get('idempotency-key'), requestId },
      );
      return { data: { ...row, dispatchedAt: new Date().toISOString() } };
    }
  );
}
