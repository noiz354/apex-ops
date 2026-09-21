import type { NextRequest } from 'next/server';
import { and, eq, ilike, or } from 'drizzle-orm';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { assets, parts, serviceRequests, workOrders } from '@/db/schema';
import { log } from '@/lib/log';

export interface SearchResultItem {
  id: string;
  type: 'work_order' | 'service_request' | 'asset' | 'part';
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
}

export async function GET(req: NextRequest) {
  return withRoute({ op: 'search.query', method: 'GET', permission: 'wo.read' }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('q') || '').trim();

    if (!query || query.length < 2) {
      return { data: { query, results: [] } };
    }

    const db = getDb();
    const orgId = ctx!.orgId;
    const pattern = `%${query}%`;

    const section = <T>(name: string, fn: () => Promise<T[]>): Promise<T[]> =>
      fn().catch((err) => {
        log('warn', 'search_section_failed', {
          section: name,
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as T[];
      });

    const [wos, srs, asts, prts] = await Promise.all([
      section('work_orders', () =>
        db
          .select({
            number: workOrders.number,
            title: workOrders.title,
            status: workOrders.status,
            assetCode: workOrders.assetCode,
          })
          .from(workOrders)
          .where(
            and(
              eq(workOrders.organizationId, orgId),
              or(ilike(workOrders.number, pattern), ilike(workOrders.title, pattern), ilike(workOrders.assetCode, pattern)),
            ),
          )
          .limit(6),
      ),
      section('service_requests', () =>
        db
          .select({
            number: serviceRequests.number,
            title: serviceRequests.title,
            status: serviceRequests.status,
          })
          .from(serviceRequests)
          .where(
            and(
              eq(serviceRequests.organizationId, orgId),
              or(ilike(serviceRequests.number, pattern), ilike(serviceRequests.title, pattern)),
            ),
          )
          .limit(5),
      ),
      section('assets', () =>
        db
          .select({
            code: assets.code,
            name: assets.name,
            klass: assets.klass,
            location: assets.location,
          })
          .from(assets)
          .where(
            and(
              eq(assets.organizationId, orgId),
              or(ilike(assets.code, pattern), ilike(assets.name, pattern), ilike(assets.klass, pattern)),
            ),
          )
          .limit(5),
      ),
      section('parts', () =>
        db
          .select({
            sku: parts.sku,
            name: parts.name,
            bin: parts.bin,
            onHand: parts.onHand,
          })
          .from(parts)
          .where(
            and(
              eq(parts.organizationId, orgId),
              or(ilike(parts.sku, pattern), ilike(parts.name, pattern)),
            ),
          )
          .limit(5),
      ),
    ]);

    const results: SearchResultItem[] = [];
    for (const w of wos) {
      results.push({
        id: w.number,
        type: 'work_order',
        title: `${w.number} — ${w.title}`,
        subtitle: `Asset: ${w.assetCode || 'N/A'} • Status: ${w.status}`,
        badge: w.status,
        href: `/work-orders/${w.number}`,
      });
    }
    for (const s of srs) {
      results.push({
        id: s.number,
        type: 'service_request',
        title: `${s.number} — ${s.title}`,
        subtitle: `Status: ${s.status}`,
        badge: s.status,
        href: `/service-requests/${s.number}`,
      });
    }
    for (const a of asts) {
      results.push({
        id: a.code,
        type: 'asset',
        title: `${a.code} — ${a.name}`,
        subtitle: `Class: ${a.klass} • Loc: ${a.location || 'N/A'}`,
        badge: a.klass,
        href: `/assets/${a.code}`,
      });
    }
    for (const p of prts) {
      results.push({
        id: p.sku,
        type: 'part',
        title: `${p.sku} — ${p.name}`,
        subtitle: `Bin: ${p.bin} • Stock: ${p.onHand} units`,
        badge: `${p.onHand} in stock`,
        href: `/inventory/${p.sku}`,
      });
    }

    return { data: { query, results } };
  });
}
