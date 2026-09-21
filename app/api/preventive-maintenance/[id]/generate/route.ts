import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { generatePmWorkOrder } from '@/lib/services/pm-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'pm.generate', method: 'POST', permission: 'wo.create' }, req, async (ctx, requestId) => {
    const res = await generatePmWorkOrder(
      getDb(),
      ctx!,
      id,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { status: 201, data: res };
  });
}
