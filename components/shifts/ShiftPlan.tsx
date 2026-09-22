'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ToastStack } from '@/components/ui/toast-stack';
import { useToasts } from '@/lib/use-toasts';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';

interface HandoverRecord {
  id: string;
  shiftFrom: string;
  shiftTo: string;
  leadFrom: string;
  leadTo: string;
  time: string;
  status: 'ACCEPTED' | 'REJECTED' | 'STALE' | 'PENDING';
  itemsHandedOver: string;
  notes: string;
}

const HISTORIC_HANDOVERS: HandoverRecord[] = [
  {
    id: 'HND-2026-0523-B',
    shiftFrom: 'Shift B (Sore)',
    shiftTo: 'Shift C (Malam)',
    leadFrom: 'David Chen',
    leadTo: 'Sarah Al-Mansoor',
    time: '2026-05-23 23:05 WIB',
    status: 'ACCEPTED',
    itemsHandedOver: '4 WO, telemetri BMS cleanroom nominal',
    notes: 'Sensor kelembapan cleanroom dikalibrasi ulang pukul 21:00.',
  },
  {
    id: 'HND-2026-0523-A',
    shiftFrom: 'Shift A (Pagi)',
    shiftTo: 'Shift B (Sore)',
    leadFrom: 'Marcus Kowalski',
    leadTo: 'David Chen',
    time: '2026-05-23 15:10 WIB',
    status: 'ACCEPTED',
    itemsHandedOver: '2 WO, 1 inspeksi selesai',
    notes: 'Tidak ada getaran abnormal di loop chiller utama.',
  },
  {
    id: 'HND-2026-0522-B',
    shiftFrom: 'Shift B (Evening)',
    shiftTo: 'Shift C (Night)',
    leadFrom: 'Robert Langdon',
    leadTo: 'Sarah Al-Mansoor',
    time: '2026-05-22 23:25 WIB',
    status: 'REJECTED',
    itemsHandedOver: 'Kit bushing ELEC-TR-880 belum lengkap',
    notes: 'Kunci gembok LOTO #4091 hilang dari lockbox. Supervisor dieskalasi.',
  },
];

interface ServerHandover {
  id: string;
  shiftFrom: string; shiftTo: string; leadFrom: string; leadTo: string;
  woRef: string | null; items: string; notes: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectReason: string | null; decidedBy: string | null; decidedAt: string | null;
  createdAt: string; updatedAt: string;
}

