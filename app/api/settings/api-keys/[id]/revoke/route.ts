import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { revokeApiKey } from '@/lib/services/api-key-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'settings.api-keys.revoke', method: 'POST', permission: 'settings.manage' }, req, async (ctx) => {
    const revoked = await revokeApiKey(getDb(), ctx!, decodeURIComponent(id));
    return { data: revoked };
  });
}
