'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Play, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError as ApiClientError, apiFetch } from '@/lib/api/client';
import type { WoAction, WoStatus } from '@/lib/domain/work-orders';
import { isTerminal } from '@/lib/domain/work-orders';


interface TransitionProps {
  number: string;
  status: WoStatus;
  enabled: boolean;
}

interface ApiError { code: string; message: string }

function useTransition(number: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const post = async (action: WoAction, reason?: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const data = await apiFetch<{ statusLabel?: string }>(`/api/work-orders/${number}/transitions`, {
        method: 'POST',
        body: { action, reason: reason ?? null },
      });
      setDone(data.statusLabel ?? action);
      router.refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message });
        if (err.code === 'WO_STALE_STATE' || err.code === 'WO_INVALID_TRANSITION') router.refresh();
      } else {
        setError({ code: 'NETWORK', message: 'Gangguan jaringan — tidak ada yang berubah. Coba lagi.' });
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, done, post, reset: () => { setError(null); setDone(null); } };
}

function ErrorLine({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <p className="text-[11px] font-semibold text-fail" role="alert">
      {error.message} <span className="apex-id">({error.code})</span>
    </p>
  );
}

export function HoldDialog({ number, status, enabled }: TransitionProps) {
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const [reason, setReason] = useState('Menunggu advisor vendor — konfirmasi spesifikasi torsi.');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  const blocked = !enabled || status === 'ON_HOLD' || isTerminal(status);
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={blocked} title={blocked ? `Tidak bisa ditahan dari ${status}` : undefined}>Tahan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Tahan Work Order</DialogTitle>
        <DialogDescription>{number} · status {status} · jam SLA tetap berjalan</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-hold-reason">Alasan (wajib — tersimpan bersama transisi)</label>
        <textarea id="wo-hold-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">Alasan wajib diisi untuk menahan work order.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="warn">{done} — tersimpan</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('hold', reason)) closeTimer.current = window.setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Konfirmasi Tahan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EscalateDialog({ number, status, enabled }: TransitionProps) {
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const [reason, setReason] = useState('Vibrasi 7,8 mm/s di ambang trip — minta advisor Tier-1 ke lokasi sebelum commissioning.');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  const blocked = !enabled || status === 'ESCALATED' || isTerminal(status);
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={blocked} title={blocked ? `Tidak bisa dieskalasi dari ${status}` : undefined}>Eskalasi ke Vendor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Eskalasi ke Vendor</DialogTitle>
        <DialogDescription>Vendor · kontrak pemeliharaan · <span className="apex-id">+62-21-5090-0440</span></DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-esc-reason">Alasan (wajib — tersimpan bersama transisi)</label>
        <textarea id="wo-esc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">Alasan wajib diisi untuk eskalasi.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="info">{done} — tersimpan</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('escalate', reason)) closeTimer.current = window.setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Kirim Eskalasi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResumeDialog({ number, status, enabled }: TransitionProps) {
  const { busy, error, done, post } = useTransition(number);
  if (status !== 'ON_HOLD' && status !== 'ESCALATED') return null;
  return (
    <span className="flex items-center gap-2">
      <Button variant="secondary" disabled={!enabled || busy} onClick={() => post('resume')}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />} Lanjutkan
      </Button>
      {done && <Badge variant="pass">{done} — tersimpan</Badge>}
      <ErrorLine error={error} />
    </span>
  );
}

