'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, LoaderCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { SrRow } from '@/lib/services/sr-service';


function statusTone(r: SrRow): 'pass' | 'warn' | 'fail' | 'info' | 'hold' {
  switch (r.status) {
    case 'BREACHED': return 'fail';
    case 'CONVERTED': return 'pass';
    case 'TRIAGED': return 'warn';
    default: return 'info';
  }
}

export function ServiceRequestList({
  rows,
  can,
}: {
  rows: SrRow[];
  can: { create: boolean; transition: boolean };
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Semua Status');
  const { toasts, push, dismiss } = useToasts(8000);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [nwName, setNwName] = useState('');
  const [nwTitle, setNwTitle] = useState('');
  const [nwPri, setNwPri] = useState<'P1' | 'P2' | 'P3'>('P3');
  const [nwAsset, setNwAsset] = useState('');
  const [nwTouched, setNwTouched] = useState(false);

  const [convSR, setConvSR] = useState<SrRow | null>(null);
  const [convTitle, setConvTitle] = useState('');
  const [convPri, setConvPri] = useState<'P1' | 'P2' | 'P3'>('P2');

  const [closeSR, setCloseSR] = useState<SrRow | null>(null);
  const [closeReason, setCloseReason] = useState('');



  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'Semua Status' && r.statusLabel !== status) return false;
      if (!needle) return true;
      return [r.number, r.title, r.requesterName, r.assetCode ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, status]);

  const stats = useMemo(() => ({
    awaiting: rows.filter((r) => r.status === 'OPEN' || r.status === 'BREACHED').length,
    p1: rows.filter((r) => r.priority === 'P1' && r.status !== 'CONVERTED' && r.status !== 'CLOSED').length,
    breached: rows.filter((r) => r.status === 'BREACHED' || r.slaLabel.includes('BREACH')).length,
    converted: rows.filter((r) => r.status === 'CONVERTED').length,
  }), [rows]);
  const { awaiting, p1, breached, converted } = stats;

  const exportCsv = async () => {
    if (busyKey) return;
    setBusy('export');
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [
        ['number', 'title', 'requester', 'priority', 'status', 'sla', 'asset', 'converted_wo'],
        ...filtered.map((r) => [r.number, r.title, r.requesterName, r.priority, r.statusLabel, r.slaLabel, r.assetCode ?? '', r.convertedWoNumber ?? '']),
      ];
      await exportTableCsv('service-requests-queue.csv', table);
      push(true, 'Ekspor berhasil', `${filtered.length} tiket → service-requests-queue.csv (baris yang difilter).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusy(null);
    }
  };

  const busy = busyKey !== null;
  const setBusy = (k: string | null) => setBusyKey(k);

  const create = async () => {
    setNwTouched(true);
    if (busy) return;
    const nameOk = nwName.trim().length >= 2;
    const titleOk = nwTitle.trim().length >= 3;
    const assetOk = !nwAsset.trim() || /^AST-[A-Z0-9-]{3,}$/.test(nwAsset.trim());
    if (!nameOk || !titleOk || !assetOk) return;
    setBusy('create');
    try {
      const data = await apiFetch<{ number: string; slaLabel: string }>('/api/service-requests', {
        method: 'POST',
        body: {
          title: nwTitle.trim(),
          requesterName: nwName.trim(),
          priority: nwPri,
          assetCode: nwAsset.trim() || null,
        },
      });
      push(true, 'Permintaan dibuat', `${data.number} · OPEN · SLA triase ${data.slaLabel}.`);
      setNewOpen(false);
      setNwName(''); setNwTitle(''); setNwAsset(''); setNwTouched(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Gagal membuat', `${err.message} (${err.code})`);
      } else {
        push(false, 'Gangguan jaringan', 'Tidak ada yang dibuat. Periksa koneksi dan coba lagi.');
      }
    } finally {
      setBusy(null);
    }
  };

  const postTransition = async (
    srNumber: string,
    payload: Record<string, unknown>,
    okMsg: (data: { sr: SrRow; workOrder?: { number: string } }) => string,
    okTitle: string,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(srNumber + payload.action);
    try {
      const data = await apiFetch<{ sr: SrRow; workOrder?: { number: string } }>(
        `/api/service-requests/${srNumber}/transitions`,
        { method: 'POST', body: payload },
      );
      push(true, okTitle, okMsg(data));
      router.refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, `${okTitle} gagal`, `${err.message} (${err.code})`);
        if (err.code === 'SR_INVALID_TRANSITION' || err.code === 'SR_STALE_STATE') router.refresh();
      } else {
        push(false, 'Network error', 'Nothing was changed. Retry.');
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Service Request</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="sr-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Antrean triase · {rows.length} tiket</p>
            <h1 id="sr-h" className="text-2xl font-semibold tracking-tight">Service Request</h1>
            <p className="text-[13px] text-muted">Triase laporan — jam SLA, konversi ke work order, dan penutupan.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv} disabled={busy}>{busyKey === 'export' ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor (CSV)</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!can.create} title={can.create ? undefined : 'Peran Anda tidak dapat membuat permintaan'}><Plus size={16} /> Permintaan Baru</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nr-h">
                <DialogTitle id="nr-h">Permintaan Baru</DialogTitle>
                <DialogDescription>Nomor dibuat otomatis oleh server; batas SLA triase mengikuti prioritas (P1 15 mnt · P2 45 mnt · P3 2 jam).</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nr-n">Nama pelapor (wajib)</label>
                <Input id="nr-n" value={nwName} onChange={(e) => setNwName(e.target.value)} invalid={nwTouched && nwName.trim().length < 2} placeholder="mis. Dana Priya · Front Desk" />
                <label className="text-xs font-semibold" htmlFor="nr-t">Judul (wajib)</label>
                <Input id="nr-t" value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} invalid={nwTouched && nwTitle.trim().length < 3} placeholder="mis. Keluhan suara AHU lantai 5" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nr-p">Prioritas</label>
                    <select id="nr-p" value={nwPri} onChange={(e) => setNwPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nr-a">Aset terkait (opsional)</label>
                    <Input id="nr-a" value={nwAsset} onChange={(e) => setNwAsset(e.target.value.toUpperCase())} invalid={nwTouched && !!nwAsset.trim() && !/^AST-[A-Z0-9-]{3,}$/.test(nwAsset.trim())} className="apex-id" placeholder="AST-HVAC-004" />
                  </div>
                </div>
                {nwTouched && (nwName.trim().length < 2 || nwTitle.trim().length < 3) && (
                  <p className="text-[11px] font-semibold text-fail">Nama pelapor + judul wajib diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Batal</Button>
                  <Button onClick={create} disabled={busy}>
                    {busyKey === 'create' && <LoaderCircle size={16} className="animate-spin" />} Buat Permintaan
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Menunggu Triase', v: String(awaiting), s: 'antrean OPEN + BREACHED' },
            { l: 'P1 Kritis', v: String(p1), s: 'tiket P1 aktif (SLA 15 mnt)' },
            { l: 'SLA Terlewati', v: String(breached), s: 'melewati batas triase' },
            { l: 'Dikonversi', v: String(converted), s: 'sudah menjadi WO' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter berdasarkan ID, judul, pelapor, aset…" aria-label="Filter service request" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['Semua Status', 'OPEN', 'TRIAGED', 'BREACHED', 'CONVERTED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Tiket</th>
                <th className="font-semibold">Judul</th>
                <th className="font-semibold">Pelapor</th>
                <th className="font-semibold">Aset</th>
                <th className="font-semibold">Prioritas</th>
                <th className="font-semibold">SLA Triase</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.number} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/service-requests/${r.number}`}>{r.number}</Link>
                    
                  </td>
                  <td className="font-medium max-w-xs">{r.title}</td>
                  <td className="text-xs">{r.requesterName}</td>
                  <td className="text-xs apex-id">{r.assetCode ?? '—'}</td>
                  <td><Badge variant={r.priority === 'P1' ? 'fail' : r.priority === 'P2' ? 'warn' : 'info'}>{r.priority}</Badge></td>
                  <td className={cn('apex-id text-xs', r.slaLabel.includes('BREACH') ? 'font-bold text-fail' : 'text-muted')}>{r.slaLabel}</td>
                  <td>
                    <Badge variant={statusTone(r)}>{r.statusLabel}</Badge>
                    {r.convertedWoNumber && (
                      <Link className="block apex-id text-[10px] font-bold text-cobalt hover:underline" href={`/work-orders/${r.convertedWoNumber}`}>→ {r.convertedWoNumber}</Link>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {can.transition && (r.status === 'OPEN' || r.status === 'BREACHED') && (
                        <button type="button" className="text-cobalt font-semibold hover:underline disabled:opacity-50" disabled={busy}
                          onClick={() => postTransition(r.number, { action: 'triage' }, (d) => `${d.sr.number} → DITRIASE · jam SLA ${d.sr.slaLabel}.`, 'Triase tersimpan')}>
                          {busyKey === r.number + 'triage' ? <LoaderCircle size={12} className="animate-spin inline" /> : 'Triase'}
                        </button>
                      )}
                      {can.transition && !['CONVERTED', 'CLOSED'].includes(r.status) && (
                        <button type="button" className="text-cobalt font-semibold hover:underline disabled:opacity-50" disabled={busy}
                          onClick={() => { setConvSR(r); setConvTitle(r.title); setConvPri(r.priority); }}>
                          Konversi → WO
                        </button>
                      )}
                      {can.transition && !['CONVERTED', 'CLOSED'].includes(r.status) && (
                        <button type="button" className="text-fail font-semibold hover:underline disabled:opacity-50" disabled={busy}
                          onClick={() => { setCloseSR(r); setCloseReason(''); }}>
                          Tutup
                        </button>
                      )}
                      <Link className="text-cobalt font-semibold hover:underline" href={`/service-requests/${r.number}`}>Detail →</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">Tidak ada tiket yang cocok — ubah filter atau buat permintaan baru.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Menampilkan {filtered.length} dari {rows.length} tiket · konversi ke WO hanya sekali.
        </p>
      </section>

      {/* Convert dialog */}
      <Dialog open={convSR !== null} onOpenChange={(v) => { if (!v) setConvSR(null); }}>
        <DialogContent aria-labelledby="cv-h">
          <DialogTitle id="cv-h">Konversi {convSR?.number} → Work Order</DialogTitle>
          <DialogDescription>WO dibuat dalam transaksi yang sama (nomor + SLA dari prioritas). Satu kali: tiket yang sudah dikonversi tidak bisa dikonversi lagi.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cv-t">Judul WO</label>
          <Input id="cv-t" value={convTitle} onChange={(e) => setConvTitle(e.target.value)} />
          <label className="text-xs font-semibold" htmlFor="cv-p">Prioritas WO (SLA pengerjaan 4/8/24 jam)</label>
          <select id="cv-p" value={convPri} onChange={(e) => setConvPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConvSR(null)}>Batal</Button>
            <Button disabled={busy || convTitle.trim().length < 3}
              onClick={async () => {
                if (!convSR) return;
                const ok = await postTransition(
                  convSR.number,
                  { action: 'convert', woTitle: convTitle.trim(), woPriority: convPri },
                  (d) => `${d.sr.number} → TERKONVERSI · work order ${d.workOrder?.number} dibuat (OPEN, ${convPri}).`,
                  'Berhasil dikonversi',
                );
                if (ok) setConvSR(null);
              }}>
              {convSR && busyKey === convSR.number + 'convert' && <LoaderCircle size={16} className="animate-spin" />} Konversi ke Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeSR !== null} onOpenChange={(v) => { if (!v) setCloseSR(null); }}>
        <DialogContent aria-labelledby="cl-h">
          <DialogTitle id="cl-h">Tutup {closeSR?.number}</DialogTitle>
          <DialogDescription>Penutupan bersifat final — tiket tidak bisa dibuka lagi (buat permintaan baru).</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cl-r">Alasan penutupan (wajib — tercatat di audit)</label>
          <textarea id="cl-r" rows={2} value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
            className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" placeholder="mis. Duplikat SR-2026-0893 / sudah ditangani di lokasi" />
          {!closeReason.trim() && <p className="text-[11px] font-semibold text-fail">Alasan wajib diisi untuk menutup tiket.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseSR(null)}>Batal</Button>
            <Button disabled={busy || !closeReason.trim()}
              onClick={async () => {
                if (!closeSR) return;
                const ok = await postTransition(
                  closeSR.number,
                  { action: 'close', reason: closeReason.trim() },
                  (d) => `${d.sr.number} → DITUTUP · alasan tersimpan.`,
                  'Tiket ditutup',
                );
                if (ok) setCloseSR(null);
              }}>
              {closeSR && busyKey === closeSR.number + 'close' && <LoaderCircle size={16} className="animate-spin" />} Tutup Tiket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
