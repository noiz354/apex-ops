import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { createWorkOrder, listAssignableTechs, listWorkOrders } from '@/lib/services/wo-service';

const CreateWoSchema = z.object({
  title: z.string().min(3).max(200),
  priority: z.enum(['P1', 'P2', 'P3']),
  assetCode: z.string().regex(/^AST-[A-Z]+-\d{3}$/, 'Asset code must match AST-XXX-NNN').nullish(),
  location: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
  lotoRequired: z.boolean().nullish(),
  assigneeEmail: z.string().email().max(255).nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'wo.list', method: 'GET', permission: 'wo.read', etag: true }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const priority = (searchParams.get('priority') as 'P1' | 'P2' | 'P3') || undefined;
    const assetCode = searchParams.get('assetCode') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

    const db = getDb();
    const [rows, techs] = await Promise.all([
      listWorkOrders(db, ctx!, { status, priority, assetCode, limit, offset }),
      listAssignableTechs(db, ctx!),
    ]);
    return {
      data: {
        rows,
        techs,
        can: { create: can(ctx!.role, 'wo.create'), transition: can(ctx!.role, 'wo.transition') },
      },
    };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'wo.create', method: 'POST', permission: 'wo.create' }, req, async (ctx, requestId) => {
    const input = CreateWoSchema.parse(await req.json());
    const wo = await createWorkOrder(
      getDb(), ctx!, input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { status: 201, data: wo };
  });
}
