'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ApiError, apiFetch } from '@/lib/api/client';

export type ToastFn = (ok: boolean, title: string, msg: string, retry?: boolean) => void;

interface DecisionRow {
  number: string;
  kind: 'PO' | 'PR';
  status: string;
  decidedBy: string;
  decidedAt: string;
  reason: string | null;
}

export function AuthDialog({ push, docId, amount, status, onDecided }: {
  push: ToastFn;
  docId: string;
  amount: string;
  status: string;
  onDecided?: () => void;
}) {
  const [phase, setPhase] = useState<'ready' | 'sending' | 'done' | 'failed'>('ready');
  const [msg, setMsg] = useState('');
  const decidable = status === 'PENDING_APPROVAL' || status === 'CREATED';
  const confirm = async () => {
    if (phase === 'sending') return;
    setPhase('sending');
    try {
      const row = await apiFetch<DecisionRow>(
        `/api/purchasing/${encodeURIComponent(docId)}/decision`,
        { method: 'POST', body: { decision: 'APPROVE' } },
      );
      setPhase('done');
      setMsg(`${row.number} disetujui oleh ${row.decidedBy} · tercatat di audit trail.`);
      push(true, 'Disetujui & tercatat', `${row.number} disetujui — pengiriman tetap manual.`);
      onDecided?.();
    } catch (e) {
      setPhase('failed');
      const m = e instanceof ApiError ? `${e.message} (${e.code})` : 'Kesalahan tak terduga — tidak ada yang disetujui.';
      setMsg(m);
      push(false, 'Persetujuan gagal', m);
    }
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={!decidable} title={decidable ? 'Setujui dokumen ini' : `Sudah ${status} — keputusan bersifat final`}>
          Otorisasi{decidable ? '' : ` (${status})`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Otorisasi</DialogTitle>
        <DialogDescription>{docId} → persetujuan tercatat di audit trail</DialogDescription>
        <ul className="text-[13px] flex flex-col gap-1.5">
          <li className="flex justify-between"><span className="text-muted">Jumlah</span><strong className="apex-id">{amount}</strong></li>
          <li className="flex justify-between"><span className="text-muted">Status saat ini</span><strong className="apex-id">{status}</strong></li>
          <li className="flex justify-between"><span className="text-muted">Efek</span><strong>DISETUJUI + event audit</strong></li>
        </ul>
        <p className="text-xs text-muted" role="status">
          {phase === 'ready' && 'Siap — persetujuan dicatat di server. Pengiriman tetap manual.'}
          {phase === 'sending' && 'Mencatat persetujuan…'}
          {(phase === 'done' || phase === 'failed') && msg}
        </p>
        {phase === 'done' && <Badge variant="pass">{docId} DISETUJUI</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPhase('ready')}>Ulangi</Button>
          <Button onClick={confirm} disabled={phase === 'sending' || !decidable}>
            {phase === 'sending' ? 'Mencatat…' : 'Konfirmasi & Setujui'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RFQ_VENDORS = [
  { id: 'earthwise', label: 'Trane EarthWise Direct', sub: '+62-21-5090-0440' },
  { id: 'supplyco', label: 'Trane Supply Co', sub: 'SLA Platinum' },
];

export function RfqDialog({ push, sku }: { push: ToastFn; sku: string }) {
  const [sel, setSel] = useState<string[]>(['earthwise', 'supplyco']);
  const [sent, setSent] = useState(false);
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
  const send = () => {
    setSent(true);
    push(true, 'RFQ dicatat lokal', `Penawaran untuk ${sku} dicatat untuk ${sel.length} kanal — tidak ada integrasi vendor, tidak ada yang dikirim.`);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Minta Penawaran OEM</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Minta Penawaran OEM</DialogTitle>
        <DialogDescription>{sku} · pilih minimal satu vendor · hanya log lokal (tidak ada integrasi vendor)</DialogDescription>
        <div className="flex flex-col gap-2 text-sm">
          {RFQ_VENDORS.map((v) => (
            <label key={v.id} className="flex items-center gap-2 rounded border border-border-subtle p-3 cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#1E40AF]"
                checked={sel.includes(v.id)}
                onChange={() => {
                  toggle(v.id);
                  setSent(false);
                }}
              />
              {v.label} · <span className="apex-id text-muted">{v.sub}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted" role="status">
          {sent ? 'RFQ dicatat lokal — tidak ada integrasi vendor.' : sel.length === 0 ? 'Pilih minimal satu vendor.' : `${sel.length} vendor dipilih.`}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary">Batal</Button>
          <Button disabled={sel.length === 0} onClick={send}>Catat RFQ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RejectDialog({ push, docId, onDecided }: {
  push: ToastFn;
  docId: string;
  onDecided?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3;
  const reject = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const row = await apiFetch<DecisionRow>(
        `/api/purchasing/${encodeURIComponent(docId)}/decision`,
        { method: 'POST', body: { decision: 'REJECT', reason: reason.trim() } },
      );
      setOpen(false);
      setReason('');
      push(true, `${row.number} DITOLAK`, `Alasan tercatat di audit trail oleh ${row.decidedBy}.`);
      onDecided?.();
    } catch (e) {
      const m = e instanceof ApiError ? `${e.message} (${e.code})` : 'Kesalahan tak terduga — tidak ada yang ditolak.';
      push(false, 'Penolakan gagal', m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Tolak</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Tolak {docId}</DialogTitle>
        <DialogDescription>Destruktif — wajib alasan (ditulis ke audit trail)</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="pr-reject-reason">Alasan (wajib, min 3 karakter)</label>
        <textarea
          id="pr-reject-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {!ok && <p className="text-[11px] font-semibold text-fail">Alasan (min 3 karakter) wajib diisi untuk menolak.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button
            variant="destructive"
            disabled={!ok || busy}
            onClick={reject}
          >
            {busy ? 'Menolak…' : 'Tolak'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type DisputeKind = 'return' | 'claim' | 'partial';

export function DisputeDialog({
  push,
  onDisputed,
  docId,
}: {
  push: ToastFn;
  onDisputed: (kind: DisputeKind) => void;
  docId: string;
}) {
  const [kind, setKind] = useState<DisputeKind>('return');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const ok = note.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Tandai Selisih</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Tandai Selisih</DialogTitle>
        <DialogDescription>{docId} · hanya log lokal (belum ada endpoint sengketa)</DialogDescription>
        <div className="flex flex-col gap-2 text-sm" role="radiogroup" aria-label="Jenis sengketa">
          {(
            [
              ['return', 'Retur ke vendor'],
              ['claim', 'Klaim garansi / kerusakan'],
              ['partial', 'Terima sebagian + backorder'],
            ] as [DisputeKind, string][]
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="dsp-kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="accent-[#1E40AF]" />
              {l}
            </label>
          ))}
        </div>
        <label className="text-xs font-semibold" htmlFor="dsp-note">Catatan (wajib)</label>
        <textarea
          id="dsp-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {!ok && <p className="text-[11px] font-semibold text-fail">Jelaskan selisihnya.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button
            disabled={!ok}
            onClick={() => {
              setOpen(false);
              onDisputed(kind);
              push(false, 'Selisih dicatat lokal', `Klaim vendor dicatat (${kind}) — belum ada endpoint sengketa, GRN tidak berubah.`, true);
            }}
          >
            Catat Sengketa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
