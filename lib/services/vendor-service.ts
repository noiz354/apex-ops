import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, purchaseOrders, vendors } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';

export interface VendorRow {
  slug: string;
  name: string;
  tier: string;
  msaNumber: string | null;
  msaExpiresOn: string | null;
  onTimePct: number | null;
  scope: string | null;
  contact: string | null;
  phone: string | null;
  duns: string | null;
  msaStatus: 'ACTIVE' | 'EXPIRED' | 'NO MSA';
  daysLeft: number | null;
}

function toDto(v: typeof vendors.$inferSelect): VendorRow {
  let msaStatus: VendorRow['msaStatus'] = 'NO MSA';
  let daysLeft: number | null = null;
  if (v.msaExpiresOn) {
    const today = new Date().toISOString().slice(0, 10);
    if (v.msaExpiresOn < today) {
      msaStatus = 'EXPIRED';
    } else {
      msaStatus = 'ACTIVE';
    }
    daysLeft = Math.round(
      (new Date(v.msaExpiresOn).getTime() - new Date(today).getTime()) / 86_400_000,
    );
  }
  return {
    slug: v.slug,
    name: v.name,
    tier: v.tier,
    msaNumber: v.msaNumber,
    msaExpiresOn: v.msaExpiresOn,
    onTimePct: v.onTimePct,
    scope: v.scope,
    contact: v.contact,
    phone: v.phone,
    duns: v.duns,
    msaStatus,
    daysLeft,
  };
}

export async function listVendors(db: Db, ctx: AuthContext): Promise<VendorRow[]> {
  const rows = await db
    .select()
    .from(vendors)
    .where(eq(vendors.organizationId, ctx.orgId))
    .orderBy(desc(vendors.createdAt));
  return rows.map(toDto);
}

export async function getVendor(db: Db, ctx: AuthContext, slug: string): Promise<VendorRow> {
  const rows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
    .limit(1);
  if (!rows[0]) throw notFound('VENDOR', slug);
  return toDto(rows[0]);
}

export interface RelatedPo {
  number: string;
  kind: string;
  title: string;
  status: string;
}

export async function listVendorPos(db: Db, ctx: AuthContext, slug: string): Promise<RelatedPo[]> {
  const docs = await db
    .select({
      number: purchaseOrders.number,
      kind: purchaseOrders.kind,
      title: purchaseOrders.title,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.organizationId, ctx.orgId), eq(purchaseOrders.vendorSlug, slug)))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(20);
  return docs;
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface CreateVendorInput {
  name: string;
  tier?: string | null;
  scope?: string | null;
  contact?: string | null;
  phone?: string | null;
  duns?: string | null;
}

const TIERS = ['TIER-1', 'TIER-2', 'TIER-3'] as const;

