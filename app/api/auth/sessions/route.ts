import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { DomainError } from '@/lib/domain/errors';
import { getDb } from '@/db/client';
import { auditEvents } from '@/db/schema';
import {
  COOKIE_NAME,
  hashToken,
  listUserSessions,
  revokeAllUserSessions,
  revokeOtherUserSessions,
} from '@/lib/auth/session';

function ownIdHash(req: NextRequest): string | undefined {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? hashToken(token) : undefined;
}

export async function GET(req: NextRequest) {
  return withRoute({ op: 'auth.sessions.list', method: 'GET' }, req, async (ctx) => {
    const sessionsList = await listUserSessions(getDb(), ctx!.userId, ctx!.orgId, ownIdHash(req));
    return { data: { sessions: sessionsList } };
  });
}

const RevokeBody = z.object({
  mode: z.enum(['all', 'others']).optional().default('all'),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'auth.sessions.revoke', method: 'POST' }, req, async (ctx) => {
    const { mode } = RevokeBody.parse(await req.json().catch(() => ({})));
    const db = getDb();

    if (mode === 'others') {
      const own = ownIdHash(req);
      if (!own) {
        throw new DomainError(401, 'SESSION_UNKNOWN', 'Current session not identifiable');
      }
      const revokedCount = await revokeOtherUserSessions(db, ctx!.userId, ctx!.orgId, own);

      await db.insert(auditEvents).values({
        organizationId: ctx!.orgId,
        actorUserId: ctx!.userId,
        actorName: ctx!.name,
        action: 'AUTH_SESSIONS_REVOKE_OTHERS',
        entityType: 'auth',
        entityId: ctx!.userId,
        after: { revokedCount },
      });

      return { data: { status: 'revoked_others', revokedCount } };
    }

    const revokedCount = await revokeAllUserSessions(db, ctx!.userId, ctx!.orgId);

    await db.insert(auditEvents).values({
      organizationId: ctx!.orgId,
      actorUserId: ctx!.userId,
      actorName: ctx!.name,
      action: 'AUTH_SESSIONS_REVOKE_ALL',
      entityType: 'auth',
      entityId: ctx!.userId,
      after: { revokedCount },
    });

    return {
      data: { status: 'revoked_all', revokedCount },
      clearCookie: COOKIE_NAME,
    };
  });
}
