import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { getSessionContext } from '@/lib/auth/context';
import { getDb } from '@/db/client';
import { getAssetDossier } from '@/lib/services/asset-service';
import { DomainError } from '@/lib/domain/errors';
import { CANON, ID_FORMATS } from '@/lib/canon';

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  if (!ID_FORMATS.asset.test(id)) {
    return (
      <EmptyState
        title="Invalid asset code"
        description={`"${id}" is not an asset code (expected AST-XXX-NNN).`}
        action={<Link href="/assets"><Button>Back to Asset Registry</Button></Link>}
      />
    );
  }

  let dossier;
  try {
    dossier = await getAssetDossier(getDb(), ctx, id);
  } catch (err) {
    if (err instanceof DomainError && err.status === 404) {
      return (
        <EmptyState
          title={`Asset ${id} not found`}
          description="This asset does not exist in your organization's registry (cross-tenant reads are denied as 404). Run npm run db:setup if the dev database was wiped."
          action={<Link href="/assets"><Button>Back to Asset Registry</Button></Link>}
        />
      );
    }
    throw err;
  }

  const { asset, wos, srs } = dossier;
  const isSeal = asset.code === CANON.assetSeal;
  const healthTone = asset.health >= 85 ? 'pass' : asset.health >= 70 ? 'warn' : 'fail';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/assets">Asset Registry</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{asset.code}</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="ad-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={healthTone}>HEALTH {asset.health}/100</Badge>
              <Badge variant={asset.status === 'OPERATIONAL' ? 'pass' : 'warn'}>{asset.status}</Badge>
              <Badge variant="info">{asset.klass}</Badge>
            </div>
            <h1 id="ad-h" className="text-2xl font-semibold tracking-tight">
              {asset.name} <span className="apex-id text-cobalt font-semibold">{asset.code}</span>
            </h1>
            <p className="text-[13px] text-muted">
              {asset.oem} · S/N <span className="apex-id">{asset.serial}</span> · {asset.location}
              {asset.commissionedOn && <> · commissioned <span className="apex-id">{asset.commissionedOn}</span></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="apex-label-caps text-muted">Real workload</span>
            <span className="text-xl font-semibold tabular-nums">{asset.openWos} open WO · {asset.activeSrs} active SR</span>
            <span className="apex-id text-muted">{asset.totalWos} work orders all-time on this asset</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-lg border border-border-subtle bg-surface p-3 items-center">
          <span className="text-[13px] font-semibold">Asset Operations &amp; Schematic:</span>
          {isSeal ? (
            <>
              <Link href={`/field/findings/${CANON.finding}`}><Button variant="secondary">{CANON.finding}</Button></Link>
              <Link href={`/service-requests/${CANON.serviceRequest}`}><Button variant="secondary">{CANON.serviceRequest}</Button></Link>
              <Link href={`/work-orders/${CANON.workOrderSeal}`}><Button variant="secondary">{CANON.workOrderSeal}</Button></Link>
            </>
          ) : (
            <>
              <Link href={`/work-orders/new?asset=${asset.code}&location=${encodeURIComponent(asset.location)}`}>
                <Button variant="secondary">Dispatch Work Order</Button>
              </Link>
              <Link href={`/field-inspections/new?asset=${asset.code}&location=${encodeURIComponent(asset.location)}`}>
                <Button variant="secondary">Schedule Inspection</Button>
              </Link>
            </>
          )}
          <Link href={`/assets/${asset.code}/bim`}>
            <Button variant="ghost">BIM &amp; Telemetry Schematic →</Button>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-label="Work orders">
          <h2 className="text-base font-semibold">Work Orders on this asset</h2>
          {wos.length === 0 && <p className="text-[13px] text-muted">No work orders reference {asset.code} yet — convert an SR or create one from the Work Orders screen.</p>}
          <ul className="flex flex-col divide-y divide-surface-subtle">
            {wos.map((w) => (
              <li key={w.number} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/work-orders/${w.number}`} className="apex-id font-bold text-cobalt hover:underline">{w.number}</Link>
                  <p className="text-[13px] truncate">{w.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={w.priority === 'P1' ? 'fail' : w.priority === 'P2' ? 'warn' : 'info'}>{w.priority}</Badge>{' '}
                  <Badge variant={w.status === 'COMPLETED' ? 'pass' : w.status === 'ON_HOLD' || w.status === 'ESCALATED' ? 'fail' : 'warn'}>{w.statusLabel}</Badge>
                  <p className="apex-id text-[11px] text-muted">{w.slaLabel}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-label="Service requests">
          <h2 className="text-base font-semibold">Service Requests on this asset</h2>
          {srs.length === 0 && <p className="text-[13px] text-muted">No service requests reference {asset.code} yet.</p>}
          <ul className="flex flex-col divide-y divide-surface-subtle">
            {srs.map((s) => (
              <li key={s.number} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/service-requests/${s.number}`} className="apex-id font-bold text-cobalt hover:underline">{s.number}</Link>
                  <p className="text-[13px] truncate">{s.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={s.priority === 'P1' ? 'fail' : s.priority === 'P2' ? 'warn' : 'info'}>{s.priority}</Badge>{' '}
                  <Badge variant={s.status === 'CONVERTED' ? 'pass' : s.status === 'BREACHED' ? 'fail' : 'warn'}>{s.statusLabel}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted" role="note">
            Registry edits (health updates, BOM/parts linkage, decommission) arrive with the inventory slice — this dossier
            does not fake mutations. Telemetry cards on the seal hub remain simulated.
          </p>
        </section>
      </div>
    </>
  );
}
