'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, LoaderCircle, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { SrRow, SrHistoryEntry } from '@/lib/services/sr-service';
import type { WoRow } from '@/lib/services/wo-service';

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 300;

const ACTION_LABEL: Record<string, string> = {
  SR_CREATE: 'Dibuat (intake)',
  SR_TRIAGE: 'Ditriase',
  SR_CONVERT: 'Dikonversi → WO',
  SR_CLOSE: 'Ditutup',
};

export function ServiceRequestDetail({
  sr,
  history,
  wo,
  can,
}: {
  sr: SrRow;
  history: SrHistoryEntry[];
  wo: WoRow | null;
  can: { transition: boolean };
}) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [convOpen, setConvOpen] = useState(false);
  const [convTitle, setConvTitle] = useState(sr.title);
  const [convPri, setConvPri] = useState<'P1' | 'P2' | 'P3'>(sr.priority);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-2), { id, ok, title, msg }]);
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
    toastTimers.current.push(timer);
  };

  useEffect(() => () => {
    toastTimers.current.forEach((t) => window.clearTimeout(t));
    toastTimers.current = [];
  }, []);

  const post = async (key: string, payload: Record<string, unknown>, okTitle: string, okMsg: (d: { sr: SrRow; workOrder?: WoRow }) => string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      const data = await apiFetch<{ sr: SrRow; workOrder?: WoRow }>(
        `/api/service-requests/${sr.number}/transitions`,
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
        push(false, 'Gangguan jaringan', 'Tidak ada yang berubah. Coba lagi.');
      }
      return false;
    } finally {
      setBusy(null);
    }
  };

  const breached = sr.status === 'BREACHED' || sr.slaLabel.includes('BREACH');
  const active = sr.status !== 'CONVERTED' && sr.status !== 'CLOSED';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/service-requests">Service Request</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{sr.number}</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="sr-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={sr.priority === 'P1' ? 'fail' : sr.priority === 'P2' ? 'warn' : 'info'}>{sr.priority}</Badge>
              <Badge variant={sr.status === 'CONVERTED' ? 'pass' : sr.status === 'BREACHED' ? 'fail' : sr.status === 'TRIAGED' ? 'warn' : 'info'}>
                {sr.statusLabel}{sr.convertedWoNumber ? ` → ${sr.convertedWoNumber}` : ''}
              </Badge>
              {breached && active && <Badge variant="fail" pulse>PELANGGARAN SLA TRIASE</Badge>}
            </div>
            <h1 id="sr-title" className="text-2xl font-semibold tracking-tight">
              {sr.title} <span className="apex-id text-cobalt font-semibold">{sr.number}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span>Pelapor <strong className="text-ink">{sr.requesterName}</strong></span>
              {sr.assetCode && (
                <span>
                  Aset terkait{' '}
                  <Link className="apex-id text-cobalt font-semibold hover:underline" href={`/assets/${sr.assetCode}`}>{sr.assetCode}</Link>
                </span>
              )}
              <span className="apex-id">Filed {new Date(sr.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="apex-label-caps text-muted">SLA Triase (batas aktual)</span>
            <span className={cn('apex-id text-xl font-bold tabular-nums', breached ? 'text-fail' : 'text-pass')}>{sr.slaLabel}</span>
            {can.transition && active && (
              <div className="flex flex-wrap gap-2 justify-end">
                {(sr.status === 'OPEN' || sr.status === 'BREACHED') && (
                  <Button variant="secondary" disabled={busy !== null}
                    onClick={() => post('triage', { action: 'triage' }, 'Triase tersimpan', (d) => `${d.sr.number} → DITRIASE.`)}>
                    {busy === 'triage' && <LoaderCircle size={16} className="animate-spin" />} Triase
                  </Button>
                )}
                <Button variant="secondary" disabled={busy !== null} onClick={() => setConvOpen(true)}>Konversi → WO</Button>
                <Button variant="secondary" disabled={busy !== null} onClick={() => setCloseOpen(true)}>Tutup</Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-labelledby="conv-h">
          <h2 id="conv-h" className="text-base font-semibold">Konversi — SR → WO</h2>
          {sr.convertedWoNumber && wo ? (
            <div className="rounded-lg border border-pass bg-pass-bg p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 apex-id">
                <span className="font-semibold">{sr.number}</span>
                <span aria-hidden="true">→</span>
                <Link className="font-bold text-cobalt hover:underline" href={`/work-orders/${wo.number}`}>{wo.number}</Link>
                <Badge variant={wo.isTerminal ? 'pass' : 'warn'}>{wo.statusLabel} {wo.priority}</Badge>
              </div>
              <ul className="text-[13px] text-pass-ink flex flex-col gap-0.5">
                <li>Work order live from the database — SLA {wo.slaLabel}{wo.tech ? ` · assigned ${wo.tech}` : ' · unassigned'}.</li>
                <li>Konversi hanya sekali dan transaksional: baris SR + WO + event + audit tersimpan bersama.</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link href={`/work-orders/${wo.number}`}><Button>Lihat WO Hasil Konversi</Button></Link>
              </div>
            </div>
          ) : sr.convertedWoNumber ? (
            <p className="text-[13px] text-muted">Converted to <span className="apex-id font-bold">{sr.convertedWoNumber}</span> (work order tidak dapat dibaca).</p>
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface p-4 flex flex-col gap-2">
              <p className="text-[13px] text-muted">
                Belum dikonversi. Konversi membuat work order dalam transaksi yang sama (nomor + SLA dari prioritas) —
                satu kali per tiket.
              </p>
              {can.transition && active && (
                <div><Button onClick={() => setConvOpen(true)} disabled={busy !== null}>Konversi ke Work Order</Button></div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => push(true, 'Catatan', 'Ekspor log tiket menyusul di modul Laporan — belum ada yang bisa diunduh.')}>
              <Download size={16} /> Ekspor Log Tiket (belum tersedia)
            </Button>
          </div>
        </section>

        <section className="xl:col-span-5 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-labelledby="hist-h">
          <div className="flex items-center justify-between">
            <h2 id="hist-h" className="text-base font-semibold">Riwayat Tiket</h2>
            <span className="apex-id text-muted">jejak audit · WIB</span>
          </div>
          <ol className="flex flex-col gap-0 border-l-2 border-border-subtle ml-1">
            {history.map((h, i) => (
              <li key={`${h.ts}-${i}`} className="pl-4 py-1 relative">
                <span className={cn('absolute -left-[7px] top-3 w-3 h-3 rounded-full', h.action === 'SR_CLOSE' ? 'bg-muted' : h.action === 'SR_CONVERT' ? 'bg-pass' : h.action === 'SR_TRIAGE' ? 'bg-cobalt-deep' : 'bg-warn-dot')} />
                <p className="text-[13px]">
                  <strong className="apex-id">{new Date(h.ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
                  {' '}— {ACTION_LABEL[h.action] ?? h.action} · {h.actorName}
                  {h.detail && <span className="text-muted"> — {h.detail}</span>}
                </p>
              </li>
            ))}
            {history.length === 0 && <li className="pl-4 text-[13px] text-muted">Seeded ticket — no recorded history (audit trail started with Phase 1).</li>}
          </ol>
        </section>
      </div>

      {/* Convert dialog */}
      <Dialog open={convOpen} onOpenChange={setConvOpen}>
        <DialogContent aria-labelledby="cvd-h">
          <DialogTitle id="cvd-h">Konversi {sr.number} → Work Order</DialogTitle>
          <DialogDescription>WO dibuat secara transaksional (nomor + SLA pengerjaan dari prioritas). One-time.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cvd-t">Judul WO</label>
          <Input id="cvd-t" value={convTitle} onChange={(e) => setConvTitle(e.target.value)} />
          <label className="text-xs font-semibold" htmlFor="cvd-p">Prioritas WO (P1 4 jam · P2 8 jam · P3 24 jam)</label>
          <select id="cvd-p" value={convPri} onChange={(e) => setConvPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConvOpen(false)}>Batal</Button>
            <Button disabled={busy !== null || convTitle.trim().length < 3}
              onClick={async () => {
                const ok = await post('convert', { action: 'convert', woTitle: convTitle.trim(), woPriority: convPri }, 'Berhasil dikonversi',
                  (d) => `${sr.number} → TERKONVERSI · work order ${d.workOrder?.number} dibuat (OPEN).`);
                if (ok) setConvOpen(false);
              }}>
              {busy === 'convert' && <LoaderCircle size={16} className="animate-spin" />} Konversi ke Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent aria-labelledby="cld-h">
          <DialogTitle id="cld-h">Tutup {sr.number}</DialogTitle>
          <DialogDescription>Penutupan bersifat final — buat permintaan baru, bukan membuka lagi.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cld-r">Alasan penutupan (wajib — tercatat di audit)</label>
          <textarea id="cld-r" rows={2} value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
            className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
          {!closeReason.trim() && <p className="text-[11px] font-semibold text-fail">Alasan wajib diisi untuk menutup tiket.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseOpen(false)}>Batal</Button>
            <Button disabled={busy !== null || !closeReason.trim()}
              onClick={async () => {
                const ok = await post('close', { action: 'close', reason: closeReason.trim() }, 'Tiket ditutup',
                  (d) => `${d.sr.number} → DITUTUP · alasan tersimpan.`);
                if (ok) setCloseOpen(false);
              }}>
              {busy === 'close' && <LoaderCircle size={16} className="animate-spin" />} Tutup Tiket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Tutup notifikasi" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
