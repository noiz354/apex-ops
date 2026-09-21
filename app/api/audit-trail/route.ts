import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { listAuditEvents } from '@/lib/services/audit-service';

export async function GET(req: NextRequest) {
  return withRoute(
    { op: 'audit.list', method: 'GET', permission: 'audit.read' },
    req,
    async (ctx) => {
      const { searchParams } = new URL(req.url);
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
      const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;
      const entityType = searchParams.get('entityType') || undefined;
      const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
      const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;

      const page = await listAuditEvents(getDb(), ctx!, { limit, offset, entityType, from, to });
      return {
        data: {
          rows: page.rows,
          counts: page.counts,
          total: page.total,
          truncated: page.truncated,
          orgId: ctx!.orgId,
        },
      };
    }
  );
}
