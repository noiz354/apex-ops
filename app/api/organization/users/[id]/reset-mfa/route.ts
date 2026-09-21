import { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { resetUserMfa } from '@/lib/services/org-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'org.users.reset-mfa', method: 'POST', permission: 'org.manage' }, req, async (ctx) => {
    const data = await resetUserMfa(getDb(), ctx!, id);
    return { data };
  });
}
