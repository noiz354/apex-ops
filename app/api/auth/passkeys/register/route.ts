import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import {
  registrationOptions,
  verifyRegistration,
  registrationRoleAllowed,
} from '@/lib/auth/webauthn';

const PostBody = z.object({
  attestation: z.unknown(),
  friendlyName: z.string().max(80).optional().default('Passkey'),
});

export async function GET(req: NextRequest) {
  return withRoute<unknown>({ op: 'auth.passkeys.register.options', method: 'GET', permission: 'settings.manage' }, req, async (ctx) => {
    const allowed = await registrationRoleAllowed(ctx!.role);
    if (!allowed) {
      return { status: 403, data: { error: 'ROLE_FORBIDDEN', message: 'Passkey self-service requires settings.manage permission' } };
    }
    const options = await registrationOptions(ctx!.userId, ctx!.orgId, req);
    return { data: options };
  });
}

export async function POST(req: NextRequest) {
  return withRoute<unknown>({ op: 'auth.passkeys.register.verify', method: 'POST', permission: 'settings.manage' }, req, async (ctx) => {
    const allowed = await registrationRoleAllowed(ctx!.role);
    if (!allowed) {
      return { status: 403, data: { error: 'ROLE_FORBIDDEN', message: 'Passkey self-service requires settings.manage permission' } };
    }
    const { attestation, friendlyName } = PostBody.parse(await req.json());
    const result = await verifyRegistration(ctx!.userId, ctx!.orgId, attestation, friendlyName, req);
    return { data: result };
  });
}