export async function createVendor(
  db: Db,
  ctx: AuthContext,
  input: CreateVendorInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<VendorRow> {
  const exec = async (tx: Tx): Promise<VendorRow> => {
    const tier = (input.tier ?? 'TIER-3').toUpperCase();
    if (!(TIERS as readonly string[]).includes(tier)) {
      throw new DomainError(400, 'VALIDATION_ERROR', `tier must be one of ${TIERS.join(', ')}`);
    }
    const slug = slugify(input.name);
    if (!slug) throw new DomainError(400, 'VALIDATION_ERROR', 'name must contain letters or digits');
    const existing = await tx
      .select({ slug: vendors.slug })
      .from(vendors)
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .limit(1);
    if (existing[0]) throw new DomainError(409, 'VENDOR_SLUG_EXISTS', `vendor ${slug} already exists in this organization`);

    const [row] = await tx
      .insert(vendors)
      .values({
        organizationId: ctx.orgId,
        slug,
        name: input.name.trim().slice(0, 160),
        tier,
        scope: input.scope?.trim().slice(0, 300) || null,
        contact: input.contact?.trim().slice(0, 160) || null,
        phone: input.phone?.trim().slice(0, 40) || null,
        duns: input.duns?.trim() || null,
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'VENDOR_CREATE',
      entityType: 'vendor',
      entityId: slug,
      requestId: opts.requestId ?? null,
      after: { name: row.name, tier: row.tier },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'vendor.create', ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'vendor.create', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export interface AmendVendorInput {
  scope?: string | null;
  contact?: string | null;
  phone?: string | null;
  duns?: string | null;
  tier?: string | null;
}

export async function amendVendor(
  db: Db,
  ctx: AuthContext,
  slug: string,
  input: AmendVendorInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<VendorRow> {
  const exec = async (tx: Tx): Promise<VendorRow> => {
    const rows = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .limit(1);
    if (!rows[0]) throw notFound('VENDOR', slug);
    const before = toDto(rows[0]);

    const patch: Partial<typeof vendors.$inferInsert> = {};
    if (input.scope !== undefined) patch.scope = input.scope?.trim().slice(0, 300) || null;
    if (input.contact !== undefined) patch.contact = input.contact?.trim().slice(0, 160) || null;
    if (input.phone !== undefined) patch.phone = input.phone?.trim().slice(0, 40) || null;
    if (input.duns !== undefined) patch.duns = input.duns?.trim() || null;
    if (input.tier !== undefined && input.tier !== null) {
      const tier = input.tier.toUpperCase();
      if (!(TIERS as readonly string[]).includes(tier)) {
        throw new DomainError(400, 'VALIDATION_ERROR', `tier must be one of ${TIERS.join(', ')}`);
      }
      patch.tier = tier;
    }
    if (Object.keys(patch).length === 0) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'nothing to amend — provide scope, contact, phone, duns, or tier');
    }

    const [row] = await tx
      .update(vendors)
      .set(patch)
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'VENDOR_AMEND',
      entityType: 'vendor',
      entityId: slug,
      requestId: opts.requestId ?? null,
      before: { scope: before.scope, contact: before.contact, tier: before.tier },
      after: { scope: row.scope, contact: row.contact, tier: row.tier },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'vendor.amend', slug, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'vendor.amend', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}

export async function renewVendor(
  db: Db,
  ctx: AuthContext,
  slug: string,
  input: { termMonths: number; msaNumber?: string | null },
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<VendorRow> {
  const exec = async (tx: Tx): Promise<VendorRow> => {
    if (![12, 24, 36].includes(input.termMonths)) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'termMonths must be 12, 24, or 36');
    }
    const rows = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .limit(1);
    if (!rows[0]) throw notFound('VENDOR', slug);
    const current = rows[0];

    const today = new Date().toISOString().slice(0, 10);
    const base = current.msaExpiresOn && current.msaExpiresOn > today ? current.msaExpiresOn : today;
    const [y, m, d] = base.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + input.termMonths, d)).toISOString().slice(0, 10);

    const [row] = await tx
      .update(vendors)
      .set({
        msaExpiresOn: next,
        ...(input.msaNumber ? { msaNumber: input.msaNumber.trim().slice(0, 60) } : {}),
      })
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'VENDOR_RENEW',
      entityType: 'vendor',
      entityId: slug,
      requestId: opts.requestId ?? null,
      before: { msaExpiresOn: current.msaExpiresOn, msaNumber: current.msaNumber },
      after: { msaExpiresOn: next, msaNumber: row.msaNumber, termMonths: input.termMonths },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'vendor.renew', slug, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'vendor.renew', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}

export async function commendVendor(
  db: Db,
  ctx: AuthContext,
  slug: string,
  input: { note: string },
  opts: { requestId?: string } = {},
): Promise<{ slug: string; recordedAt: string }> {
  const note = input.note?.trim() ?? '';
  if (note.length < 10) {
    throw new DomainError(400, 'VALIDATION_ERROR', 'commendation note must be at least 10 characters');
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ slug: vendors.slug })
      .from(vendors)
      .where(and(eq(vendors.organizationId, ctx.orgId), eq(vendors.slug, slug)))
      .limit(1);
    if (!rows[0]) throw notFound('VENDOR', slug);
    const recordedAt = new Date().toISOString();
    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'VENDOR_COMMEND',
      entityType: 'vendor',
      entityId: slug,
      requestId: opts.requestId ?? null,
      after: { note: note.slice(0, 500), recordedAt },
    });
    return { slug, recordedAt };
  });
}