export function ShiftPlan() {
  const [live, setLive] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ServerHandover[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const { toasts, push, dismiss } = useToasts(7000);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shifts/handovers', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { ok: boolean; data: { handovers: ServerHandover[]; can: { manage: boolean } } };
      setRows(j.data.handovers);
      setCanManage(j.data.can.manage);
      setLive(true);
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = rows.find((r) => r.status === 'PENDING') ?? null;
  const decidedTarget = rows.find((r) => r.status !== 'PENDING') ?? null;

  const initiate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/shifts/handovers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `hnd-init-${Date.now()}` },
        body: JSON.stringify({
          shiftFrom: 'Shift A (Day)',
          shiftTo: 'Shift B (Evening)',
          leadFrom: CANON.engineer,
          leadTo: 'David Chen',
          woRef: CANON.workOrderSeal,
          items: 'Seal replacement in progress · LOTO #4092 · Step 04 torqued',
          notes: 'Stopwatch active — transferred with handover',
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.code ?? `HTTP ${res.status}`);
      push(true, 'Serah terima dimulai · Handover initiated (server)', `${j.data.id.slice(0, 8)}… · PENDING · event HANDOVER_CREATE tercatat. Lead Shift B memutuskan.`);
      await load();
    } catch (e) {
      push(false, 'Inisiasi gagal', e instanceof Error ? e.message : 'kesalahan server');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (action: 'accept' | 'reject') => {
    const reason = rejectReason.trim();
    if (action === 'reject' && reason.length < 3) return;
    setBusy(true);
    try {
      if (!pending) throw new Error('no pending server handover');
      const res = await fetch(`/api/shifts/handovers/${pending.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `hnd-decide-${pending.id}-${action}` },
        body: JSON.stringify(action === 'reject' ? { action, reason } : { action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
      setRejectOpen(false);
      setRejectReason('');
      push(true, action === 'accept' ? 'Serah terima diterima (server)' : 'Serah terima ditolak (server)',
        action === 'accept'
          ? `${j.data.decidedBy} menyetujui ${pending.id.slice(0, 8)}… · HANDOVER_ACCEPT audit logged.`
          : `Ditolak dengan alasan tercatat · event HANDOVER_REJECT tercatat. Lead lama wajib tetap bertugas.`);
      await load();
    } catch (e) {
      push(false, 'Keputusan gagal', e instanceof Error ? e.message : 'kesalahan server');
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (live) { void decide('accept'); return; }
    setStatus('accepted');
    push(true, 'Serah terima diterima (demo lokal)', 'Tidak tersimpan — server tidak terjangkau; tidak ada yang dicatat.');
  };

  const reject = () => {
    const reason = rejectReason.trim();
    if (live) { void decide('reject'); return; }
    if (!reason) return;
    setStatus('rejected');
    setRejectOpen(false);
    push(false, 'Serah terima ditolak (demo lokal)', `Hanya tercatat di state browser — alasan "${reason}" TIDAK tersimpan.`);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link className="text-muted hover:text-cobalt font-medium" href={`/work-orders/${CANON.workOrderSeal}`}>{CANON.workOrderSeal}</Link>
          <span className="text-muted">/</span>
          <span className="font-semibold">Rencana Shift · Protokol Serah Terima Operasional</span>
        </nav>
        <div className="flex gap-2">
          <Link href="/audit-trail?scope=shifts">
            <Button variant="secondary"><ShieldCheck size={16} /> Ledger Audit</Button>
          </Link>
          <Link href="/preventive-maintenance">
            <Button>PM Hub</Button>
          </Link>
        </div>
      </div>
      <p className="text-xs text-muted -mt-4">Jam operasional 07:00–23:00 WIB · {CANON.tenant} · Site: Padang Data Center Campus</p>

      {/* Handover Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Shift A */}
        <section className="bg-card border-2 border-cobalt-deep rounded-lg p-4 flex flex-col gap-2" aria-label="Shift A">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Shift A · KELUAR</h2>
            <Badge variant="pass">AKTIF</Badge>
          </div>
          <span className="apex-id font-bold">{CANON.shiftA.replace(' WIB', '')}</span>
          <ul className="text-sm flex flex-col gap-1">
            <li className="flex justify-between gap-2">
              <span><strong>{CANON.engineer}</strong> · Lead Keluar</span>
              <span className="text-xs font-bold text-pass">HADIR</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>3 teknisi · CUP-West</span>
              <span className="text-xs text-muted">aktif di lokasi</span>
            </li>
          </ul>
          <div className="h-2 rounded-full bg-cobalt-tint overflow-hidden mt-1" role="img" aria-label="Shift A 88 percent elapsed">
            <div className="h-full bg-cobalt-deep" style={{ width: '88%' }} />
          </div>
          <p className="text-xs text-muted">88% berlalu · jendela transfer serah terima TERBUKA</p>
        </section>

        {/* Shift B */}
        <section className="bg-card border border-border-subtle rounded-lg p-4 flex flex-col gap-2" aria-label="Shift B">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Shift B · MASUK</h2>
            <Badge variant="warn">SIAGA</Badge>
          </div>
          <span className="apex-id font-bold">15:30–23:00 WIB</span>
          <ul className="text-sm flex flex-col gap-1">
            <li className="flex justify-between gap-2">
              <span><strong>David Chen</strong> · Lead Masuk</span>
              <span className="text-xs font-bold text-warn">DI LOKASI (STBY)</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>2 teknisi · CUP-West</span>
              <span className="text-xs text-muted">briefing selesai</span>
            </li>
          </ul>
          <Link href="/field/audits" className="h-9 rounded bg-cobalt-tint text-cobalt-deep text-sm font-semibold inline-flex items-center justify-center mt-auto hover:bg-cobalt-light/20">
            Pendamping Audit Lapangan →
          </Link>
        </section>

        {/* Handover Action Panel */}
        <section className="bg-card border border-border-subtle rounded-lg p-4 flex flex-col gap-2" aria-label="Shift handover queue">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Antrean Serah Terima Aktif</h2>
            {live === true && pending === null && decidedTarget === null && <Badge variant="hold">SERVER · BELUM ADA SERAH TERIMA</Badge>}
            {live === true && pending !== null && <Badge variant="warn">SERVER · BUTUH TINDAKAN</Badge>}
            {live === true && pending === null && decidedTarget !== null && (
              decidedTarget.status === 'ACCEPTED'
                ? <Badge variant="pass">HANDOVER ACCEPTED</Badge>
                : <Badge variant="fail">SERAH TERIMA DITOLAK</Badge>
            )}
            {live === false && status === 'accepted' && <Badge variant="pass">DEMO LOKAL · DITERIMA</Badge>}
            {live === false && status === 'rejected' && <Badge variant="fail">DEMO LOKAL · DITOLAK</Badge>}
            {live === false && status === 'pending' && <Badge variant="hold">DEMO LOKAL</Badge>}
            {live === null && <Badge variant="warn">MEMERIKSA…</Badge>}
          </div>

          {live === true && pending === null && (
            <div className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-2" role="status">
              <p className="text-sm font-semibold">Tidak ada serah terima pending di server</p>
              <p className="text-xs text-muted mt-0.5">
                Mulai serah terima A→B untuk <span className="apex-id">{CANON.workOrderSeal}</span> untuk membuat baris PENDING nyata — lalu diputuskan via panel ini dan ditulis ke audit trail.
              </p>
              {canManage && (
                <Button className="mt-1" disabled={busy} onClick={() => void initiate()}>
                  {busy ? 'Memproses…' : 'Mulai Serah Terima (server)'}
                </Button>
              )}
              {!canManage && live === true && (
                <p className="text-xs text-muted">Peran Anda bisa membaca serah terima tapi tidak bisa membuat/memutuskan (butuh shifts.manage).</p>
              )}
            </div>
          )}

          {live === true && pending !== null && (
            <div className="rounded-lg border border-warn-dot bg-warn-bg p-3 flex flex-col gap-2">
              <div>
                <p className="font-semibold text-sm">
                  <span className="apex-id">{pending.woRef ?? pending.id.slice(0, 8)}</span> · {pending.shiftFrom} → {pending.shiftTo}
                </p>
                <p className="text-xs text-warn-ink mt-0.5">
                  {pending.items || 'Tidak ada catatan item'} · lead {pending.leadFrom} / {pending.leadTo}
                </p>
                <p className="text-[11px] text-warn-ink/80 mt-1 apex-id">baris server {pending.id}</p>
              </div>
              <div className="flex gap-2 mt-1">
                <Button className="flex-1" disabled={busy || !canManage} onClick={() => void decide('accept')}>
                  Terima Serah Terima
                </Button>
                <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="flex-1" disabled={busy || !canManage}>Tolak</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogTitle>Tolak Serah Terima Shift</DialogTitle>
                    <DialogDescription>
                      Sebutkan kriteria keselamatan yang kurang, LOTO yang belum terverifikasi, atau selisih dokumentasi. Alasan disimpan di baris serah terima dan dicerminkan di audit trail.
                    </DialogDescription>
                    <label className="text-xs font-semibold" htmlFor="rej-reason">Alasan Selisih (wajib, ditegakkan server)</label>
                    <Input
                      id="rej-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="mis. Bukti foto cek torsi Step 04 kurang..."
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button variant="secondary" onClick={() => setRejectOpen(false)}>Batal</Button>
                      <Button variant="destructive" disabled={rejectReason.trim().length < 3 || busy} onClick={() => void decide('reject')}>Konfirmasi Penolakan</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          )}

          {live === true && pending === null && decidedTarget !== null && (
            <div className="rounded-lg border border-border-subtle bg-surface p-3" role="status">
              <div className={cn('w-full text-xs font-semibold flex items-center gap-1.5', decidedTarget.status === 'ACCEPTED' ? 'text-pass' : 'text-fail')}>
                {decidedTarget.status === 'ACCEPTED'
                  ? <><CheckCircle2 size={16} /> Serah terima terakhir diterima oleh {decidedTarget.decidedBy} · {new Date(decidedTarget.decidedAt ?? decidedTarget.updatedAt).toLocaleString('id-ID')}</>
                  : <><XCircle size={16} /> Ditolak oleh {decidedTarget.decidedBy}{decidedTarget.rejectReason ? ` — "${decidedTarget.rejectReason}"` : ''}</>}
              </div>
              <p className="text-[11px] text-muted mt-1">
                Record server · <span className="apex-id">{decidedTarget.id}</span> · keputusan terminal tidak bisa diubah (keputusan kedua → 409).
              </p>
            </div>
          )}

          {live !== true && (

          <div className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-2">
            <div>
              <p className="font-semibold text-sm">
                <span className="apex-id">{CANON.workOrderSeal}</span> · Penggantian Seal
              </p>
              <p className="text-xs text-warn-ink mt-0.5">
                Stopwatch berjalan: 01:42:18 · kunci LOTO #4092 di kabinet · Step 04 sudah ditorsi.
              </p>
              <p className="text-[11px] text-muted mt-1">
                Hanya staging lokal — server tidak terjangkau; menerima/menolak di sini tidak mencatat apa pun.
              </p>
            </div>

            <div className="flex gap-2 mt-1">
              {status === 'pending' && (
                <>
                  <Button className="flex-1" onClick={accept}>
                    Accept Handover
                  </Button>
                  <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="flex-1">
                        Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle>Reject Shift Handover</DialogTitle>
                      <DialogDescription>
                        State the missing safety criteria, unverified LOTO, or documentation discrepancy.
                      </DialogDescription>
                      <label className="text-xs font-semibold" htmlFor="rej-reason">Discrepancy Reason</label>
                      <Input
                        id="rej-reason"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. Missing photo evidence on Step 04 torque check..."
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={reject}>Confirm Rejection</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              {status === 'accepted' && (
                <div className="w-full text-xs font-semibold text-pass flex items-center justify-center gap-1.5 py-1">
                  <CheckCircle2 size={16} /> Serah terima disetujui lead Shift B (David Chen)
                </div>
              )}
              {status === 'rejected' && (
                <div className="w-full text-xs font-semibold text-fail flex items-center justify-center gap-1.5 py-1">
                  <XCircle size={16} /> Serah terima ditolak. Teknisi lama wajib tetap bertugas.
                </div>
              )}
            </div>
          </div>
          )}

          <p className="text-xs text-muted" role="status">
            {live
              ? 'Keputusan ditegakkan server: penolakan butuh alasan, baris terminal tidak bisa diubah, setiap aksi masuk audit trail.'
              : 'Jendela serah terima tutup pukul 15:30 WIB. (Demo lokal — server tidak terjangkau: tidak ada yang tersimpan.)'}
          </p>
        </section>
      </div>

      {/* Historical Handover Ledger */}
      <section className="bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Riwayat Audit Serah Terima Shift</h2>
            <p className="text-xs text-muted">
              {live ? 'Baris dari server; setiap pembuatan/keputusan menulis event audit HANDOVER_* dalam transaksi yang sama.' : 'local demo — not persisted (server tidak terjangkau)'}
            </p>
          </div>
          {live === true && rows.length > 0 && <Badge variant="pass">AUDIT TRAIL · RECORD SERVER</Badge>}
          {live === true && rows.length === 0 && <Badge variant="hold">SERVER · BELUM ADA RECORD</Badge>}
          {live === false && <Badge variant="hold">LOCAL DEMO</Badge>}
          {live === null && <Badge variant="warn">CHECKING…</Badge>}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-surface text-muted">
              <tr className="border-b border-border-subtle">
                <th className="p-3 font-semibold">ID Serah Terima</th>
                <th className="p-3 font-semibold">Transisi Shift</th>
                <th className="p-3 font-semibold">Lead Keluar / Masuk</th>
                <th className="p-3 font-semibold">Waktu</th>
                <th className="p-3 font-semibold">Item Diserahterimakan</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {live === true && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted text-xs">
                    Belum ada serah terima server. Gunakan <strong>Mulai Serah Terima (server)</strong> di atas untuk membuat baris PENDING nyata pertama — data seed sengaja kosong (tanpa riwayat fiktif).
                  </td>
                </tr>
              )}
              {live === true && rows.map((h) => (
                <tr key={h.id} className="hover:bg-surface-subtle">
                  <td className="p-3 apex-id font-bold text-cobalt">{h.id.slice(0, 8)}…</td>
                  <td className="p-3 font-medium">{h.shiftFrom} → {h.shiftTo}</td>
                  <td className="p-3">{h.leadFrom} / {h.leadTo}</td>
                  <td className="p-3 apex-id">{new Date(h.createdAt).toLocaleString('id-ID')}</td>
                  <td className="p-3">
                    {h.woRef ? <span className="apex-id mr-1">{h.woRef}</span> : null}{h.items || '—'}
                  </td>
                  <td className="p-3">
                    <Badge variant={h.status === 'ACCEPTED' ? 'pass' : h.status === 'REJECTED' ? 'fail' : 'warn'}>
                      {h.status}
                    </Badge>
                    {h.status !== 'PENDING' && h.decidedBy && (
                      <div className="text-[10px] text-muted mt-1">oleh {h.decidedBy}</div>
                    )}
                  </td>
                  <td className="p-3 text-muted text-[11px]">
                    {h.status === 'REJECTED' && h.rejectReason ? `Rejected: ${h.rejectReason} · ` : ''}{h.notes || '—'}
                  </td>
                </tr>
              ))}
              {live === false && HISTORIC_HANDOVERS.map((h) => (
                <tr key={h.id} className="hover:bg-surface-subtle">
                  <td className="p-3 apex-id font-bold text-cobalt">{h.id} <Badge variant="hold">DEMO</Badge></td>
                  <td className="p-3 font-medium">{h.shiftFrom} → {h.shiftTo}</td>
                  <td className="p-3">{h.leadFrom} / {h.leadTo}</td>
                  <td className="p-3 apex-id">{h.time}</td>
                  <td className="p-3">{h.itemsHandedOver}</td>
                  <td className="p-3">
                    <Badge variant={h.status === 'ACCEPTED' ? 'pass' : h.status === 'REJECTED' ? 'fail' : 'warn'}>
                      {h.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted text-[11px]">{h.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Floating Notifications */}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
