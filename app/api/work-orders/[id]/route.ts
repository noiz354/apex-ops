import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { withRoute } from '@/lib/api/http';
import { getWorkOrder } from '@/lib/services/wo-service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'wo.get', method: 'GET', permission: 'wo.read', etag: true }, req, async (ctx) => {
    const { id } = await params;
    const wo = await getWorkOrder(getDb(), ctx!, id);
    return { status: 200, data: wo };
  });
}
