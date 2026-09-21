import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditEvents, users } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { revokeAllUserSessions } from '../auth/session';
import { hashPassword } from '../auth/password';
import { forbiddenOp, notFound } from '../domain/errors';

export const ROLES6 = [
  'Enterprise Admin',
  'Facility Director',
  'Engineering Lead',
  'Senior Field Tech',
  'Vendor Partner Tech',
  'Read-Only Auditor',
] as const;

export interface DirectoryUserRow {
  id: string;
  email: string;
  name: string;
  initials: string;
  title: string;
  role: string;
  isActive: boolean;
  hasMfa: boolean;
}

export async function listUsers(db: Db, ctx: AuthContext): Promise<DirectoryUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      initials: users.initials,
      title: users.title,
      role: users.role,
      isActive: users.isActive,
      hasMfa: users.totpSecret,
    })
    .from(users)
    .where(eq(users.organizationId, ctx.orgId))
    .orderBy(desc(users.createdAt));

  return rows.map((u) => ({ ...u, hasMfa: Boolean(u.hasMfa) }));
}

export interface CreateUserInput {
  email: string;
  name: string;
  title?: string;
  role: (typeof ROLES6)[number];
}

export async function createUser(db: Db, ctx: AuthContext, input: CreateUserInput): Promise<DirectoryUserRow> {
  const tempPass = Math.random().toString(36).slice(-10) + 'A1!';
  const passwordHash = await hashPassword(tempPass);

  const initials = input.name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const [created] = await db
    .insert(users)
    .values({
      organizationId: ctx.orgId,
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      initials: initials || 'XX',
      title: input.title?.trim() || '',
      role: input.role,
      passwordHash,
      isActive: true,
    })
    .returning();

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'USER_INVITE',
    entityType: 'user',
    entityId: created.id,
    after: { email: created.email, name: created.name, role: created.role },
  });

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    initials: created.initials,
    title: created.title,
    role: created.role,
    isActive: created.isActive,
    hasMfa: Boolean(created.totpSecret),
  };
}

export interface UpdateUserInput {
  role?: (typeof ROLES6)[number];
  title?: string;
  isActive?: boolean;
}

export async function updateUser(
  db: Db,
  ctx: AuthContext,
  id: string,
  input: UpdateUserInput,
): Promise<DirectoryUserRow> {
  if (id === ctx.userId && input.isActive === false) {
    throw forbiddenOp('USER_SELF_DEACTIVATE', 'You cannot deactivate your own account — ask another Enterprise Admin.');
  }

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.id, id)))
    .limit(1);

  if (!existing[0]) throw notFound('USER', id);
  const before = existing[0];

  const [updated] = await db
    .update(users)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.id, id)))
    .returning();

  const sessionsRevoked = input.isActive === false
    ? await revokeAllUserSessions(db, id, ctx.orgId)
    : 0;

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: input.isActive === false ? 'USER_DEACTIVATE' : 'USER_UPDATE',
    entityType: 'user',
    entityId: id,
    before: { role: before.role, isActive: before.isActive },
    after: { role: updated.role, isActive: updated.isActive, sessionsRevoked },
  });

  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    initials: updated.initials,
    title: updated.title,
    role: updated.role,
    isActive: updated.isActive,
    hasMfa: Boolean(updated.totpSecret),
  };
}

export interface ResetMfaResult {
  id: string;
  email: string;
  mfaEnrolled: false;
  sessionsRevoked: number;
}

export async function resetUserMfa(db: Db, ctx: AuthContext, id: string): Promise<ResetMfaResult> {
  if (id === ctx.userId) {
    throw forbiddenOp('USER_SELF_MFA_RESET', 'You cannot reset your own MFA key — ask another Enterprise Admin.');
  }

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.id, id)))
    .limit(1);

  if (!existing[0]) throw notFound('USER', id);
  const before = existing[0];

  const [updated] = await db
    .update(users)
    .set({ totpSecret: null })
    .where(and(eq(users.organizationId, ctx.orgId), eq(users.id, id)))
    .returning();

  const sessionsRevoked = await revokeAllUserSessions(db, id, ctx.orgId);

  await db.insert(auditEvents).values({
    organizationId: ctx.orgId,
    actorUserId: ctx.userId,
    actorName: ctx.name,
    action: 'USER_MFA_RESET',
    entityType: 'user',
    entityId: id,
    before: { mfaEnrolled: Boolean(before.totpSecret) },
    after: { mfaEnrolled: false, sessionsRevoked },
  });

  return { id: updated.id, email: updated.email, mfaEnrolled: false, sessionsRevoked };
}
