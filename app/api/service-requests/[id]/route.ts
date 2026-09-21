import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { withRoute } from '@/lib/api/http';
import { getServiceRequest } from '@/lib/services/sr-service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRoute({ op: 'sr.get', method: 'GET', permission: 'sr.read', etag: true }, req, async (ctx) => {
    const { id } = await params;
    const sr = await getServiceRequest(getDb(), ctx!, id);
    return { status: 200, data: sr };
  });
}
