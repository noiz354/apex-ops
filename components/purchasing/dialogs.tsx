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
      setMsg(`${row.number} APPROVED by ${row.decidedBy} · recorded in audit trail.`);
      push(true, 'Approved & recorded', `${row.number} APPROVED — EDI auto-dispatch not connected, dispatch stays manual.`);
      onDecided?.();
    } catch (e) {
      setPhase('failed');
      const m = e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing was approved.';
      setMsg(m);
      push(false, 'Approval failed', m);
    }
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={!decidable} title={decidable ? 'Approve this document' : `Already ${status} — decision is terminal`}>
          Authorize{decidable ? '' : ` (${status})`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Authorize</DialogTitle>
        <DialogDescription>{docId} → approval recorded in audit trail (no EDI transmit)</DialogDescription>
        <ul className="text-[13px] flex flex-col gap-1.5">
          <li className="flex justify-between"><span className="text-muted">Amount</span><strong className="apex-id">{amount}</strong></li>
          <li className="flex justify-between"><span className="text-muted">Current status</span><strong className="apex-id">{status}</strong></li>
          <li className="flex justify-between"><span className="text-muted">Effect</span><strong>APPROVED + audit event</strong></li>
        </ul>
        <p className="text-xs text-muted" role="status">
          {phase === 'ready' && 'Ready — approval is recorded server-side. Dispatch stays manual.'}
          {phase === 'sending' && 'Recording approval…'}
          {(phase === 'done' || phase === 'failed') && msg}
        </p>
        {phase === 'done' && <Badge variant="pass">{docId} APPROVED</Badge>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPhase('ready')}>Reset</Button>
          <Button onClick={confirm} disabled={phase === 'sending' || !decidable}>
            {phase === 'sending' ? 'Recording…' : 'Confirm & Approve'}
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
    push(true, 'RFQ logged locally', `Quotes for ${sku} noted for ${sel.length} channel(s) — no vendor integration, nothing was sent.`);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Request OEM Quotes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Request OEM Quotes</DialogTitle>
        <DialogDescription>{sku} · select at least one vendor · local log only (no vendor integration)</DialogDescription>
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
          {sent ? 'RFQ noted locally — no vendor integration.' : sel.length === 0 ? 'Select at least one vendor.' : `${sel.length} vendor(s) selected.`}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary">Cancel</Button>
          <Button disabled={sel.length === 0} onClick={send}>Log RFQ</Button>
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
      push(true, `${row.number} REJECTED`, `Reason recorded in audit trail by ${row.decidedBy}.`);
      onDecided?.();
    } catch (e) {
      const m = e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing was rejected.';
      push(false, 'Rejection failed', m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Reject</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Reject {docId}</DialogTitle>
        <DialogDescription>Destructive — requires a reason (written to the audit trail)</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="pr-reject-reason">Reason (required, min 3 chars)</label>
        <textarea
          id="pr-reject-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {!ok && <p className="text-[11px] font-semibold text-fail">A reason (min 3 chars) is required to reject.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!ok || busy}
            onClick={reject}
          >
            {busy ? 'Rejecting…' : 'Reject'}
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
        <Button variant="secondary">Flag Discrepancy</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Flag Discrepancy</DialogTitle>
        <DialogDescription>{docId} · local log only (no dispute endpoint)</DialogDescription>
        <div className="flex flex-col gap-2 text-sm" role="radiogroup" aria-label="Dispute kind">
          {(
            [
              ['return', 'Return to vendor'],
              ['claim', 'Warranty / damage claim'],
              ['partial', 'Partial accept + backorder'],
            ] as [DisputeKind, string][]
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="dsp-kind" value={v} checked={kind === v} onChange={() => setKind(v)} className="accent-[#1E40AF]" />
              {l}
            </label>
          ))}
        </div>
        <label className="text-xs font-semibold" htmlFor="dsp-note">Note (required)</label>
        <textarea
          id="dsp-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {!ok && <p className="text-[11px] font-semibold text-fail">Describe the discrepancy.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!ok}
            onClick={() => {
              setOpen(false);
              onDisputed(kind);
              push(false, 'Discrepancy logged locally', `Vendor claim noted (${kind}) — no dispute endpoint, GRN unchanged.`, true);
            }}
          >
            Log Dispute
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
