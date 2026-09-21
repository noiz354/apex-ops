'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Download, LoaderCircle, Plus, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import { downloadText } from '@/lib/download';
import type { SrRow } from '@/lib/services/sr-service';

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1700;

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
  orgId,
}: {
  rows: SrRow[];
  can: { create: boolean; transition: boolean };
  orgId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All Statuses');
  const [toasts, setToasts] = useState<Toast[]>([]);
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

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'All Statuses' && r.statusLabel !== status) return false;
      if (!needle) return true;
      return [r.number, r.title, r.requesterName, r.assetCode ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, status]);

  const awaiting = rows.filter((r) => r.status === 'OPEN' || r.status === 'BREACHED').length;
  const p1 = rows.filter((r) => r.priority === 'P1' && r.status !== 'CONVERTED' && r.status !== 'CLOSED').length;
  const breached = rows.filter((r) => r.status === 'BREACHED' || r.slaLabel.includes('BREACH')).length;
  const converted = rows.filter((r) => r.status === 'CONVERTED').length;

  const exportCsv = () => {
    const head = 'number,title,requester,priority,status,sla,asset,converted_wo';
    const body = filtered.map((r) => [`"${r.number}"`, `"${r.title}"`, `"${r.requesterName}"`, r.priority, `"${r.statusLabel}"`, `"${r.slaLabel}"`, `"${r.assetCode ?? ''}"`, `"${r.convertedWoNumber ?? ''}"`].join(','));
    downloadText('service-requests-queue.csv', [head, ...body].join('\n'));
    push(true, 'Queue exported', `${filtered.length} tickets → service-requests-queue.csv (client-side CSV of persisted rows).`);
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
      push(true, 'Request queued — persisted', `${data.number} · OPEN · triage clock ${data.slaLabel} · numbered by server sequence.`);
      setNewOpen(false);
      setNwName(''); setNwTitle(''); setNwAsset(''); setNwTouched(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Intake rejected', `${err.message} (${err.code})`);
      } else {
        push(false, 'Network error', 'Nothing was created. Check the server and retry.');
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
        push(false, `${okTitle} rejected`, `${err.message} (${err.code})`);
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
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Service Requests</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="sr-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Triage Queue · {rows.length} tickets live from Postgres · tenant {orgId}</p>
            <h1 id="sr-h" className="text-2xl font-semibold tracking-tight">Service Requests</h1>
            <p className="text-[13px] text-muted">Intake triage — SLA clocks, conversion to dispatch (transactional SR → WO), and closure.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Export (CSV)</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!can.create} title={can.create ? undefined : 'Your role lacks sr.create'}><Plus size={16} /> New Request</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nr-h">
                <DialogTitle id="nr-h">New Service Request</DialogTitle>
                <DialogDescription>Number is assigned by the server sequence; the triage SLA window is set from the priority (P1 15m · P2 45m · P3 2h).</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nr-n">Requestor name (required)</label>
                <Input id="nr-n" value={nwName} onChange={(e) => setNwName(e.target.value)} invalid={nwTouched && nwName.trim().length < 2} placeholder="e.g. Dana Priya · Front Desk" />
                <label className="text-xs font-semibold" htmlFor="nr-t">Title (required)</label>
                <Input id="nr-t" value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} invalid={nwTouched && nwTitle.trim().length < 3} placeholder="e.g. AHU noise complaint level 5" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nr-p">Priority</label>
                    <select id="nr-p" value={nwPri} onChange={(e) => setNwPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nr-a">Linked asset (optional)</label>
                    <Input id="nr-a" value={nwAsset} onChange={(e) => setNwAsset(e.target.value.toUpperCase())} invalid={nwTouched && !!nwAsset.trim() && !/^AST-[A-Z0-9-]{3,}$/.test(nwAsset.trim())} className="apex-id" placeholder="AST-HVAC-004" />
                  </div>
                </div>
                {nwTouched && (nwName.trim().length < 2 || nwTitle.trim().length < 3) && (
                  <p className="text-[11px] font-semibold text-fail">Requestor + title are required.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
                  <Button onClick={create} disabled={busy}>
                    {busyKey === 'create' && <LoaderCircle size={16} className="animate-spin" />} Queue Request
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Awaiting Triage', v: String(awaiting), s: 'OPEN + BREACHED queue depth' },
            { l: 'P1 Critical', v: String(p1), s: 'active P1 tickets (15m window)' },
            { l: 'SLA Breached', v: String(breached), s: 'past real triage due time' },
            { l: 'Converted', v: String(converted), s: 'SR → WO chains (one-time)' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by ID, title, requestor, asset…" aria-label="Filter service requests" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['All Statuses', 'OPEN', 'TRIAGED', 'BREACHED', 'CONVERTED', 'CLOSED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Ticket</th>
                <th className="font-semibold">Title</th>
                <th className="font-semibold">Requestor</th>
                <th className="font-semibold">Asset</th>
                <th className="font-semibold">Priority</th>
                <th className="font-semibold">Triage SLA</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.number} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/service-requests/${r.number}`}>{r.number}</Link>
                    {r.number === CANON.serviceRequest && <p className="text-[10px] font-bold text-pass">CANON DESK</p>}
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
                          onClick={() => postTransition(r.number, { action: 'triage' }, (d) => `${d.sr.number} → TRIAGED · SLA clock ${d.sr.slaLabel}.`, 'Triage saved')}>
                          {busyKey === r.number + 'triage' ? <LoaderCircle size={12} className="animate-spin inline" /> : 'Triage'}
                        </button>
                      )}
                      {can.transition && !['CONVERTED', 'CLOSED'].includes(r.status) && (
                        <button type="button" className="text-cobalt font-semibold hover:underline disabled:opacity-50" disabled={busy}
                          onClick={() => { setConvSR(r); setConvTitle(r.title); setConvPri(r.priority); }}>
                          Convert → WO
                        </button>
                      )}
                      {can.transition && !['CONVERTED', 'CLOSED'].includes(r.status) && (
                        <button type="button" className="text-fail font-semibold hover:underline disabled:opacity-50" disabled={busy}
                          onClick={() => { setCloseSR(r); setCloseReason(''); }}>
                          Close
                        </button>
                      )}
                      <Link className="text-cobalt font-semibold hover:underline" href={`/service-requests/${r.number}`}>Detail →</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">No tickets match — clear filters or queue a new request.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Showing {filtered.length} of {rows.length} tickets · live from Postgres · tenant {orgId} · conversion is one-time &amp; transactional (SR + WO commit together).
        </p>
      </section>

      {/* Convert dialog */}
      <Dialog open={convSR !== null} onOpenChange={(v) => { if (!v) setConvSR(null); }}>
        <DialogContent aria-labelledby="cv-h">
          <DialogTitle id="cv-h">Convert {convSR?.number} → Work Order</DialogTitle>
          <DialogDescription>Creates the WO in the same transaction (server numbering + SLA window from priority). One-time: a converted ticket cannot convert again.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cv-t">WO title</label>
          <Input id="cv-t" value={convTitle} onChange={(e) => setConvTitle(e.target.value)} />
          <label className="text-xs font-semibold" htmlFor="cv-p">WO priority (sets 4h/8h/24h execution SLA)</label>
          <select id="cv-p" value={convPri} onChange={(e) => setConvPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConvSR(null)}>Cancel</Button>
            <Button disabled={busy || convTitle.trim().length < 3}
              onClick={async () => {
                if (!convSR) return;
                const ok = await postTransition(
                  convSR.number,
                  { action: 'convert', woTitle: convTitle.trim(), woPriority: convPri },
                  (d) => `${d.sr.number} → CONVERTED · work order ${d.workOrder?.number} created (OPEN, ${convPri}).`,
                  'Converted — persisted',
                );
                if (ok) setConvSR(null);
              }}>
              {convSR && busyKey === convSR.number + 'convert' && <LoaderCircle size={16} className="animate-spin" />} Convert to Work Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeSR !== null} onOpenChange={(v) => { if (!v) setCloseSR(null); }}>
        <DialogContent aria-labelledby="cl-h">
          <DialogTitle id="cl-h">Close {closeSR?.number}</DialogTitle>
          <DialogDescription>Closing is terminal — the ticket cannot be reopened (file a new request instead).</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="cl-r">Closure reason (required — persisted in the audit trail)</label>
          <textarea id="cl-r" rows={2} value={closeReason} onChange={(e) => setCloseReason(e.target.value)}
            className="w-full p-2 border border-border-strong rounded text-sm outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" placeholder="e.g. Duplicate of SR-2026-0893 / resolved on site" />
          {!closeReason.trim() && <p className="text-[11px] font-semibold text-fail">A reason is required to close a ticket.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCloseSR(null)}>Cancel</Button>
            <Button disabled={busy || !closeReason.trim()}
              onClick={async () => {
                if (!closeSR) return;
                const ok = await postTransition(
                  closeSR.number,
                  { action: 'close', reason: closeReason.trim() },
                  (d) => `${d.sr.number} → CLOSED · reason stored in audit trail.`,
                  'Closed — persisted',
                );
                if (ok) setCloseSR(null);
              }}>
              {closeSR && busyKey === closeSR.number + 'close' && <LoaderCircle size={16} className="animate-spin" />} Close Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
