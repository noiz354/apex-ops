import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { postGoodsReceipt } from '@/lib/services/procurement-service';
import { verifyStepUpCode } from '@/lib/services/inventory-service';

const PostGrnSchema = z.object({
  poNumber: z.string().min(1),
  grnNumber: z.string().nullish().transform((v) => v ?? undefined),
  waybill: z.string().min(1).max(100),
  dockLocation: z.string().max(100).nullish().transform((v) => v ?? undefined),
  skuReceived: z.string().min(1),
  qtyReceived: z.number().int().positive(),
  stepUpCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit approver code from your authenticator app'),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'po.receive', method: 'POST', permission: 'inventory.mutate' }, req, async (ctx, requestId) => {
    const body = await req.json();
    const input = PostGrnSchema.parse(body);
    const stepUpAt = await verifyStepUpCode(getDb(), ctx!, input.stepUpCode);
    const grn = await postGoodsReceipt(
      getDb(),
      ctx!,
      input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId, stepUpAt },
    );
    return { status: 201, data: grn };
  });
}
