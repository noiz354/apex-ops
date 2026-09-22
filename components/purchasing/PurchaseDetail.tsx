'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { AuthDialog, DisputeDialog, RejectDialog, RfqDialog, type DisputeKind } from './dialogs';
import { ToastStack } from '@/components/ui/toast-stack';
import { useToasts } from '@/lib/use-toasts';
import type { ServerDoc } from './PurchaseList';
import { ApiError, apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

export type PurchaseTab = 'review' | 'receiving' | 'match' | 'signatures';
const TABS: { id: PurchaseTab; label: string }[] = [
  { id: 'review', label: 'Tinjau' },
  { id: 'receiving', label: 'Penerimaan · GRN' },
  { id: 'match', label: 'Cocok 3-Arah' },
  { id: 'signatures', label: 'Tanda Tangan' },
];

interface GrnRow {
  number: string;
  poNumber: string;
  waybill: string;
  dockLocation: string;
  status: 'RECEIVED' | 'DISPUTED';
  verifiedBy: string;
  createdAt: string;
}

const statusTone = (s: string) =>
  (s.startsWith('REJECTED') ? 'fail'
    : s === 'PARTIAL' || s === 'PENDING_APPROVAL' || s === 'CREATED' ? 'warn'
    : s === 'APPROVED' ? 'info' : 'pass') as 'pass' | 'warn' | 'fail' | 'info' | 'hold';

export function PurchaseDetail({ initialTab, docId }: { initialTab: PurchaseTab; docId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<PurchaseTab>(initialTab);
  const { toasts, push, dismiss } = useToasts(9000);
  const [doc, setDoc] = useState<ServerDoc | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [slaLeft, setSlaLeft] = useState<number | null>(null);

  const [waybill, setWaybill] = useState('');
  const [grnSku, setGrnSku] = useState('');
  const [grnQty, setGrnQty] = useState('1');
  const [grnDock, setGrnDock] = useState('Dock Bay 02');
  const [stepUp, setStepUp] = useState('');
  const [grnBusy, setGrnBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [lastGrn, setLastGrn] = useState<GrnRow | null>(null);
  const [grnTouched, setGrnTouched] = useState(false);

  interface MatchedInvoice { number: string; poNumber: string; status: string; paymentHold: boolean; invoiceDate: string; createdAt: string }
  const [matched, setMatched] = useState<MatchedInvoice[] | null>(null);

  const errMsg = (e: unknown) =>
    e instanceof ApiError ? `${e.message} (${e.code})` : 'Kesalahan tak terduga — tidak ada yang dikirim.';

  const load = useCallback(async () => {
    setState('loading');
    setLoadError('');
    try {
      const list = await apiFetch<ServerDoc[]>(`/api/purchasing?number=${encodeURIComponent(docId)}`);
      const d = list[0] ?? null;
      if (!d) {
        setState('error');
        setLoadError(`Dokumen ${docId} tidak ditemukan.`);
        return;
      }
      setDoc(d);
      setState('live');
      if (d.kind === 'PO') {
        try {
          const inv = await apiFetch<{ rows: MatchedInvoice[] }>(`/api/purchasing/invoices?poNumber=${encodeURIComponent(d.number)}`);
          setMatched(inv.rows ?? []);
        } catch {
          setMatched(null);
        }
      } else {
        setMatched([]);
      }
      if (!grnSku && d.lineItems[0]) setGrnSku(d.lineItems[0].sku);
      setSlaLeft(d.slaDueAt ? Math.max(0, Math.floor((new Date(d.slaDueAt).getTime() - Date.now()) / 1000)) : null);
    } catch (e) {
      setState('error');
      setLoadError(errMsg(e));
    }
  }, [docId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (slaLeft === null) return;
    const t = setInterval(() => setSlaLeft((s) => (s !== null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(t);
  }, [slaLeft === null]);

  const breached = slaLeft !== null && slaLeft === 0;

  const showTab = (t: PurchaseTab) => {
    setTab(t);
    router.replace(`/purchasing/${docId}?tab=${t}`, { scroll: false });
  };

  const qtyNum = parseInt(grnQty, 10);
  const grnOk = waybill.trim().length > 0 && grnSku.trim().length > 0
    && Number.isInteger(qtyNum) && qtyNum > 0 && /^\d{6}$/.test(stepUp);

  const postGrn = async () => {
    setGrnTouched(true);
    if (!grnOk || grnBusy || !doc || doc.kind !== 'PO') return;
    setGrnBusy(true);
    try {
      const grn = await apiFetch<GrnRow>('/api/purchasing/grn', {
        method: 'POST',
        body: {
          poNumber: doc.number,
          waybill: waybill.trim(),
          dockLocation: grnDock.trim() || undefined,
          skuReceived: grnSku.trim(),
          qtyReceived: qtyNum,
          stepUpCode: stepUp,
        },
      });
      setLastGrn(grn);
      setStepUp('');
      push(true, 'GRN tercatat', `${grn.number} TERVERIFIKASI · ${qtyNum} ea ${grnSku.trim()} → stok · PO ${grn.poNumber} DITERIMA.`);
      await load();
    } catch (e) {
      push(false, 'GRN gagal', errMsg(e));
    } finally {
      setGrnBusy(false);
    }
  };

  const onDisputed = (_kind: DisputeKind) => {
    push(false, 'Selisih dicatat lokal', 'Belum ada endpoint sengketa — status GRN tidak berubah.');
  };

  const postConvert = async () => {
    if (!doc || doc.kind !== 'PR' || doc.status !== 'APPROVED' || convertBusy) return;
    setConvertBusy(true);
    try {
      const res = await apiFetch<{ pr: { poNumber: string; alreadyConverted: boolean } }>(
        `/api/purchasing/${encodeURIComponent(doc.number)}/convert`,
        { method: 'POST', body: {} },
      );
      push(true, 'PR menjadi PO',
        `${doc.number} → ${res.pr.poNumber}${res.pr.alreadyConverted ? ' (sudah dikonversi — PO lama dikembalikan)' : ''}. Baris disalin; PR kini CONVERTED.`);
      await load();
    } catch (e) {
      push(false, 'Konversi gagal', errMsg(e));
    } finally {
      setConvertBusy(false);
    }
  };

  const [busyExport, setBusyExport] = useState(false);
  const exportLines = async () => {
    if (!doc || busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [
        ['sku', 'description', 'quantity', 'unit_price', 'total'],
        ...doc.lineItems.map((l) => [l.sku, l.description, l.quantity, l.priceFormatted, l.totalFormatted]),
      ];
      await exportTableCsv(`${doc.number}-lines.csv`, table);
      push(true, 'Ekspor berhasil', `${doc.lineItems.length} baris → ${doc.number}-lines.csv (data server).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/purchasing">Purchasing &amp; PO</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{docId}</span>
      </nav>

      {state === 'loading' && <TableSkeleton rows={8} />}

      {state === 'error' && (
        <section className="bg-card border border-fail rounded-lg p-6 flex flex-col gap-2" role="alert">
          <h1 className="text-lg font-semibold text-fail-ink">Dokumen tidak tersedia</h1>
          <p className="text-sm text-muted">{loadError}</p>
          <div><Button variant="secondary" onClick={() => void load()}>Coba lagi</Button></div>
        </section>
      )}

      {state === 'live' && doc && (
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="po-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusTone(doc.status)}>{doc.status}</Badge>
              <Badge variant="pass">Data server</Badge>
              {slaLeft !== null && (breached ? (
                <Badge variant="fail" pulse>SLA TERLEWATI — eskalasi ke VP Operasi</Badge>
              ) : (
                <Badge variant="warn">SLA · <span className="tabular-nums">{Math.floor(slaLeft / 60)}m {String(slaLeft % 60).padStart(2, '0')}s</span> tersisa</Badge>
              ))}
            </div>
            <h1 id="po-title" className="text-2xl font-semibold tracking-tight">
              {doc.number} <span className="text-base font-normal text-muted">· {doc.title}</span>
            </h1>
            <p className="text-[13px] text-muted">
              Slug vendor <span className="apex-id font-semibold">{doc.vendorSlug ?? '—'}</span>
              {' '}· Dibuat <span className="apex-id">{new Date(doc.createdAt).toLocaleString()}</span>
            </p>
            <p className="text-[13px]">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-surface-subtle">
                Nilai: <strong className="apex-id text-cobalt">{doc.totalFormatted}</strong>
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <AuthDialog push={push} docId={doc.number} amount={doc.totalFormatted} status={doc.status} onDecided={() => void load()} />
            <RfqDialog push={push} sku={doc.lineItems[0]?.sku ?? doc.number} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={exportLines} disabled={busyExport}>Ekspor baris</Button>
              {doc.kind === 'PO' && <Link href={`/purchasing/${doc.number}/print`}><Button variant="secondary">Cetak Batch PO</Button></Link>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border-subtle" role="tablist" aria-label="Tab purchasing">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => showTab(t.id)}
              className={cn(
                'h-10 px-4 text-[13px] font-semibold border-b-2',
                tab === t.id ? 'border-cobalt-deep text-cobalt' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'review' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Detail Dokumen — {doc.number}</h2>
                <Badge variant={statusTone(doc.status)}>{doc.status}</Badge>
              </div>
              <div className="overflow-x-auto rounded border border-border-subtle mt-2">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-muted">
                    <tr>
                      <th className="p-2">Baris / SKU</th>
                      <th className="p-2">Deskripsi</th>
                      <th className="p-2">Jumlah</th>
                      <th className="p-2">Harga Satuan</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {doc.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2 apex-id font-bold text-cobalt">
                          <Link href={`/inventory/${item.sku}`} className="hover:underline">{item.sku}</Link>
                        </td>
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 apex-id">{item.quantity}</td>
                        <td className="p-2 apex-id">{item.priceFormatted}</td>
                        <td className="p-2 text-right apex-id font-bold">{item.totalFormatted}</td>
                      </tr>
                    ))}
                    {doc.lineItems.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted">Belum ada baris tercatat.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
                <span>Total Nilai <strong className="apex-id">{doc.totalFormatted}</strong></span>
                <span className="flex gap-2 ml-auto">
                  <RejectDialog push={push} docId={doc.number} onDecided={() => void load()} />
                </span>
              </div>
              <p className="text-xs text-muted" role="status">
                {doc.status === 'APPROVED' && `${doc.number} disetujui — tercatat di audit trail. Pengiriman tetap manual.`}
                {doc.status === 'CONVERTED' && `${doc.number} menjadi PO — lihat audit trail untuk nomor PO.`}
                {doc.status === 'REJECTED' && `${doc.number} ditolak — alasan tercatat di audit trail.`}
                {(doc.status === 'PENDING_APPROVAL' || doc.status === 'CREATED') && 'Menunggu keputusan procurement (setujui atau tolak dengan alasan).'}
                {['DISPATCHED', 'RECEIVED', 'PARTIAL'].includes(doc.status) && `${doc.number} berstatus ${doc.status} — keputusan bersifat final.`}
              </p>
              {doc.kind === 'PR' && doc.status === 'APPROVED' && (
                <div className="mt-2">
                  <Button onClick={postConvert} disabled={convertBusy}>
                    {convertBusy ? 'Mengonversi…' : 'Konversi ke Purchase Order'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'receiving' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Penerimaan Barang — Dock Bay 02</h2>
                {lastGrn && <Badge variant="pass">{lastGrn.number} VERIFIED</Badge>}
              </div>
              {doc.kind !== 'PO' ? (
                <p className="text-[13px] text-muted" role="status">Penerimaan barang hanya untuk purchase order — {doc.number} adalah {doc.kind}.</p>
              ) : (
                <>
                  <p className="text-[13px] text-muted">Pengiriman idempoten (kunci sama saat retry, double-post dicegah). Butuh kode approver 6 digit — GRN mengubah stok.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-wb">Waybill (wajib)</label>
                      <Input id="grn-wb" value={waybill} onChange={(e) => setWaybill(e.target.value)} invalid={grnTouched && !waybill.trim()} placeholder="mis. FX-9920148-US" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-dock">Lokasi dock</label>
                      <Input id="grn-dock" value={grnDock} onChange={(e) => setGrnDock(e.target.value)} placeholder="Dock Bay 02" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-sku">SKU diterima (wajib)</label>
                      <Input id="grn-sku" value={grnSku} onChange={(e) => setGrnSku(e.target.value)} invalid={grnTouched && !grnSku.trim()} placeholder="mis. PART-SEAL-8821" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-qty">Jml (wajib)</label>
                      <Input id="grn-qty" value={grnQty} onChange={(e) => setGrnQty(e.target.value)} invalid={grnTouched && !(Number.isInteger(qtyNum) && qtyNum > 0)} placeholder="1" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-step">Kode approver — authenticator, 6 digit (wajib)</label>
                      <Input id="grn-step" value={stepUp} onChange={(e) => setStepUp(e.target.value)} invalid={grnTouched && !/^\d{6}$/.test(stepUp)} placeholder="••••••" className="apex-id" inputMode="numeric" maxLength={6} />
                    </div>
                  </div>
                  {grnTouched && !grnOk && (
                    <p className="text-[11px] font-semibold text-fail">Waybill + SKU + jml ≥ 1 + kode approver 6 digit wajib diisi.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void postGrn()} disabled={grnBusy}>{grnBusy ? 'Mengirim…' : 'Kirim GRN'}</Button>
                    <DisputeDialog push={push} onDisputed={onDisputed} docId={doc.number} />
                  </div>
                  {lastGrn && (
                    <p className="text-[13px] text-muted" role="status">
                      {lastGrn.number} · {lastGrn.status} · waybill {lastGrn.waybill} · verified by {lastGrn.verifiedBy} · {new Date(lastGrn.createdAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'match' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Cocok 3-Arah — PO · GRN · Invoice</h2>
                <Badge variant="pass">AKTIF</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">{doc.number}</p>
                  <p className="apex-id font-bold">{doc.totalFormatted} · {doc.lineItems.length} baris</p>
                  <p className="text-pass font-semibold">Order tercatat ✓</p>
                </div>
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">Status GRN</p>
                  <p className="apex-id font-bold">{lastGrn ? `${lastGrn.number} · ${lastGrn.status}` : doc.status === 'RECEIVED' ? 'Diterima (GRN lama)' : 'Belum ada GRN'}</p>
                  <p className="text-muted text-xs">Kirim GRN di tab Penerimaan.</p>
                </div>
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">Invoice</p>
                  {matched === null && <p className="text-muted text-xs">Gagal memuat invoice — muat ulang halaman.</p>}
                  {matched !== null && matched.length === 0 && (
                    <>
                      <p className="apex-id font-bold">Belum ada invoice terdaftar</p>
                      <p className="text-muted text-xs">Daftar via POST /api/purchasing/invoices (butuh step-up) — hasil verifikasi ada di dossier invoice.</p>
                    </>
                  )}
                  {matched !== null && matched.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {matched.map((m) => (
                        <li key={m.number} className="flex items-center justify-between gap-2">
                          <Link className="apex-id font-bold text-cobalt hover:underline" href={`/purchasing/invoices/${m.number}`}>{m.number}</Link>
                          <Badge variant={m.status === 'MATCHED' ? 'pass' : 'fail'}>{m.status}{m.paymentHold ? ' · HOLD' : ''}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {matched && matched.length > 0 ? (
                  <Link href={`/purchasing/invoices/${matched[0].number}`}><Button>Buka dossier invoice</Button></Link>
                ) : (
                  <Button disabled title="Daftarkan invoice dulu — hasil verifikasi ada di dossier-nya">Jalankan Match (butuh invoice)</Button>
                )}
                <DisputeDialog push={push} onDisputed={onDisputed} docId={doc.number} />
              </div>
            </div>
          </div>
        )}

        {tab === 'signatures' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <h2 className="text-base font-semibold">Status Persetujuan</h2>
              <p className="text-sm">Status saat ini: <Badge variant={statusTone(doc.status)}>{doc.status}</Badge></p>
              <p className="text-xs text-muted">Kuorum per-signer tidak ada di backend — rantai keputusan (siapa, kapan, mengapa) tercatat di audit trail. Cari di audit trail untuk <span className="apex-id">PO_APPROVE / PO_REJECT · {doc.number}</span>.</p>
            </div>
          </div>
        )}
      </section>
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={dismiss}
        action={(t) =>
          t.retry ? (
            <button type="button" onClick={() => push(true, 'Retry diantrekan', 'Idempotency-Key sama — tidak duplikat.')} className="mt-1 h-8 px-3 rounded bg-card/60 text-xs font-bold">
              Retry
            </button>
          ) : null
        }
      />
    </>
  );
}
