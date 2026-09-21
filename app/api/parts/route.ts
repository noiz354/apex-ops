import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { listParts } from '@/lib/services/inventory-service';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'inventory.list', method: 'GET', permission: 'inventory.read' }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const lowStockOnly = searchParams.get('lowStockOnly') === 'true';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

    const db = getDb();
    const rows = await listParts(db, ctx!, { lowStockOnly, limit, offset });
    return {
      data: {
        rows,
        can: { mutate: can(ctx!.role, 'inventory.mutate') },
      },
    };
  });
}
