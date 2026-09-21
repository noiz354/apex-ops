import { and, desc, eq } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, facilities } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';

export interface DefectEntry { text: string; at: string; by: string }
export interface TransferEntry { assetCode: string; toCode: string; at: string; by: string }

export interface FacilityRow {
  id: string;
  code: string;
  name: string;
  geojson: string | null;
  mapped: boolean;
  defects: DefectEntry[];
  transfers: TransferEntry[];
  createdAt: string;
  updatedAt: string;
}

function parseMeta(meta: string | null): { defects: DefectEntry[]; transfers: TransferEntry[] } {
  if (!meta) return { defects: [], transfers: [] };
  try {
    const parsed = JSON.parse(meta) as { defects?: DefectEntry[]; transfers?: TransferEntry[] };
    return {
      defects: Array.isArray(parsed.defects) ? parsed.defects : [],
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
    };
  } catch {
    return { defects: [], transfers: [] };
  }
}

function toDto(f: typeof facilities.$inferSelect): FacilityRow {
  const { defects, transfers } = parseMeta(f.meta);
  return {
    id: f.id,
    code: f.code,
    name: f.name,
    geojson: f.geojson,
    mapped: f.geojson !== null,
    defects,
    transfers,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

export function codify(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export async function listFacilities(db: Db, ctx: AuthContext): Promise<FacilityRow[]> {
  const rows = await db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, ctx.orgId))
    .orderBy(desc(facilities.createdAt));
  return rows.map(toDto);
}

export async function getFacility(db: Db, ctx: AuthContext, code: string): Promise<FacilityRow> {
  const rows = await db
    .select()
    .from(facilities)
    .where(and(eq(facilities.organizationId, ctx.orgId), eq(facilities.code, code)))
    .limit(1);
  if (!rows[0]) throw notFound('FACILITY', code);
  return toDto(rows[0]);
}

export interface CreateFacilityInput {
  name: string;
  geojson?: string | null;
}

export async function createFacility(
  db: Db,
  ctx: AuthContext,
  input: CreateFacilityInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<FacilityRow> {
  const exec = async (tx: Tx): Promise<FacilityRow> => {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 160) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'name must be 2–160 characters');
    }
    const code = codify(name);
    if (!code) throw new DomainError(400, 'VALIDATION_ERROR', 'name must contain letters or digits');
    if (input.geojson != null && input.geojson.length > 20_000) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'geojson must be at most 20,000 characters');
    }
    const existing = await tx
      .select({ code: facilities.code })
      .from(facilities)
      .where(and(eq(facilities.organizationId, ctx.orgId), eq(facilities.code, code)))
      .limit(1);
    if (existing[0]) {
      throw new DomainError(409, 'FACILITY_CODE_EXISTS', `facility ${code} already exists in this organization`);
    }

    const [row] = await tx
      .insert(facilities)
      .values({
        organizationId: ctx.orgId,
        code,
        name,
        geojson: input.geojson?.trim() || null,
        meta: JSON.stringify({ defects: [], transfers: [] }),
      })
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'FACILITY_CREATE',
      entityType: 'facility',
      entityId: code,
      requestId: opts.requestId ?? null,
      after: { id: row.id, name: row.name, code: row.code },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'facility.create', ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'facility.create', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export interface UpdateFacilityInput {
  name?: string | null;
  geojson?: string | null;
  defect?: string | null;
  transfer?: { assetCode: string; toCode: string } | null;
}

export async function updateFacility(
  db: Db,
  ctx: AuthContext,
  code: string,
  input: UpdateFacilityInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<FacilityRow> {
  const exec = async (tx: Tx): Promise<FacilityRow> => {
    const rows = await tx
      .select()
      .from(facilities)
      .where(and(eq(facilities.organizationId, ctx.orgId), eq(facilities.code, code)))
      .limit(1);
    if (!rows[0]) throw notFound('FACILITY', code);
    const before = toDto(rows[0]);

    const { defects, transfers } = parseMeta(rows[0].meta);
    const nowIso = new Date().toISOString();
    const patch: Partial<typeof facilities.$inferInsert> = { updatedAt: new Date() };
    const changed: string[] = [];

    if (input.name !== undefined && input.name !== null) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 160) {
        throw new DomainError(400, 'VALIDATION_ERROR', 'name must be 2–160 characters');
      }
      patch.name = name;
      changed.push('name');
    }
    if (input.geojson !== undefined) {
      if (input.geojson !== null && input.geojson.length > 20_000) {
        throw new DomainError(400, 'VALIDATION_ERROR', 'geojson must be at most 20,000 characters');
      }
      patch.geojson = input.geojson?.trim() || null;
      changed.push('geojson');
    }
    if (input.defect !== undefined && input.defect !== null) {
      const text = input.defect.trim();
      if (text.length < 10 || text.length > 500) {
        throw new DomainError(400, 'VALIDATION_ERROR', 'defect note must be 10–500 characters');
      }
      defects.push({ text, at: nowIso, by: ctx.name });
      changed.push('defect');
    }
    if (input.transfer !== undefined && input.transfer !== null) {
      const assetCode = input.transfer.assetCode.trim();
      const toCode = input.transfer.toCode.trim();
      if (assetCode.length < 2 || assetCode.length > 60) {
        throw new DomainError(400, 'VALIDATION_ERROR', 'transfer assetCode must be 2–60 characters');
      }
      if (toCode.length < 1 || toCode.length > 80) {
        throw new DomainError(400, 'VALIDATION_ERROR', 'transfer toCode must be 1–80 characters');
      }
      transfers.push({ assetCode, toCode, at: nowIso, by: ctx.name });
      changed.push('transfer');
    }
    if (changed.length === 0) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'nothing to update — provide name, geojson, defect, or transfer');
    }
    if (changed.includes('defect') || changed.includes('transfer')) {
      patch.meta = JSON.stringify({ defects, transfers });
    }

    const [row] = await tx
      .update(facilities)
      .set(patch)
      .where(and(eq(facilities.organizationId, ctx.orgId), eq(facilities.code, code)))
      .returning();

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'FACILITY_UPDATE',
      entityType: 'facility',
      entityId: code,
      requestId: opts.requestId ?? null,
      before: { name: before.name, mapped: before.mapped, defects: before.defects.length, transfers: before.transfers.length },
      after: { name: row.name, mapped: row.geojson !== null, defects: defects.length, transfers: transfers.length, changed },
    });
    return toDto(row);
  };

  if (!opts.idempotencyKey) return db.transaction(exec);
  const hash = requestHash({ op: 'facility.update', code, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'facility.update', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}
