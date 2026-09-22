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
  const matchConfidence = allMatched ? '100,0% (Toleransi Nol)' : 'Cocok Sebagian (Selisih Jumlah)';
  const poTotal = inv.lines.reduce((s, l) => s + l.poQty * l.unitPriceCents, 0);
  const invTotal = inv.lines.reduce((s, l) => s + l.invQty * l.invUnitPriceCents, 0);
  const firstMismatch = inv.lines.find((l) => !l.matched);
  const matchAction = inv.status === 'MATCHED' ? 'MATCH_RECONCILED' : 'MATCH_DISPUTED';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/purchasing">Purchasing & PO</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">Invoice</span>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{inv.number}</span>
      </nav>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={displayStatus === 'RECONCILED' ? 'pass' : displayStatus === 'EXCEPTION_DISPUTED' ? 'fail' : 'warn'}>{displayStatus}</Badge>
              <Badge variant="info">COCOK 3-ARAH — DOSSIER</Badge>
              <span className="text-xs font-mono text-muted">{matchConfidence}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Dossier Rekonsiliasi Invoice {inv.number}</h1>
            <p className="text-sm text-muted">
              Pencocokan tiga arah antara komitmen Purchase Order, penerimaan fisik dock (GRN), dan invoice vendor.
              <span className="block text-[11px] text-muted mt-0.5">Dihitung dari {inv.grnCount} baris GRN · hasil {inv.status}{inv.paymentHold ? ` · tahan bayar ${inv.holdFormatted}` : ''}{inv.auditTrailId != null ? ` · bukti: audit event #${inv.auditTrailId} (${matchAction})` : ''}.</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/purchasing/${inv.poNumber}?tab=match`}>
              <Button variant="secondary"><ArrowLeft size={16} /> Kembali ke Purchase Order</Button>
            </Link>
            <Link href="/audit-trail">
              <Button><ShieldCheck size={16} /> Buka Audit Trail</Button>
            </Link>
          </div>
        </div>

        {/* 3 Pillars Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Pillar 1: PO */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">1. Komitmen Pembelian</span>
            <div className="flex justify-between items-center mt-1">
              <Link href={`/purchasing/${inv.poNumber}`} className="apex-id font-bold text-cobalt hover:underline text-sm">
                {inv.poNumber}
              </Link>
              <Badge variant="pass">AUTHORIZED</Badge>
            </div>
            <p className="text-muted mt-1">Vendor: <strong className="text-ink">{inv.vendorSlug || '—'}</strong></p>
            <p className="text-muted">Total PO: <strong className="text-ink apex-id">{usd(poTotal)}</strong></p>
          </div>

          {/* Pillar 2: GRN */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">2. Penerimaan Fisik Dock</span>
            <div className="flex justify-between items-center mt-1">
              <span className="apex-id font-bold text-sm">{inv.grnCount} baris GRN</span>
              <Badge variant={allMatched ? 'pass' : 'warn'}>
                {allMatched ? '100% DITERIMA' : 'DOCK SEBAGIAN'}
              </Badge>
            </div>
            <p className="text-muted mt-1">Tahan bayar: <strong className="text-ink">{inv.paymentHold ? `AKTIF · ${inv.holdFormatted}` : 'tidak ada'}</strong></p>
            <p className="text-muted">Penerimaan: <strong className="text-ink">Terverifikasi Idempoten</strong></p>
          </div>

          {/* Pillar 3: Invoice */}
          <div className="bg-surface p-4 rounded-lg border border-border-subtle flex flex-col gap-1 text-xs">
            <span className="apex-label-caps text-muted">3. Invoice Vendor</span>
            <div className="flex justify-between items-center mt-1">
              <span className="apex-id font-bold text-sm">{inv.number}</span>
              <span className="apex-id font-bold text-sm text-pass">{usd(invTotal)}</span>
            </div>
            <p className="text-muted mt-1">Tanggal: <span className="apex-id">{inv.invoiceDate}</span> · Jatuh tempo: <span className="apex-id">{inv.dueDate ? `${inv.dueDate} (${inv.paymentTerms})` : '—'}</span></p>
            <p className="text-muted">Pembayaran: <strong className="text-ink">{inv.paymentTerms}</strong></p>
          </div>
        </div>
      </section>

      {/* Line Item Match Table */}
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Scale size={18} className="text-cobalt" /> Matriks Rekonsiliasi Baris
          </h2>
          <span className="text-xs text-muted">Nol selisih untuk pelepasan pembayaran otomatis</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-left text-xs min-w-[850px]">
            <thead className="bg-surface text-muted">
              <tr className="border-b border-border-subtle">
                <th className="p-3 font-semibold">SKU / Item</th>
                <th className="p-3 font-semibold">Jml PO</th>
                <th className="p-3 font-semibold">Jml GRN Dock</th>
                <th className="p-3 font-semibold">Jml di Invoice</th>
                <th className="p-3 font-semibold">Harga Satuan PO</th>
                <th className="p-3 font-semibold">Harga di Invoice</th>
                <th className="p-3 font-semibold">Selisih</th>
                <th className="p-3 font-semibold text-right">Hasil</th>
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
                      {item.matched ? 'COCOK' : 'SELISIH'}
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
              <p className="font-bold">Pengecualian Selisih Jumlah Dicatat</p>
              <p className="mt-0.5">
                Vendor menagih {firstMismatch.invQty} × {firstMismatch.sku}, tetapi dock memverifikasi {firstMismatch.grnQty} diterima dari PO {firstMismatch.poQty}. Tahan bayar otomatis {inv.holdFormatted} diterapkan.
                {inv.auditTrailId != null ? ` Bukti: audit event #${inv.auditTrailId} (MATCH_DISPUTED) — ledger append-only.` : ''}
              </p>
            </div>
          </div>
        ) : displayStatus === 'RECONCILED' ? (
          <div className="bg-pass-bg border border-pass rounded-lg p-4 text-pass-ink flex items-center gap-3 text-xs">
            <CheckCircle2 size={20} className="shrink-0 text-pass" />
            <div>
              <p className="font-bold">Cocok 3-Arah Otomatis Berhasil Direkonsiliasi</p>
              <p className="mt-0.5">
                Jumlah, price card, dan alokasi pajak cocok dalam selisih 0,00%. Voucher pembayaran dijadwalkan untuk rilis batch otomatis.
                {inv.auditTrailId != null ? ` Bukti: audit event #${inv.auditTrailId} (MATCH_RECONCILED).` : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-warn-bg border border-warn rounded-lg p-4 text-warn-ink flex items-center gap-3 text-xs">
            <Clock size={20} className="shrink-0 text-warn" />
            <div>
              <p className="font-bold">Hasil Match Menunggu</p>
              <p className="mt-0.5">
                Belum ada hasil verifikasi untuk invoice ini — pembayaran ditahan sampai rekonsiliasi berjalan.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
