import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { logout } from '@/lib/services/auth-service';
import { COOKIE_NAME } from '@/lib/auth/session';
import { getDb } from '@/db/client';

export async function POST(req: NextRequest) {
  return withRoute({ op: 'auth.logout', method: 'POST', public: true }, req, async () => {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    await logout(getDb(), token ?? null);
    return { data: { status: 'ok' as const }, clearCookie: COOKIE_NAME };
  });
}
