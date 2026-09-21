import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { verifyMfa } from '@/lib/services/auth-service';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';
import { getDb } from '@/db/client';

const MfaSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'auth.mfa', method: 'POST', public: true }, req, async (_ctx, requestId) => {
    const input = MfaSchema.parse(await req.json());
    const result = await verifyMfa(getDb(), {
      challengeId: input.challengeId,
      code: input.code,
      userAgent: req.headers.get('user-agent'),
    });
    return {
      data: { status: 'ok' as const, user: result.user, redirect: '/', requestId },
      setCookie: { name: COOKIE_NAME, value: result.token, options: sessionCookieOptions() },
    };
  });
}
