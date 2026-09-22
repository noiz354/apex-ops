'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, LoaderCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { WoRow } from '@/lib/services/wo-service';

interface Tech { name: string; email: string; role: string }

interface Toast { id: number; ok: boolean; title: string; detail: string }
let toastSeq = 1;

function statusTone(r: WoRow): 'pass' | 'warn' | 'fail' | 'info' | 'hold' {
  if (r.slaLabel.includes('BREACH')) return 'fail';
  switch (r.status) {
    case 'ESCALATED': return 'fail';
    case 'ON_HOLD': return 'warn';
    case 'DISPATCHED': return 'hold';
    case 'OPEN': case 'SCHEDULED': case 'CANCELLED': return 'info';
    default: return 'pass';
  }
}

export function WorkOrderList({
  rows,
  techs,
  can,
}: {
  rows: WoRow[];
  techs: Tech[];
  can: { create: boolean; transition: boolean };
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Semua Status');
  const [pri, setPri] = useState('Semua Prioritas');
  const [vintage, setVintage] = useState('Semua Tahun');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  const [newOpen, setNewOpen] = useState(false);
  const [nwTitle, setNwTitle] = useState('');
  const [nwAsset, setNwAsset] = useState('');
  const [nwPri, setNwPri] = useState<'P1' | 'P2' | 'P3'>('P2');
  const [nwTouched, setNwTouched] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyExport, setBusyExport] = useState(false);
  const [busyReassign, setBusyReassign] = useState(false);

  const [reWO, setReWO] = useState<WoRow | null>(null);
  const [reEmail, setReEmail] = useState(techs[0]?.email ?? '');

  const push = (ok: boolean, title: string, detail: string) => {
    toastSeq += 1;
    const id = toastSeq;
    setToasts((t) => [...t.slice(-2), { id, ok, title, detail }]);
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    toastTimers.current.push(timer);
  };

  useEffect(() => () => {
    toastTimers.current.forEach((t) => window.clearTimeout(t));
    toastTimers.current = [];
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'Semua Status' && r.statusLabel !== status) return false;
      if (pri !== 'Semua Prioritas' && r.priority !== pri) return false;
      if (vintage !== 'Semua Tahun' && !r.number.startsWith(vintage)) return false;
      if (!needle) return true;
      return [r.number, r.title, r.location, r.tech ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, status, pri, vintage]);

  const statuses = useMemo(() => ['Semua Status', ...Array.from(new Set(rows.map((r) => r.statusLabel)))], [rows]);
  const vintages = useMemo(() => {
    const years = Array.from(new Set(rows.map((r) => r.number.slice(0, 7)).filter((v) => /^WO-\d{4}$/.test(v))));
    return ['Semua Tahun', ...years.sort().reverse()];
  }, [rows]);
  const stats = useMemo(() => ({
    breached: rows.filter((r) => r.slaLabel.includes('BREACH')).length,
    p1: rows.filter((r) => r.priority === 'P1').length,
    hold: rows.filter((r) => r.status === 'ON_HOLD').length,
  }), [rows]);
  const { breached, p1, hold } = stats;

  const exportCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { buildCsvViaWorker, saveAsViaPickerOrDownload } = await import('@/lib/download');
      const table: (string | number)[][] = [
        ['number', 'title', 'location', 'priority', 'status', 'sla', 'assignee'],
        ...filtered.map((r) => [r.number, r.title, r.location, r.priority, r.statusLabel, r.slaLabel, r.tech ?? '']),
      ];
      const csv = await buildCsvViaWorker(table, ',');
      await saveAsViaPickerOrDownload('work-orders-pipeline.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'text/csv');
      push(true, 'Ekspor berhasil', `${filtered.length} work order → work-orders-pipeline.csv (baris yang difilter).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const create = async () => {
    setNwTouched(true);
    if (busyCreate) return;
    const titleOk = nwTitle.trim().length >= 3;
    const assetOk = !nwAsset.trim() || /^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim());
    if (!titleOk || !assetOk) return;
    setBusyCreate(true);
    try {
      const data = await apiFetch<{ workOrder?: WoRow } & Partial<WoRow>>('/api/work-orders', {
        method: 'POST',
        body: { title: nwTitle.trim(), priority: nwPri, assetCode: nwAsset.trim() || null },
      });
      const wo = (data.workOrder ?? data) as WoRow;
      push(true, 'Work order dibuat', `${wo.number} · OPEN · SLA ${wo.slaLabel}.`);
      setNewOpen(false);
      setNwTitle('');
      setNwAsset('');
      setNwTouched(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Gagal membuat', `${err.message} (${err.code})`);
      } else {
        push(false, 'Gangguan jaringan', 'Tidak ada yang dibuat. Periksa koneksi dan coba lagi.');
      }
    } finally {
      setBusyCreate(false);
    }
  };

  const reassign = async () => {
    if (!reWO || busyReassign) return;
    setBusyReassign(true);
    try {
      const data = await apiFetch<{ statusLabel?: string }>(`/api/work-orders/${reWO.number}/transitions`, {
        method: 'POST',
        body: { action: 'assign', assigneeEmail: reEmail },
      });
      const tech = techs.find((t) => t.email === reEmail);
      push(true, 'Teknisi ditetapkan', `${reWO.number} → ${tech?.name ?? reEmail} · status tetap (${data.statusLabel}).`);
      setReWO(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Gagal menetapkan', `${err.message} (${err.code})`);
      } else {
        push(false, 'Gangguan jaringan', 'Tidak ada perubahan. Coba lagi.');
      }
    } finally {
      setBusyReassign(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Work Order</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="wo-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Pipa dispatch · {rows.length} work order</p>
            <h1 id="wo-h" className="text-2xl font-semibold tracking-tight">Work Order</h1>
            <p className="text-[13px] text-muted">Alur dari dispatch hingga selesai — prioritas, SLA, dan penugasan teknisi.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor (CSV)</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!can.create} title={can.create ? undefined : 'Peran Anda tidak dapat membuat work order'}><Plus size={16} /> Work Order Baru</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nw-h">
                <DialogTitle id="nw-h">Work Order Baru</DialogTitle>
                <DialogDescription>Nomor dibuat otomatis oleh server.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nw-t">Judul (wajib)</label>
                <Input id="nw-t" value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} invalid={nwTouched && nwTitle.trim().length < 3} placeholder="mis. Penggantian belt kipas cooling tower" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nw-a">Aset target (opsional)</label>
                    <Input id="nw-a" value={nwAsset} onChange={(e) => setNwAsset(e.target.value.toUpperCase())} invalid={nwTouched && !!nwAsset.trim() && !/^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim())} className="apex-id" placeholder="AST-HVAC-004" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nw-p">Prioritas (menentukan batas SLA)</label>
                    <select id="nw-p" value={nwPri} onChange={(e) => setNwPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {nwTouched && (nwTitle.trim().length < 3 || (nwAsset.trim() && !/^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim()))) && (
                  <p className="text-[11px] font-semibold text-fail">Judul (min. 3 karakter) wajib diisi; format aset AST-XXX-NNN.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Batal</Button>
                  <Button onClick={create} disabled={busyCreate}>
                    {busyCreate && <LoaderCircle size={16} className="animate-spin" />} Buat Work Order
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Pipa Terbuka', v: String(rows.length), s: 'total work order' },
            { l: 'P1 Kritis', v: String(p1), s: 'batas SLA 4 jam' },
            { l: 'SLA Terlewati', v: String(breached), s: 'melewati batas waktu' },
            { l: 'Ditahan', v: String(hold), s: 'alasan tercatat' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter berdasarkan ID, judul, lokasi, teknisi…" aria-label="Filter work order" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={pri} onChange={(e) => setPri(e.target.value)} aria-label="Filter prioritas" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['Semua Prioritas', 'P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={vintage} onChange={(e) => setVintage(e.target.value)} aria-label="Filter tahun" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {vintages.map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Work Order</th>
                <th className="font-semibold">Judul &amp; Lokasi</th>
                <th className="font-semibold">Prioritas</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">SLA</th>
                <th className="font-semibold">Teknisi</th>
                <th className="font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.number} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/work-orders/${r.number}`}>{r.number}</Link>
                  </td>
                  <td>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted">{r.location || '—'}</p>
                    {r.holdReason && <p className="text-[11px] font-semibold text-warn-ink">Ditahan: {r.holdReason}</p>}
                  </td>
                  <td><Badge variant={r.priority === 'P1' ? 'fail' : r.priority === 'P2' ? 'warn' : 'info'}>{r.priority}</Badge></td>
                  <td><Badge variant={statusTone(r)}>{r.statusLabel}</Badge></td>
                  <td className={cn('apex-id text-xs', r.slaLabel.includes('BREACH') ? 'font-bold text-fail' : 'text-muted')}>{r.slaLabel}</td>
                  <td className="text-xs">{r.tech ?? 'Belum ditetapkan'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {can.transition && !r.isTerminal && (
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => { setReWO(r); setReEmail(techs[0]?.email ?? ''); }}>Tugaskan ulang</button>
                      )}
                      <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/work-orders/${r.number}`}>Buka →</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted">Tidak ada work order yang cocok — ubah filter atau buat baru.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Menampilkan {filtered.length} dari {rows.length} work order.
        </p>
      </section>

      <Dialog open={reWO !== null} onOpenChange={(v) => { if (!v) setReWO(null); }}>
        <DialogContent aria-labelledby="re-h">
          <DialogTitle id="re-h">Tugaskan ulang {reWO?.number}</DialogTitle>
          <DialogDescription>Penetapan teknisi tidak mengubah status ({reWO?.statusLabel}).</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="re-tech">Teknisi (pengguna aktif)</label>
          <select id="re-tech" value={reEmail} onChange={(e) => setReEmail(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {techs.map((t) => <option key={t.email} value={t.email}>{t.name} · {t.role}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReWO(null)}>Batal</Button>
            <Button onClick={reassign} disabled={busyReassign || !reEmail}>
              {busyReassign && <LoaderCircle size={16} className="animate-spin" />} Tetapkan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg border p-3 shadow-card text-[13px] flex items-start gap-2', t.ok ? 'bg-pass-bg border-pass' : 'bg-fail-bg border-fail')}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{t.ok ? '✓' : '✕'} {t.title}</p>
              <p className="text-muted">{t.detail}</p>
            </div>
            <button type="button" aria-label="Tutup notifikasi" className="text-muted hover:text-ink shrink-0" onClick={() => setToasts((xs) => xs.filter((x) => x.id !== t.id))}>✕</button>
          </div>
        ))}
      </div>
    </>
  );
}
