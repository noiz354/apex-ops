import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { can } from '@/lib/auth/rbac';
import { createHandover, listHandovers } from '@/lib/services/handover-service';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'handover.list', method: 'GET', permission: 'shifts.read' }, req, async (ctx) => {
    const handovers = await listHandovers(getDb(), ctx!);
    return { data: { handovers, can: { manage: can(ctx!.role, 'shifts.manage') } } };
  });
}

const CreateSchema = z.object({
  shiftFrom: z.string().min(1).max(160),
  shiftTo: z.string().min(1).max(160),
  leadFrom: z.string().min(1).max(160),
  leadTo: z.string().min(1).max(160),
  woRef: z.string().max(64).nullish(),
  items: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'handover.create', method: 'POST', permission: 'shifts.manage' }, req, async (ctx, requestId) => {
    const body = await req.json();
    const input = CreateSchema.parse(body);
    const idem = req.headers.get('idempotency-key');
    const row = await createHandover(getDb(), ctx!, { ...input, woRef: input.woRef ?? null }, { idempotencyKey: idem, requestId });
    return { data: row, status: 201 };
  });
}
