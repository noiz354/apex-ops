import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { getFacility, updateFacility } from '@/lib/services/facility-service';

const PatchFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  geojson: z.string().max(20_000).nullish(),
  defect: z.string().trim().min(10).max(500).optional(),
  transfer: z
    .object({
      assetCode: z.string().trim().min(2).max(60),
      toCode: z.string().trim().min(1).max(80),
    })
    .optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'facilities.get', method: 'GET', permission: 'facilities.read' }, req, async (ctx) => {
    const { id } = await params;
    const facility = await getFacility(getDb(), ctx!, id);
    return { data: facility };
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'facilities.update', method: 'PATCH', permission: 'facilities.manage' }, req, async (ctx, requestId) => {
    const { id } = await params;
    const body = await req.json();
    const input = PatchFacilitySchema.parse(body);
    const key = req.headers.get('idempotency-key');
    const facility = await updateFacility(getDb(), ctx!, id, input, { idempotencyKey: key, requestId });
    return { data: facility };
  });
}
