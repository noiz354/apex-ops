import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents, mfaChallenges, users } from '../../db/schema';
import { DomainError } from '../domain/errors';
import { log } from '../log';
import { rateLimitShared } from '../auth/limits';
import { verifyPassword } from '../auth/password';
import { totpNow, verifyTotp } from '../auth/totp';
import { createSession, revokeSession, verifySession, type AuthContext } from '../auth/session';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;

export type LoginResult =
  | { status: 'mfa_required'; challengeId: string; devHint?: string }
  | { status: 'ok'; token: string; user: AuthContext };

function devMfaEnabled(): boolean {
  if (process.env.DEMO_MFA_HINT === '0') return false;
  if (process.env.NODE_ENV === 'production') {
    return process.env.DEMO_MFA_HINT === '1' && process.env.ALLOW_DEMO_HINT_IN_PROD === '1';
  }
  return true;
}

async function audit(db: Db, orgId: string, action: string, userId: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(auditEvents).values({
    organizationId: orgId,
    actorUserId: userId,
    actorName: (meta.actorName as string) ?? 'auth',
    action,
    entityType: 'auth',
    entityId: userId ?? null,
    after: meta ?? null,
    requestId: (meta.requestId as string) ?? null,
  });
}

export async function login(
  db: Db,
  input: { email: string; password: string; ip: string; userAgent?: string | null },
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();

  const byEmail = await rateLimitShared(db, `login:${email}`, 8, 10 * 60 * 1000);
  const byIp = await rateLimitShared(db, `login-ip:${input.ip}`, 24, 10 * 60 * 1000);
  if (!byEmail.ok || !byIp.ok) {
    throw new DomainError(429, 'RATE_LIMITED', 'Too many sign-in attempts — try again later', {
      retryAfterSec: Math.max(byEmail.retryAfterSec, byIp.retryAfterSec),
    });
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  const fail = async () => {
    if (user) await audit(db, user.organizationId, 'AUTH_LOGIN_FAIL', user.id, { email });
    log('warn', 'auth_login_fail', { orgId: user?.organizationId, userId: user?.id });
    throw new DomainError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  };
  if (!user || !user.isActive) return fail();
  const passwordOk = await verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) return fail();

  if (user.totpSecret) {
    const [challenge] = await db.insert(mfaChallenges).values({
      userId: user.id,
      organizationId: user.organizationId,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    }).returning({ id: mfaChallenges.id });
    await audit(db, user.organizationId, 'AUTH_MFA_CHALLENGE', user.id, { email });
    return {
      status: 'mfa_required',
      challengeId: challenge.id,
      ...(devMfaEnabled() ? { devHint: totpNow(user.totpSecret) } : {}),
    };
  }

  const token = await createSession(db, user.id, user.organizationId, input.userAgent ?? null);
  const ctx = await verifySession(db, token);
  if (!ctx) throw new DomainError(500, 'SESSION_CREATE_FAILED', 'Could not establish session');
  await audit(db, user.organizationId, 'AUTH_LOGIN_OK', user.id, { email });
  return { status: 'ok', token, user: ctx };
}

export async function verifyMfa(
  db: Db,
  input: { challengeId: string; code: string; userAgent?: string | null },
): Promise<{ token: string; user: AuthContext }> {
  const rows = await db.select().from(mfaChallenges).where(eq(mfaChallenges.id, input.challengeId)).limit(1);
  const challenge = rows[0];
  if (!challenge || challenge.consumedAt) {
    throw new DomainError(400, 'CHALLENGE_INVALID', 'MFA challenge is no longer valid — sign in again');
  }
  if (challenge.expiresAt.getTime() <= Date.now()) {
    throw new DomainError(400, 'CHALLENGE_EXPIRED', 'MFA challenge expired — sign in again');
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    throw new DomainError(429, 'MFA_LOCKED', 'Too many MFA attempts — sign in again');
  }

  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  if (!user || !user.isActive || !user.totpSecret) {
    throw new DomainError(400, 'CHALLENGE_INVALID', 'MFA challenge is no longer valid — sign in again');
  }

  if (!verifyTotp(user.totpSecret, input.code.replace(/\s+/g, ''))) {
    const attempts = challenge.attempts + 1;
    await db.update(mfaChallenges).set({ attempts }).where(eq(mfaChallenges.id, challenge.id));
    await audit(db, user.organizationId, 'AUTH_MFA_FAIL', user.id, { attempt: attempts });
    if (attempts >= MFA_MAX_ATTEMPTS) {
      await db.update(mfaChallenges).set({ consumedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
      throw new DomainError(429, 'MFA_LOCKED', 'Too many MFA attempts — sign in again');
    }
    throw new DomainError(401, 'MFA_INVALID', 'Wrong code — try again', { remaining: MFA_MAX_ATTEMPTS - attempts });
  }

  await db.update(mfaChallenges).set({ consumedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
  const token = await createSession(db, user.id, user.organizationId, input.userAgent ?? null);
  const ctx = await verifySession(db, token);
  if (!ctx) throw new DomainError(500, 'SESSION_CREATE_FAILED', 'Could not establish session');
  await audit(db, user.organizationId, 'AUTH_MFA_OK', user.id);
  return { token, user: ctx };
}

export async function logout(db: Db, token: string | undefined | null): Promise<void> {
  if (!token) return;
  const ctx = await verifySession(db, token);
  await revokeSession(db, token);
  if (ctx) await audit(db, ctx.orgId, 'AUTH_LOGOUT', ctx.userId);
}
