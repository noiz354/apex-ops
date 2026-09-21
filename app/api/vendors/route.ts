import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createVendor, listVendors } from '@/lib/services/vendor-service';

const CreateVendorSchema = z.object({
  name: z.string().min(3).max(160),
  tier: z.enum(['TIER-1', 'TIER-2', 'TIER-3']).nullish(),
  scope: z.string().max(300).nullish(),
  contact: z.string().max(160).nullish(),
  phone: z.string().max(40).nullish(),
  duns: z.string().regex(/^\d{2}-\d{3}-\d{4}$/, 'DUNS must look like 00-132-9481 (format check only)').nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'vendors.list', method: 'GET', permission: 'vendors.read' }, req, async (ctx) => {
    const vendors = await listVendors(getDb(), ctx!);
    return { data: { vendors, can: { manage: true } } };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'vendors.create', method: 'POST', permission: 'vendors.manage' }, req, async (ctx, requestId) => {
    const body = await req.json();
    const input = CreateVendorSchema.parse(body);
    const key = req.headers.get('idempotency-key');
    const vendor = await createVendor(getDb(), ctx!, input, { idempotencyKey: key, requestId });
    return { status: 201, data: vendor };
  });
}
