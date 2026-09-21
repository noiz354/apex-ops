import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { withRoute } from '@/lib/api/http';
import { convertPrToPo } from '@/lib/services/procurement-service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  return withRoute({ op: 'po.convert', method: 'POST', permission: 'po.approve' }, req, async (ctx, requestId) => {
    const { number } = await params;
    const row = await convertPrToPo(
      getDb(),
      ctx!,
      number,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { status: 200, data: row };
  });
}
