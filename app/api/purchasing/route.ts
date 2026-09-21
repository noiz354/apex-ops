import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createRequisition, listPurchases } from '@/lib/services/procurement-service';

const CreatePrSchema = z.object({
  title: z.string().min(3).max(200),
  vendorSlug: z.string().nullish(),
  lineItems: z.array(z.object({
    sku: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
  })).min(1),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'po.list', method: 'GET', permission: 'po.read' }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const kind = (searchParams.get('kind') as 'PO' | 'PR') || undefined;
    const status = searchParams.get('status') || undefined;
    const number = searchParams.get('number') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

    const list = await listPurchases(getDb(), ctx!, { kind, status, number, limit, offset });
    if (number && list.length === 0) {
      const { notFound } = await import('@/lib/domain/errors');
      throw notFound('PURCHASE_DOCUMENT', number);
    }
    return { data: list };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'po.create', method: 'POST', permission: 'po.approve' }, req, async (ctx) => {
    const body = await req.json();
    const input = CreatePrSchema.parse(body);
    const pr = await createRequisition(getDb(), ctx!, input);
    return { status: 201, data: pr };
  });
}
