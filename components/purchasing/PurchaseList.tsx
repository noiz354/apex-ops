'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Download, LoaderCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';

interface ServerLine {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  priceFormatted: string;
  totalFormatted: string;
}

export interface ServerDoc {
  number: string;
  kind: 'PO' | 'PR';
  title: string;
  vendorSlug: string | null;
  totalCents: number;
  totalFormatted: string;
  status: string;
  slaDueAt: string | null;
  lineItems: ServerLine[];
  createdAt: string;
}

interface Doc {
  id: string; kind: 'PO' | 'PR'; title: string; vendor: string; vendorSlug?: string;
  amount: string; amountCents: number; req: string; status: string; note?: string; seeded?: boolean;
}

const SEED: Doc[] = [
  { id: 'PO-2026-0298', kind: 'PO', title: 'Silicon Carbide Shaft Seal 2.5" Kit replenishment', vendor: 'Trane Supply Co', vendorSlug: 'trane-technologies', amount: '$2,900.00', amountCents: 290000, req: '—', status: 'DISPATCHED · DOCK BAY 02', note: 'P1 SLA · GRN-9941 · INV-2026-1188', seeded: true },
  { id: 'PR-2026-0314', kind: 'PR', title: '—', vendor: 'Trane EarthWise Direct', vendorSlug: 'trane-technologies', amount: '—', amountCents: 0, req: '—', status: 'ENDORSED → PO-2026-0315', note: 'Endorsed 13:41 WIB · POST pr-0314/endorse' },
  { id: 'PO-2026-0315', kind: 'PO', title: '—', vendor: 'Trane Co.', vendorSlug: 'trane-technologies', amount: '—', amountCents: 0, req: '—', status: 'DISPATCHED', note: 'Per authorize demo string (JS-only source)' },
  { id: 'PR-2026-0309', kind: 'PR', title: '10 Pails POE Synthetic Lubricant', vendor: 'Mobil Aero Fluids', amount: '$1,950.00', amountCents: 195000, req: 'J. Thorne · Lube Specialist', status: 'CONVERTED → PO-2026-0302' },
  { id: 'PO-2026-0302', kind: 'PO', title: '10 Pails POE Synthetic Lubricant', vendor: 'Mobil Aero Fluids', amount: '$1,950.00', amountCents: 195000, req: 'J. Thorne · Lube Specialist', status: 'CREATED', note: '10 × $195.00/pail' },
  { id: 'PO-2026-0285', kind: 'PO', title: '2000kVA Bushing Kits · ELEC-TR-880', vendor: 'ABB Grid Power Services', vendorSlug: 'abb-grid-power-automation', amount: '$28,400.00', amountCents: 2840000, req: 'E. Vance · Chief Electrical', status: 'PARTIAL' },
  { id: 'PR-2026-0295', kind: 'PR', title: 'Non-standard cordless power tool accessories', vendor: 'Grainger Industrial', vendorSlug: 'grainger-industrial-supply', amount: '$850.00', amountCents: 85000, req: '—', status: 'REJECTED BY VP', note: 'Exceeds crib discretionary cap' },
];

const TERMINAL = new Set(['RECEIVED', 'REJECTED']);

function toDoc(d: ServerDoc): Doc {
  return {
    id: d.number,
    kind: d.kind,
    title: d.title,
    vendor: d.vendorSlug ?? '—',
    vendorSlug: d.vendorSlug ?? undefined,
    amount: d.totalFormatted,
    amountCents: d.totalCents,
    req: '—',
    status: d.status,
  };
}


