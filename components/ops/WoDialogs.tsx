'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Play, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
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
        setError({ code: 'NETWORK', message: 'Network error — nothing was changed. Retry.' });
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
  const [reason, setReason] = useState('Awaiting Trane field advisor — seal seating torque spec confirmation.');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  const blocked = !enabled || status === 'ON_HOLD' || isTerminal(status);
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={blocked} title={blocked ? `Cannot hold from ${status}` : undefined}>Put On Hold</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Put On Hold</DialogTitle>
        <DialogDescription>{number} · current status {status} · clock keeps running unless stopped</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-hold-reason">Reason (required — persisted with the transition)</label>
        <textarea id="wo-hold-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">A reason is required to hold a work order.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="warn">{done} — persisted</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('hold', reason)) setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Confirm Hold
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EscalateDialog({ number, status, enabled }: TransitionProps) {
  const [reason, setReason] = useState('Vibration 7.8 mm/s at trip threshold — request Tier-1 advisor on site before commissioning.');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  const blocked = !enabled || status === 'ESCALATED' || isTerminal(status);
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={blocked} title={blocked ? `Cannot escalate from ${status}` : undefined}>Escalate to Vendor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Escalate to Vendor</DialogTitle>
        <DialogDescription>Trane Technologies · {CANON.msa} · <span className="apex-id">+62-21-5090-0440</span> (notification delivery: slice #2)</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-esc-reason">Reason (required — persisted with the transition)</label>
        <textarea id="wo-esc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">A reason is required to escalate.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="info">{done} — persisted</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('escalate', reason)) setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Send Escalation
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
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />} Resume Work
      </Button>
      {done && <Badge variant="pass">{done} — persisted</Badge>}
      <ErrorLine error={error} />
    </span>
  );
}

export function CancelDialog({ number, status, enabled }: TransitionProps) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const { busy, error, done, post, reset } = useTransition(number);
  if (isTerminal(status)) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={!enabled} title={enabled ? undefined : 'Your role lacks wo.transition'}>Cancel WO</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Cancel {number}</DialogTitle>
        <DialogDescription>Cancellation is terminal — the work order cannot be reopened (current status {status}).</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="wo-cancel-reason">Reason (required — persisted with the transition)</label>
        <textarea id="wo-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Asset decommissioned / duplicate of another WO"
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
        {!reason.trim() && <p className="text-[11px] font-semibold text-fail">A reason is required to cancel.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="info">{done} — persisted</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep Open</Button>
          <Button disabled={!reason.trim() || busy} onClick={async () => { if (await post('cancel', reason)) setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Confirm Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SignoffDialog({ number, status, enabled }: TransitionProps) {
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
        setUploadError(env.error?.message ?? `Upload failed (HTTP ${ev.status})`);
      } else {
        setUploaded({ fileName: env.data.fileName, sha256Hash: env.data.sha256Hash });
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed — try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setUploaded(null); setUploadError(null); } }}>
      <DialogTrigger asChild>
        <Button disabled={blocked} title={blocked ? `Sign-off requires IN PROGRESS (current: ${status})` : undefined}>Mark Task Complete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>OSHA Sign-off</DialogTitle>
        <DialogDescription>{number} · Step 04 completion · server state: {status}</DialogDescription>
        <ul className="text-sm flex flex-col gap-2">
          <li className="flex items-center gap-2"><Badge variant="pass">✓</Badge> Step 05 prerequisites reviewed</li>
          <li className="flex items-center gap-2"><Badge variant="pass">✓</Badge> LOTO verified · Padlock {CANON.lotoPadlock} @ {CANON.lotoPoint}</li>
          <li className="flex items-start gap-2 flex-col">
            <span className="flex items-center gap-2">
              <Badge variant={uploaded ? 'pass' : 'warn'}>{uploaded ? '✓' : '!'}</Badge>
              Step 04 verification photo {uploaded ? 'uploaded' : 'required'} — stored server-side with SHA-256 integrity hash
            </span>
            <input
              id="signoff-photo"
              name="signoffPhoto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Attach verification photo (JPEG/PNG/WEBP, max 10MB)"
              disabled={uploading}
              className="text-[12px] file:mr-2 file:h-7 file:px-2 file:rounded file:border file:border-border-strong file:bg-card file:text-[12px]"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            {uploading && <span className="text-[11px] text-muted">Uploading &amp; hashing…</span>}
            {uploadError && (
              <span className="text-[11px] font-semibold text-fail" role="alert">{uploadError}</span>
            )}
            {uploaded && (
              <span className="text-[11px] text-muted apex-id">
                {uploaded.fileName} · sha256:{uploaded.sha256Hash.slice(0, 12)}… — attached to evidence ledger
              </span>
            )}
          </li>
        </ul>
        <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3">
          <span className="w-10 h-10 rounded-full bg-cobalt-tint text-cobalt-deep text-sm font-bold flex items-center justify-center">MB</span>
          <div><p className="text-sm font-semibold">Smart Badge sign-off</p><p className="apex-id text-muted">Tap badge RFID-7714 · {CANON.engineer}</p></div>
        </div>
        {!uploaded && <p className="text-[11px] font-semibold text-warn">Attach the Step 04 verification photo to enable sign-off.</p>}
        <ErrorLine error={error} />
        {done && <Badge variant="pass">{done} — persisted</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!uploaded || busy} onClick={async () => { if (await post('complete')) setTimeout(() => setOpen(false), 600); }}>
            {busy && <LoaderCircle size={16} className="animate-spin" />} Sign &amp; Complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog({ number }: { number?: string }) {
  const woNumber = number ?? CANON.workOrderSeal;
  const [pct, setPct] = useState(0);
  const [running, setRunning] = useState(false);
  const start = () => {
    if (running) return;
    setRunning(true);
    setPct(0);
    const t = setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          clearInterval(t);
          setRunning(false);
          return 100;
        }
        return p + 20;
      });
    }, 300);
  };
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="secondary">Export WO Log (simulated)</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Export WO Log</DialogTitle>
        <DialogDescription>{woNumber} · CSV + evidence manifest — simulated background job (real exports ship with the worker slice)</DialogDescription>
        <div className="h-2 rounded-full bg-surface-subtle overflow-hidden">
          <div className="h-full bg-cobalt-deep transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted" role="status">
          {pct === 100 ? 'Done (simulated) — no file is produced yet.' : running ? 'Job exp-7d21 running…' : 'Ready. Export runs as a simulated background job.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={start} disabled={running || pct === 100}>Run</Button>
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
          <Printer size={16} /> Print Travel Pack
        </Button>
      </Link>
    );
  }
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer size={16} /> Print Dossier
    </Button>
  );
}