export function CancelDialog({ number, status, enabled }: TransitionProps) {
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  if (isTerminal(status)) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={!enabled} title={enabled ? undefined : 'Peran Anda tidak dapat mengubah WO'}>Batalkan WO</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Batalkan {number}</DialogTitle>
        <DialogDescription>Pembatalan bersifat final — work order tidak bisa dibuka lagi (status {status}).</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-cancel-reason">Alasan (wajib — tersimpan bersama transisi)</label>
        <textarea id="wo-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="mis. Aset dinonaktifkan / duplikat WO lain"
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">Alasan wajib diisi untuk pembatalan.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="info">{done} — tersimpan</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Tetap Buka</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('cancel', reason)) closeTimer.current = window.setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Konfirmasi Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SignoffDialog({ number, status, enabled }: TransitionProps) {
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);
  const [open, setOpen] = useState(false);
  const [uploaded, setUploaded] = useState<{ fileName: string; sha256Hash: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { busy, error, done, post, reset } = useTransition(number);
  const blocked = !enabled || status !== 'IN_PROGRESS' || isTerminal(status);

  const onFile = async (file: File | null) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const ev = await fetch(`/api/work-orders/${encodeURIComponent(number)}/evidence/upload`, {
        method: 'POST',
        body: form,
      });
      const env = (await ev.json()) as { ok: boolean; data?: { fileName: string; sha256Hash: string }; error?: { message?: string } };
      if (!ev.ok || !env.ok || !env.data) {
        setUploadError(env.error?.message ?? `Gagal mengunggah (HTTP ${ev.status})`);
      } else {
        setUploaded({ fileName: env.data.fileName, sha256Hash: env.data.sha256Hash });
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Gagal mengunggah — coba lagi.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setUploaded(null); setUploadError(null); } }}>
      <DialogTrigger asChild>
        <Button disabled={blocked} title={blocked ? `Sign-off butuh status IN PROGRESS (saat ini: ${status})` : undefined}>Tandai Selesai</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Sign-off K3</DialogTitle>
        <DialogDescription>{number} · penyelesaian Langkah 04 · status: {status}</DialogDescription>
        <ul className="text-sm flex flex-col gap-2">
          <li className="flex items-center gap-2"><Badge variant="pass">✓</Badge> Prasyarat Langkah 05 diperiksa</li>
          <li className="flex items-center gap-2"><Badge variant="pass">✓</Badge> LOTO terverifikasi · gembok &amp; titik isolasi tercatat</li>
          <li className="flex items-start gap-2 flex-col">
            <span className="flex items-center gap-2">
              <Badge variant={uploaded ? 'pass' : 'warn'}>{uploaded ? '✓' : '!'}</Badge>
              Foto verifikasi Langkah 04 {uploaded ? 'terunggah' : 'wajib'} — tersimpan di server dengan hash SHA-256
            </span>
            <input
              id="signoff-photo"
              name="signoffPhoto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Lampirkan foto verifikasi (JPEG/PNG/WEBP, maks 10MB)"
              disabled={uploading}
              className="text-[12px] file:mr-2 file:h-7 file:px-2 file:rounded file:border file:border-border-strong file:bg-card file:text-[12px]"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            {uploading && <span className="text-[11px] text-muted">Mengunggah…</span>}
            {uploadError && (
              <span className="text-[11px] font-semibold text-fail" role="alert">{uploadError}</span>
            )}
            {uploaded && (
              <span className="text-[11px] text-muted apex-id">
                {uploaded.fileName} · sha256:{uploaded.sha256Hash.slice(0, 12)}… — tercatat di evidence
              </span>
            )}
          </li>
        </ul>
        <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3">
          <span className="w-10 h-10 rounded-full bg-cobalt-tint text-cobalt-deep text-sm font-bold flex items-center justify-center">MB</span>
          <div><p className="text-sm font-semibold">Sign-off badge</p><p className="apex-id text-muted">Tempel badge RFID untuk tanda tangan</p></div>
        </div>
        {!uploaded && <p className="text-[11px] font-semibold text-warn">Lampirkan foto verifikasi Langkah 04 untuk mengaktifkan sign-off.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="pass">{done} — tersimpan</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!uploaded || busy} onClick={async () => { if (await post('complete')) closeTimer.current = window.setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Tanda Tangani &amp; Selesaikan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog({ number }: { number?: string }) {
  const woNumber = number ?? 'WO';
  const [pct, setPct] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  const start = () => {
    if (running) return;
    setRunning(true);
    setPct(0);
    timer.current = window.setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          if (timer.current) window.clearInterval(timer.current);
          timer.current = null;
          setRunning(false);
          return 100;
        }
        return p + 20;
      });
    }, 300);
  };
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="secondary">Ekspor Log WO (simulasi)</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Ekspor Log WO</DialogTitle>
        <DialogDescription>{woNumber} · CSV + manifest evidence — simulasi job latar (ekspor nyata menyusul di modul worker)</DialogDescription>
        <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
          <div className="h-full bg-cobalt-deep transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted" role="status">
          {pct === 100 ? 'Selesai (simulasi) — belum ada file.' : running ? 'Job exp-7d21 berjalan…' : 'Siap. Ekspor berjalan sebagai simulasi job latar.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={start} disabled={running || pct === 100}>Jalankan</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PrintButton({ number }: { number?: string }) {
  if (number) {
    return (
      <Link href={`/work-orders/${number}/print`}>
        <Button variant="secondary">
          <Printer size={16} /> Cetak Travel Pack
        </Button>
      </Link>
    );
  }
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer size={16} /> Cetak Dossier
    </Button>
  );
}
