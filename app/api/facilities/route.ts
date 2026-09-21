import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { can } from '@/lib/auth/rbac';
import { createFacility, listFacilities } from '@/lib/services/facility-service';

const CreateFacilitySchema = z.object({
  name: z.string().trim().min(2).max(160),
  geojson: z.string().max(20_000).nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'facilities.list', method: 'GET', permission: 'facilities.read' }, req, async (ctx) => {
    const facilities = await listFacilities(getDb(), ctx!);
    return { data: { facilities, can: { manage: can(ctx!.role, 'facilities.manage') } } };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'facilities.create', method: 'POST', permission: 'facilities.manage' }, req, async (ctx, requestId) => {
    const body = await req.json();
    const input = CreateFacilitySchema.parse(body);
    const key = req.headers.get('idempotency-key');
    const facility = await createFacility(getDb(), ctx!, input, { idempotencyKey: key, requestId });
    return { status: 201, data: facility };
  });
}
