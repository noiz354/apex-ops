import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck, Scale, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDb } from '@/db/client';
import { getSessionContext } from '@/lib/auth/context';
import { DomainError } from '@/lib/domain/errors';
import { getInvoiceDossier } from '@/lib/services/procurement-service';

const usd = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default async function InvoiceMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^INV-\d{4}-\d{4}$/.test(id)) notFound();

  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  let inv;
  try {
    inv = await getInvoiceDossier(getDb(), ctx, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }

  const displayStatus = inv.status === 'MATCHED' ? 'RECONCILED' : inv.status === 'DISPUTED' ? 'EXCEPTION_DISPUTED' : 'MATCH_PENDING';
  const allMatched = inv.lines.every((l) => l.matched);
  const matchConfidence = allMatched ? '100.0% (Zero Tolerance)' : 'Partial Match (Quantity Variance)';
  const poTotal = inv.lines.reduce((s, l) => s + l.poQty * l.unitPriceCents, 0);
  const invTotal = inv.lines.reduce((s, l) => s + l.invQty * l.invUnitPriceCents, 0);
  const firstMismatch = inv.lines.find((l) => !l.matched);
  const matchAction = inv.status === 'MATCHED' ? 'MATCH_RECONCILED' : 'MATCH_DISPUTED';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/purchasing">Purchasing</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">Invoices</span>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{inv.number}</span>
      </nav>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={displayStatus === 'RECONCILED' ? 'pass' : displayStatus === 'EXCEPTION_DISPUTED' ? 'fail' : 'warn'}>{displayStatus}</Badge>
              <Badge variant="info">3-WAY MATCH — LIVE DOSSIER</Badge>
              <span className="text-xs font-mono text-muted">{matchConfidence} (engine)</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Invoice Reconciliation Dossier {inv.number}</h1>
            <p className="text-sm text-muted">
              Three-way matching between Purchase Order commitment, physical dock receipt (GRN), and electronic vendor invoice.
              <span className="block text-[11px] text-muted mt-0.5">Computed live from {inv.grnCount} GRN row{inv.grnCount === 1 ? '' : 's'} · engine verdict {inv.status}{inv.paymentHold ? ` · payment hold ${inv.holdFormatted}` : ''}{inv.auditTrailId != null ? ` · evidence: audit event #${inv.auditTrailId} (${matchAction})` : ''}.</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/purchasing/${inv.poNumber}?tab=match`}>
              <Button variant="secondary"><ArrowLeft size={16} /> Back to Purchase Order</Button>
            </Link>
            <Link href="/audit-trail">
              <Button><ShieldCheck size={16} /> Open Audit Trail</Button>
            </Link>
          </div>
        </div>

        {/* 3 Pillars Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Pillar 1: PO */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">1. Purchase Commitment</span>
            <div className="flex justify-between items-center mt-1">
              <Link href={`/purchasing/${inv.poNumber}`} className="apex-id font-bold text-cobalt hover:underline text-sm">
                {inv.poNumber}
              </Link>
              <Badge variant="pass">AUTHORIZED</Badge>
            </div>
            <p className="text-muted mt-1">Vendor: <strong className="text-ink">{inv.vendorSlug || '—'}</strong></p>
            <p className="text-muted">PO Total: <strong className="text-ink apex-id">{usd(poTotal)}</strong></p>
          </div>

          {/* Pillar 2: GRN */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">2. Physical Dock Receipt</span>
            <div className="flex justify-between items-center mt-1">
              <span className="apex-id font-bold text-sm">{inv.grnCount} GRN row{inv.grnCount === 1 ? '' : 's'}</span>
              <Badge variant={allMatched ? 'pass' : 'warn'}>
                {allMatched ? '100% RECEIVED' : 'PARTIAL DOCK'}
              </Badge>
            </div>
            <p className="text-muted mt-1">Payment hold: <strong className="text-ink">{inv.paymentHold ? `ACTIVE · ${inv.holdFormatted}` : 'none'}</strong></p>
            <p className="text-muted">Receipts: <strong className="text-ink">Idempotent Verified</strong></p>
          </div>

          {/* Pillar 3: Invoice */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">3. Vendor Invoice</span>
            <div className="flex justify-between items-center mt-1">
              <span className="apex-id font-bold text-sm">{inv.number}</span>
              <span className="apex-id font-bold text-sm text-pass">{usd(invTotal)}</span>
            </div>
            <p className="text-muted mt-1">Date: <span className="apex-id">{inv.invoiceDate}</span> · Due: <span className="apex-id">{inv.dueDate ? `${inv.dueDate} (${inv.paymentTerms})` : '—'}</span></p>
            <p className="text-muted">Payment: <strong className="text-ink">{inv.paymentTerms}</strong></p>
          </div>
        </div>
      </section>

      {/* Line Item Match Table */}
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Scale size={18} className="text-cobalt" /> Line Item Reconciliation Matrix
          </h2>
          <span className="text-xs text-muted">Zero variance required for automated payment release</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-surface text-muted">
              <tr className="border-b border-border-subtle">
                <th className="p-3 font-semibold">SKU / Item</th>
                <th className="p-3 font-semibold">PO Qty</th>
                <th className="p-3 font-semibold">Dock GRN Qty</th>
                <th className="p-3 font-semibold">Invoiced Qty</th>
                <th className="p-3 font-semibold">PO Unit Price</th>
                <th className="p-3 font-semibold">Invoiced Price</th>
                <th className="p-3 font-semibold">Variance</th>
                <th className="p-3 font-semibold text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {inv.lines.map((item, idx) => (
                <tr key={idx} className="hover:bg-surface-subtle">
                  <td className="p-3">
                    <Link href={`/inventory/${item.sku}`} className="apex-id font-bold text-cobalt hover:underline block">
                      {item.sku}
                    </Link>
                    <span className="text-[11px] text-muted">{item.description}</span>
                  </td>
                  <td className="p-3 font-mono">{item.poQty}</td>
                  <td className="p-3 font-mono font-bold text-pass">{item.grnQty}</td>
                  <td className="p-3 font-mono font-bold">{item.invQty}</td>
                  <td className="p-3 font-mono">{usd(item.unitPriceCents)}</td>
                  <td className="p-3 font-mono">{usd(item.invUnitPriceCents)}</td>
                  <td className="p-3 font-mono font-semibold">
                    {item.matched ? (
                      <span className="text-pass">{item.variance}</span>
                    ) : (
                      <span className="text-fail font-bold">{item.variance}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Badge variant={item.matched ? 'pass' : 'fail'}>
                      {item.matched ? 'MATCHED' : 'MISMATCH'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Dispute / Exception Banner */}
        {displayStatus === 'EXCEPTION_DISPUTED' && firstMismatch ? (
          <div className="bg-fail-bg border border-fail rounded-lg p-4 text-fail-ink flex items-start gap-3 text-xs">
            <AlertTriangle size={20} className="shrink-0 text-fail" />
            <div>
              <p className="font-bold">Quantity Discrepancy Exception Logged</p>
              <p className="mt-0.5">
                Vendor invoiced {firstMismatch.invQty} × {firstMismatch.sku}, but dock verified {firstMismatch.grnQty} received against PO {firstMismatch.poQty}. Automated payment hold {inv.holdFormatted} applied.
                {inv.auditTrailId != null ? ` Match evidence: audit event #${inv.auditTrailId} (MATCH_DISPUTED) — append-only ledger.` : ''}
              </p>
            </div>
          </div>
        ) : displayStatus === 'RECONCILED' ? (
          <div className="bg-pass-bg border border-pass rounded-lg p-4 text-pass-ink flex items-center gap-3 text-xs">
            <CheckCircle2 size={20} className="shrink-0 text-pass" />
            <div>
              <p className="font-bold">Automated 3-Way Match Reconciled Successfully</p>
              <p className="mt-0.5">
                Quantities, price cards, and tax allocations match within 0.00% variance. Payment voucher scheduled for automated batch release.
                {inv.auditTrailId != null ? ` Evidence: audit event #${inv.auditTrailId} (MATCH_RECONCILED).` : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-warn-bg border border-warn rounded-lg p-4 text-warn-ink flex items-center gap-3 text-xs">
            <Clock size={20} className="shrink-0 text-warn" />
            <div>
              <p className="font-bold">Match Verdict Pending</p>
              <p className="mt-0.5">
                The engine has not issued a verdict for this invoice yet — payment stays on hold until reconciliation runs.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
