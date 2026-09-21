import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { loginOptions, verifyLogin, listMyPasskeys, deletePasskey } from '@/lib/auth/webauthn';
import { COOKIE_NAME, sessionCookieOptions } from '@/lib/auth/session';

const PostBody = z.object({
  orgId: z.string().min(1),
  email: z.email(),
});

const VerifyBody = z.object({
  assertion: z.unknown(),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'auth.passkeys.login.options', method: 'POST', public: true }, req, async () => {
    const { orgId, email } = PostBody.parse(await req.json());
    const options = await loginOptions(orgId, email, req);
    return { data: options };
  });
}

export async function PUT(req: NextRequest) {
  return withRoute<unknown>({ op: 'auth.passkeys.login.verify', method: 'PUT', public: true }, req, async () => {
    const { assertion } = VerifyBody.parse(await req.json());
    const result = await verifyLogin(assertion, req.headers.get('user-agent'), req);
    if (result.status === 'mfa_required') {
      return { data: result };
    }
    return {
      data: { status: 'ok' as const, orgId: result.orgId },
      setCookie: { name: COOKIE_NAME, value: result.token, options: sessionCookieOptions() },
    };
  });
}

export async function GET(req: NextRequest) {
  return withRoute({ op: 'auth.passkeys.list', method: 'GET', permission: 'org.read' }, req, async (ctx) => {
    const rows = await listMyPasskeys(ctx!.userId, ctx!.orgId);
    return { data: rows.map((r) => ({ id: r.id, friendlyName: r.friendlyName, createdAt: r.id })) };
  });
}

export async function DELETE(req: NextRequest) {
  return withRoute<unknown>({ op: 'auth.passkeys.revoke', method: 'DELETE', permission: 'org.read' }, req, async (ctx) => {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return { status: 400, data: { error: 'BAD_REQUEST', message: 'id query param required' } };
    const ok = await deletePasskey(ctx!.userId, ctx!.orgId, id);
    return { data: { revoked: ok } };
  });
}
