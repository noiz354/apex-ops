import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';
import { provisionOrganization } from '@/lib/services/onboarding-service';

const SignupSchema = z.object({
  orgName: z.string().min(3).max(100),
  adminEmail: z.email(),
  adminName: z.string().min(2).max(100),
  adminPassword: z.string().min(8).max(100),
  adminTitle: z.string().max(100).optional(),
});

type SignupResponse =
  | { duplicate: true; message: string }
  | { organizationId: string; orgName: string; adminUserId: string; adminEmail: string };

export async function POST(req: NextRequest) {
  return withRoute<SignupResponse>({ op: 'auth.signup', method: 'POST', public: true }, req, async () => {
    const body = await req.json();
    const input = SignupSchema.parse(body);

    const userAgent = req.headers.get('user-agent');
    const result = await provisionOrganization(getDb(), input, userAgent);

    if ('duplicate' in result) {
      return {
        status: 200,
        data: {
          duplicate: true,
          message: 'If this email is new, your organization is ready. Otherwise, please sign in.',
        },
      };
    }

    return {
      status: 201,
      data: {
        organizationId: result.organizationId,
        orgName: result.orgName,
        adminUserId: result.adminUserId,
        adminEmail: result.adminEmail,
      },
      setCookie: {
        name: COOKIE_NAME,
        value: result.sessionToken,
        options: sessionCookieOptions(),
      },
    };
  });
}
