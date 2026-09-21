import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { createServiceRequest, listServiceRequests } from '@/lib/services/sr-service';

const CreateSrSchema = z.object({
  title: z.string().min(3).max(200),
  requesterName: z.string().min(2).max(120),
  priority: z.enum(['P1', 'P2', 'P3']),
  assetCode: z.string().regex(/^AST-[A-Z0-9-]{3,}$/, 'Asset code must match AST-XXX-NNN').nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'sr.list', method: 'GET', permission: 'sr.read', etag: true }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

    const rows = await listServiceRequests(getDb(), ctx!, { status, limit, offset });
    return {
      data: {
        rows,
        can: { create: can(ctx!.role, 'sr.create'), transition: can(ctx!.role, 'sr.transition') },
      },
    };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'sr.create', method: 'POST', permission: 'sr.create' }, req, async (ctx, requestId) => {
    const input = CreateSrSchema.parse(await req.json());
    const sr = await createServiceRequest(
      getDb(), ctx!, input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );
    return { status: 201, data: sr };
  });
}
