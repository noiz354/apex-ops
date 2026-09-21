import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { amendVendor, commendVendor, getVendor, listVendorPos, renewVendor } from '@/lib/services/vendor-service';
import type { VendorRow } from '@/lib/services/vendor-service';

const PatchSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('amend'),
    scope: z.string().max(300).nullish(),
    contact: z.string().max(160).nullish(),
    phone: z.string().max(40).nullish(),
    duns: z.string().regex(/^\d{2}-\d{3}-\d{4}$/, 'DUNS must look like 00-132-9481 (format check only)').nullish(),
    tier: z.enum(['TIER-1', 'TIER-2', 'TIER-3']).nullish(),
  }),
  z.object({
    op: z.literal('renew'),
    termMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
    msaNumber: z.string().max(60).nullish(),
  }),
  z.object({
    op: z.literal('commend'),
    note: z.string().min(10).max(500),
  }),
]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withRoute({ op: 'vendors.get', method: 'GET', permission: 'vendors.read' }, req, async (ctx) => {
    const { slug } = await params;
    const vendor = await getVendor(getDb(), ctx!, slug);
    const relatedPOs = await listVendorPos(getDb(), ctx!, slug);
    return { data: { vendor, relatedPOs } };
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withRoute<VendorRow | { slug: string; recordedAt: string }>({ op: 'vendors.update', method: 'PATCH', permission: 'vendors.manage' }, req, async (ctx, requestId) => {
    const { slug } = await params;
    const body = await req.json();
    const input = PatchSchema.parse(body);
    const key = req.headers.get('idempotency-key');
    if (input.op === 'amend') {
      const { op: _op, ...patch } = input;
      const vendor = await amendVendor(getDb(), ctx!, slug, patch, { idempotencyKey: key, requestId });
      return { data: vendor };
    }
    if (input.op === 'renew') {
      const vendor = await renewVendor(getDb(), ctx!, slug, { termMonths: input.termMonths, msaNumber: input.msaNumber }, { idempotencyKey: key, requestId });
      return { data: vendor };
    }
    const res = await commendVendor(getDb(), ctx!, slug, { note: input.note }, { requestId });
    return { data: res };
  });
}
