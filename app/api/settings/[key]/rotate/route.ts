import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { rotateSecret } from '@/lib/services/settings-service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  return withRoute({ op: 'settings.rotate', method: 'POST', permission: 'settings.manage' }, req, async (ctx, requestId) => {
    const { key } = await params;
    const idem = req.headers.get('idempotency-key');
    const res = await rotateSecret(getDb(), ctx!, decodeURIComponent(key), { idempotencyKey: idem, requestId });
    return { data: res };
  });
}
