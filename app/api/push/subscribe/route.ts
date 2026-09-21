import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getPublicVapidKey, subscribePush, unsubscribePush } from '@/lib/push/push-service';

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'push.vapid', method: 'GET', permission: 'org.read' }, req, async () => {
    return { data: { publicKey: getPublicVapidKey() } };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'push.subscribe', method: 'POST', permission: 'org.read' }, req, async (ctx) => {
    const input = Body.parse(await req.json());
    const id = await subscribePush(ctx!.orgId, ctx!.userId, {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: req.headers.get('user-agent'),
    });
    return { data: { id } };
  });
}

export async function DELETE(req: NextRequest) {
  return withRoute({ op: 'push.unsubscribe', method: 'DELETE', permission: 'org.read' }, req, async (ctx) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await req.json());
    const ok = await unsubscribePush(ctx!.orgId, ctx!.userId, endpoint);
    return { data: { removed: ok } };
  });
}
