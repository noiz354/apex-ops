import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { assets, serviceRequests, workOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { notFound } from '../domain/errors';
import { WO_LABELS, slaLabel, type WoStatus } from '../domain/work-orders';
import { SR_LABELS, type SrStatus } from '../domain/service-requests';

export interface AssetRow {
  code: string;
  name: string;
  klass: string;
  location: string;
  oem: string;
  serial: string;
  health: number;
  status: string;
  commissionedOn: string | null;
  openWos: number;
  totalWos: number;
  activeSrs: number;
}

export async function listAssets(db: Db, ctx: AuthContext): Promise<AssetRow[]> {
  const rows = await db
    .select({
      asset: assets,
      totalWos: sql<number>`(select count(*)::int from ${workOrders} w where w.organization_id = ${assets.organizationId} and w.asset_code = ${assets.code})`,
      openWos: sql<number>`(select count(*)::int from ${workOrders} w where w.organization_id = ${assets.organizationId} and w.asset_code = ${assets.code} and w.status not in ('COMPLETED','CANCELLED'))`,
      activeSrs: sql<number>`(select count(*)::int from ${serviceRequests} s where s.organization_id = ${assets.organizationId} and s.asset_code = ${assets.code} and s.status not in ('CONVERTED','CLOSED'))`,
    })
    .from(assets)
    .where(eq(assets.organizationId, ctx.orgId))
    .orderBy(asc(assets.code));
  return rows.map((r) => ({
    code: r.asset.code,
    name: r.asset.name,
    klass: r.asset.klass,
    location: r.asset.location,
    oem: r.asset.oem,
    serial: r.asset.serial,
    health: r.asset.health,
    status: r.asset.status,
    commissionedOn: r.asset.commissionedOn,
    openWos: r.openWos,
    totalWos: r.totalWos,
    activeSrs: r.activeSrs,
  }));
}

export interface AssetRelatedWo {
  number: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  status: WoStatus;
  statusLabel: string;
  slaLabel: string;
}

export interface AssetRelatedSr {
  number: string;
  title: string;
  priority: 'P1' | 'P2' | 'P3';
  status: SrStatus;
  statusLabel: string;
}

export interface AssetDossier {
  asset: AssetRow;
  wos: AssetRelatedWo[];
  srs: AssetRelatedSr[];
}

export async function getAssetDossier(db: Db, ctx: AuthContext, code: string): Promise<AssetDossier> {
  const [assetRows, woRows, srRows] = await Promise.all([
    db.select().from(assets)
      .where(and(eq(assets.organizationId, ctx.orgId), eq(assets.code, code)))
      .limit(1),
    db.select().from(workOrders)
      .where(and(eq(workOrders.organizationId, ctx.orgId), eq(workOrders.assetCode, code)))
      .orderBy(sql`CASE ${workOrders.status} WHEN 'COMPLETED' THEN 1 WHEN 'CANCELLED' THEN 1 ELSE 0 END`, desc(workOrders.updatedAt))
      .limit(20),
    db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.organizationId, ctx.orgId), eq(serviceRequests.assetCode, code)))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(20),
  ]);
  const a = assetRows[0];
  if (!a) throw notFound('ASSET', code);

  const [counts] = await db
    .select({
      totalWos: sql<number>`count(*)::int`,
      openWos: sql<number>`(count(*) filter (where ${workOrders.status} not in ('COMPLETED','CANCELLED')))::int`,
    })
    .from(workOrders)
    .where(and(eq(workOrders.organizationId, ctx.orgId), eq(workOrders.assetCode, code)));
  const [srCounts] = await db
    .select({
      activeSrs: sql<number>`(count(*) filter (where ${serviceRequests.status} not in ('CONVERTED','CLOSED')))::int`,
    })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.organizationId, ctx.orgId), eq(serviceRequests.assetCode, code)));

  return {
    asset: {
      code: a.code,
      name: a.name,
      klass: a.klass,
      location: a.location,
      oem: a.oem,
      serial: a.serial,
      health: a.health,
      status: a.status,
      commissionedOn: a.commissionedOn,
      openWos: counts?.openWos ?? 0,
      totalWos: counts?.totalWos ?? 0,
      activeSrs: srCounts?.activeSrs ?? 0,
    },
    wos: woRows.map((w) => ({
      number: w.number,
      title: w.title,
      priority: w.priority as 'P1' | 'P2' | 'P3',
      status: w.status as WoStatus,
      statusLabel: WO_LABELS[w.status as WoStatus],
      slaLabel: w.status === 'COMPLETED' || w.status === 'CANCELLED' ? '—' : slaLabel(w.slaDueAt),
    })),
    srs: srRows.map((s) => ({
      number: s.number,
      title: s.title,
      priority: s.priority as 'P1' | 'P2' | 'P3',
      status: s.status as SrStatus,
      statusLabel: SR_LABELS[s.status as SrStatus],
    })),
  };
}

export async function findSrByConvertedWo(
  db: Db,
  ctx: AuthContext,
  woNumber: string,
): Promise<{ number: string; title: string } | null> {
  const rows = await db
    .select({ number: serviceRequests.number, title: serviceRequests.title })
    .from(serviceRequests)
    .where(and(
      eq(serviceRequests.organizationId, ctx.orgId),
      eq(serviceRequests.convertedWoNumber, woNumber),
    ))
    .limit(1);
  return rows[0] ?? null;
}
