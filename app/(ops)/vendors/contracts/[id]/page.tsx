import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ShieldAlert, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { getDb } from '@/db/client';
import { getSessionContext } from '@/lib/auth/context';
import { listVendors } from '@/lib/services/vendor-service';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.msa },
    { id: 'MSA-2023-ABB-04' },
    { id: 'MSA-2025-SBT-11' },
    { id: 'MSA-2023-JCI-07' },
    { id: 'MSA-CATALOG-BLANKET' },
  ];
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const vendors = await listVendors(getDb(), ctx);
  const vendor = vendors.find((v) => v.msaNumber === id);
  if (!vendor) {
    return (
      <>
        <nav className="flex items-center gap-2 text-sm">
          <Link className="text-muted hover:text-cobalt font-medium" href="/vendors">Vendors</Link>
          <span className="text-muted">/</span>
          <span className="font-semibold apex-id">{id}</span>
        </nav>
        <EmptyState
          title="No contract on record"
          description={`${id} is not linked to any vendor MSA in this organization. Contract references resolve only against stored vendor records.`}
        />
      </>
    );
  }

  const isExpired = vendor.msaStatus === 'EXPIRED';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm">
        <Link className="text-muted hover:text-cobalt font-medium" href="/vendors">Vendors</Link>
        <span className="text-muted">/</span>
        <Link className="text-muted hover:text-cobalt font-medium" href={`/vendors/${vendor.slug}`}>{vendor.name}</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{vendor.msaNumber}</span>
      </nav>

      {isExpired && (
        <div className="bg-fail-bg border border-fail rounded-lg p-4 flex items-center justify-between gap-4 text-fail-ink shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert size={24} className="shrink-0 text-fail" />
            <div>
              <p className="font-bold text-sm">Contract Agreement Expired</p>
              <p className="text-xs">
                This Master Service Agreement expired on {vendor.msaExpiresOn}. Renew it on the vendor profile before dispatching new work.
              </p>
            </div>
          </div>
          <Link href={`/vendors/${vendor.slug}`}>
            <Button variant="destructive">Open Vendor Profile</Button>
          </Link>
        </div>
      )}

      {/* Hero Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileText size={18} className="text-cobalt" />
            <Badge variant={isExpired ? 'fail' : 'pass'}>{vendor.msaStatus}</Badge>
            <Badge variant="info">REFERENCE VIEW</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{vendor.msaNumber}</h1>
          <p className="text-sm text-muted">
            Master Service Agreement with <Link href={`/vendors/${vendor.slug}`} className="text-cobalt font-semibold hover:underline">{vendor.name}</Link>
          </p>
          <p className="text-xs text-muted mt-1">{vendor.scope ?? 'No scope recorded on the vendor profile.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/vendors/${vendor.slug}`}>
            <Button variant="secondary"><ArrowLeft size={16} /> Back to Vendor Profile</Button>
          </Link>
        </div>
      </div>

      {/* KPIs — vendor-record values only */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
        <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
          <span className="apex-label-caps text-muted">Expiration Date</span>
          <span className="text-base font-bold text-ink">{vendor.msaExpiresOn ?? '—'}</span>
          <span className={isExpired ? 'text-[11px] text-fail font-bold' : 'text-[11px] text-pass font-bold'}>
            {vendor.daysLeft === null ? 'No expiry recorded' : isExpired ? 'EXPIRED' : `${vendor.daysLeft} days remaining`}
          </span>
        </div>
        <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
          <span className="apex-label-caps text-muted">Vendor Tier</span>
          <span className="text-base font-bold text-ink">{vendor.tier}</span>
          <span className="text-[11px] text-muted">From vendor record</span>
        </div>
        <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
          <span className="apex-label-caps text-muted">Vendor On-Time</span>
          <span className="text-base font-bold text-ink">{vendor.onTimePct === null ? '—' : `${vendor.onTimePct}%`}</span>
          <span className="text-[11px] text-muted">Vendor record — not audited proof</span>
        </div>
        <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
          <span className="apex-label-caps text-muted">Contact</span>
          <span className="text-base font-bold text-ink truncate">{vendor.contact ?? '—'}</span>
          <span className="text-[11px] text-muted">From vendor record</span>
        </div>
      </div>

      {/* Grid: Signatories & Amendments — honest empty states */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-6 bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h2 className="text-base font-semibold">Authorized Signatories</h2>
            <Badge variant="info">NOT STORED</Badge>
          </div>
          <EmptyState
            title="No signatory records"
            description="Signatory names, titles and signature dates are not stored in the backend yet. Nothing is shown instead of a plausible-looking roster."
          />
        </section>

        <section className="xl:col-span-6 bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h2 className="text-base font-semibold">Contract Amendments &amp; Addendums</h2>
            <Badge variant="info">NOT STORED</Badge>
          </div>
          <EmptyState
            title="No amendments recorded"
            description="Amendment history lives in the signed document, not in the database. Status changes to the MSA itself are tracked on the vendor profile."
          />
        </section>
      </div>
    </>
  );
}
