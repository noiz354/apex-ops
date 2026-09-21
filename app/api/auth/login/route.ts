import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { login } from '@/lib/services/auth-service';
import { COOKIE_NAME, sessionCookieOptions, type AuthContext } from '@/lib/auth/session';
import { getDb } from '@/db/client';

const LoginSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(200),
});

type LoginResponse =
  | { status: 'mfa_required'; challengeId: string; devHint: string | null; requestId: string }
  | { status: 'ok'; user: AuthContext; redirect: string; requestId: string };

export async function POST(req: NextRequest) {
  return withRoute<LoginResponse>({ op: 'auth.login', method: 'POST', public: true }, req, async (_ctx, requestId) => {
    const input = LoginSchema.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const result = await login(getDb(), {
      email: input.email,
      password: input.password,
      ip,
      userAgent: req.headers.get('user-agent'),
    });
    if (result.status === 'mfa_required') {
      return {
        data: { status: 'mfa_required', challengeId: result.challengeId, devHint: result.devHint ?? null, requestId },
      };
    }
    return {
      data: { status: 'ok', user: result.user, redirect: '/', requestId },
      setCookie: { name: COOKIE_NAME, value: result.token, options: sessionCookieOptions() },
    };
  });
}