const fmtUsd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function PurchaseList() {
  const [rows, setRows] = useState<Doc[]>(SEED);
  const [dirState, setDirState] = useState<'loading' | 'live' | 'demo'>('loading');
  const [dirError, setDirError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('Semua Jenis');
  const [status, setStatus] = useState('Semua Status');
  const { toasts, push, dismiss } = useToasts(8000);
  const [busyExport, setBusyExport] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [nwTitle, setNwTitle] = useState('');
  const [nwVendor, setNwVendor] = useState('');
  const [nwSku, setNwSku] = useState('');
  const [nwQty, setNwQty] = useState('1');
  const [nwPrice, setNwPrice] = useState('');
  const [nwTouched, setNwTouched] = useState(false);
  const [creating, setCreating] = useState(false);



  const errMsg = (e: unknown) =>
    e instanceof ApiError ? `${e.message} (${e.code})` : 'Kesalahan tak terduga — tidak ada yang dikirim.';

  const refresh = useCallback(async () => {
    setDirState('loading');
    setDirError('');
    try {
      const list = await apiFetch<ServerDoc[]>('/api/purchasing?limit=100');
      setRows(list.map(toDoc));
      setDirState('live');
    } catch (e) {
      setRows(SEED);
      setDirState('demo');
      setDirError(errMsg(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== 'Semua Jenis' && r.kind !== kind) return false;
      if (status !== 'Semua Status' && r.status !== status) return false;
      return !needle || `${r.id} ${r.title} ${r.vendor} ${r.req}`.toLowerCase().includes(needle);
    });
  }, [rows, q, kind, status]);

  const live = dirState === 'live';
  const statuses = useMemo(() => ['Semua Status', ...Array.from(new Set(rows.map((r) => r.status)))], [rows]);
  const stats = useMemo(() => ({
    openValue: rows.filter((r) => r.kind === 'PO' && !TERMINAL.has(r.status))
      .reduce((a, r) => a + r.amountCents, 0),
    partial: rows.filter((r) => r.status === 'PARTIAL').length,
    rejected: rows.filter((r) => r.status.startsWith('REJECTED')).length,
  }), [rows]);
  const { openValue, partial, rejected } = stats;

  const exportCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
    const { exportTableCsv } = await import('@/lib/csv-export');
    const table: (string | number)[][] = [
      ['id', 'type', 'title', 'vendor', 'amount', 'requestor', 'status'],
      ...filtered.map((r) => [r.id, r.kind, r.title, r.vendor, r.amount, r.req, r.status]),
    ];
    await exportTableCsv('purchasing-documents.csv', table);
    push(true, 'Ekspor berhasil', `${filtered.length} dokumen → purchasing-documents.csv (${live ? 'data server' : 'data demo — server tidak terjangkau'}).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const qtyNum = parseInt(nwQty, 10);
  const priceNum = Math.round(parseFloat(nwPrice.replace(/[$,]/g, '')) * 100);
  const formOk = nwTitle.trim().length >= 3 && nwSku.trim().length > 0
    && Number.isInteger(qtyNum) && qtyNum > 0 && Number.isFinite(priceNum) && priceNum >= 0;

  const create = async () => {
    setNwTouched(true);
    if (!formOk || creating) return;
    setCreating(true);
    try {
      const pr = await apiFetch<ServerDoc>('/api/purchasing', {
        method: 'POST',
        body: {
          title: nwTitle.trim(),
          vendorSlug: nwVendor.trim() || null,
          lineItems: [{
            sku: nwSku.trim(),
            description: nwTitle.trim(),
            quantity: qtyNum,
            unitPriceCents: priceNum,
          }],
        },
      });
      setRows((r) => [toDoc(pr), ...r]);
      setNewOpen(false);
      setNwTitle(''); setNwVendor(''); setNwSku(''); setNwQty('1'); setNwPrice('');
      setNwTouched(false);
      push(true, 'Requisition terkirim', `${pr.number} · PENDING_APPROVAL · tercatat di server.`);
    } catch (e) {
      push(false, 'Requisition gagal', errMsg(e));
    } finally {
      setCreating(false);
    }
  };

  const statusTone = (s: string) =>
    (s.startsWith('REJECTED') ? 'fail'
      : s === 'PARTIAL' || s === 'PENDING_APPROVAL' || s === 'CREATED' || s === 'SUBMITTED' ? 'warn'
      : s === 'APPROVED' ? 'info' : 'pass');

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Purchasing</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="po-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">
              Dokumen Procurement · {rows.length} {live ? 'data server' : 'data demo'} (PO + PR)
              {' '}<Badge variant={live ? 'pass' : 'warn'}>{live ? 'Live directory' : 'Demo offline'}</Badge>
            </p>
            <h1 id="po-h" className="text-2xl font-semibold tracking-tight">Purchasing</h1>
            <p className="text-[13px] text-muted">Requisition hingga order terkirim — rantai endorsement, penerimaan parsial, dan penolakan.</p>
            {dirState === 'demo' && (
              <p className="text-xs text-warn font-semibold mt-1" role="alert">
                Server tidak terjangkau ({dirError}) — menampilkan data demo. Aksi dinonaktifkan.{' '}
                <button type="button" className="underline" onClick={() => void refresh()}>Coba lagi</button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor (CSV)</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!live}><Plus size={16} /> Requisition Baru</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="np-h">
                <DialogTitle id="np-h">Requisition Pembelian Baru</DialogTitle>
                <DialogDescription>Membuat PR PENDING_APPROVAL di server (butuh po.approve).</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="np-t">Judul (wajib, min 3)</label>
                <Input id="np-t" value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} invalid={nwTouched && nwTitle.trim().length < 3} placeholder="mis. Filter box MERV 14 — AHU-02" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-v">Slug vendor (opsional)</label>
                    <Input id="np-v" value={nwVendor} onChange={(e) => setNwVendor(e.target.value)} placeholder="mis. grainger-industrial-supply" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-s">SKU (wajib)</label>
                    <Input id="np-s" value={nwSku} onChange={(e) => setNwSku(e.target.value)} invalid={nwTouched && !nwSku.trim()} placeholder="mis. PART-SEAL-8821" className="apex-id" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-q">Jml (wajib)</label>
                    <Input id="np-q" value={nwQty} onChange={(e) => setNwQty(e.target.value)} invalid={nwTouched && !(Number.isInteger(qtyNum) && qtyNum > 0)} placeholder="1" className="apex-id" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-a">Harga satuan USD (wajib)</label>
                    <Input id="np-a" value={nwPrice} onChange={(e) => setNwPrice(e.target.value)} invalid={nwTouched && !(Number.isFinite(priceNum) && priceNum >= 0)} placeholder="1200.00" className="apex-id" />
                  </div>
                </div>
                {nwTouched && !formOk && (
                  <p className="text-[11px] font-semibold text-fail">Judul (min 3) + SKU + jml ≥ 1 + harga satuan angka wajib diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Batal</Button>
                  <Button onClick={() => void create()} disabled={creating}>
                    {creating ? 'Mengirim…' : `Kirim PR (${fmtUsd(Number.isFinite(priceNum) && Number.isInteger(qtyNum) ? priceNum * qtyNum : 0)})`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Dokumen', v: String(rows.length), s: live ? 'data server' : `${rows.length} data demo` },
            { l: 'Nilai PO Terbuka', v: live ? fmtUsd(openValue) : '$33,250.00 (demo)', s: live ? 'POs excl. RECEIVED/REJECTED' : '0298 + 0302 + 0285 · 0315 undisclosed' },
            { l: 'Penerimaan Parsial', v: String(partial), s: live ? 'data server' : 'Bushing kits · ELEC-TR-880' },
            { l: 'Ditolak', v: String(rejected), s: live ? 'data server' : 'VP cap · power-tool accessories' },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter berdasarkan ID, judul, vendor, requestor…" aria-label="Filter dokumen purchasing" />
          </div>
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter jenis" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['Semua Jenis', 'PO', 'PR'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        {dirState === 'loading' ? <TableSkeleton rows={6} /> : (
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Document</th>
                <th className="font-semibold">Jenis</th>
                <th className="font-semibold">Judul</th>
                <th className="font-semibold">Vendor</th>
                <th className="font-semibold">Nilai</th>
                <th className="font-semibold">Requestor</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Dossier</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/purchasing/${r.id}`}>{r.id}</Link>
                    {r.seeded && <p className="text-[10px] font-bold text-pass">SEEDED RECORD</p>}
                    {r.note && <p className="text-[10px] text-muted">{r.note}</p>}
                  </td>
                  <td><Badge variant={r.kind === 'PO' ? 'info' : 'hold'}>{r.kind}</Badge></td>
                  <td className="font-medium">{r.title}</td>
                  <td className="text-xs">
                    {r.vendorSlug ? (
                      <Link className="text-cobalt font-semibold hover:underline" href={`/vendors/${r.vendorSlug}`}>{r.vendor}</Link>
                    ) : r.vendor}
                  </td>
                  <td className="apex-id font-semibold tabular-nums">{r.amount}</td>
                  <td className="text-xs">{r.req}</td>
                  <td><Badge variant={statusTone(r.status)}>{r.status}</Badge></td>
                  <td>
                    <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/purchasing/${r.id}`}>Dossier →</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">Tidak ada dokumen yang cocok — ubah filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        <p className="text-xs text-muted" role="status">Menampilkan {filtered.length} dari {rows.length} dokumen {live ? '' : '(demo)'}.</p>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
