import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { computeSlaNotifications } from '@/lib/services/notification-service';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'notifications.list', method: 'GET', permission: 'wo.read', etag: true }, req, async (ctx) => {
    const db = getDb();
    const notifications = await computeSlaNotifications(db, ctx!.orgId);
    return {
      data: {
        totalAtRisk: notifications.length,
        notifications,
      },
    };
  });
}
