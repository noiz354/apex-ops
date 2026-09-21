import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { can } from '@/lib/auth/rbac';
import { listSettings } from '@/lib/services/settings-service';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'settings.list', method: 'GET', permission: 'settings.manage' }, req, async (ctx) => {
    const entries = await listSettings(getDb(), ctx!);
    return { data: { entries, can: { manage: can(ctx!.role, 'settings.manage') } } };
  });
}
