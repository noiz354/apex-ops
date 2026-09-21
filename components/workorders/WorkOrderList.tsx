'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, LoaderCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CANON } from '@/lib/canon';
import { ApiError, apiFetch } from '@/lib/api/client';
import { downloadText } from '@/lib/download';
import type { WoRow } from '@/lib/services/wo-service';

interface Tech { name: string; email: string; role: string }

interface Toast { ok: boolean; title: string; detail: string }

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
  orgId,
}: {
  rows: WoRow[];
  techs: Tech[];
  can: { create: boolean; transition: boolean };
  orgId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All Statuses');
  const [pri, setPri] = useState('All Priorities');
  const [vintage, setVintage] = useState('All Years');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [newOpen, setNewOpen] = useState(false);
  const [nwTitle, setNwTitle] = useState('');
  const [nwAsset, setNwAsset] = useState('');
  const [nwPri, setNwPri] = useState<'P1' | 'P2' | 'P3'>('P2');
  const [nwTouched, setNwTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const [reWO, setReWO] = useState<WoRow | null>(null);
  const [reEmail, setReEmail] = useState(techs[0]?.email ?? '');

  const push = (ok: boolean, title: string, detail: string) => {
    setToasts((t) => [...t, { ok, title, detail }]);
    setTimeout(() => setToasts((t) => t.slice(1)), 6000);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'All Statuses' && r.statusLabel !== status) return false;
      if (pri !== 'All Priorities' && r.priority !== pri) return false;
      if (vintage !== 'All Years' && !r.number.startsWith(vintage)) return false;
      if (!needle) return true;
      return [r.number, r.title, r.location, r.tech ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, status, pri, vintage]);

  const statuses = ['All Statuses', ...Array.from(new Set(rows.map((r) => r.statusLabel)))];
  const breached = rows.filter((r) => r.slaLabel.includes('BREACH')).length;
  const p1 = rows.filter((r) => r.priority === 'P1').length;
  const hold = rows.filter((r) => r.status === 'ON_HOLD').length;

  const exportCsv = () => {
    const head = 'number,title,location,priority,status,sla,assignee';
    const body = filtered.map((r) => [`"${r.number}"`, `"${r.title}"`, `"${r.location}"`, r.priority, `"${r.statusLabel}"`, `"${r.slaLabel}"`, `"${r.tech ?? ''}"`].join(','));
    downloadText('work-orders-pipeline.csv', [head, ...body].join('\n'));
    push(true, 'Pipeline exported', `${filtered.length} work orders → work-orders-pipeline.csv (client-side CSV of persisted rows).`);
  };

  const create = async () => {
    setNwTouched(true);
    if (busy) return;
    const titleOk = nwTitle.trim().length >= 4;
    const assetOk = !nwAsset.trim() || /^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim());
    if (!titleOk || !assetOk) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ workOrder?: WoRow } & Partial<WoRow>>('/api/work-orders', {
        method: 'POST',
        body: { title: nwTitle.trim(), priority: nwPri, assetCode: nwAsset.trim() || null },
      });
      const wo = (data.workOrder ?? data) as WoRow;
      push(true, 'Work order created — persisted', `${wo.number} · OPEN · SLA ${wo.slaLabel} · numbered by server sequence.`);
      setNewOpen(false);
      setNwTitle('');
      setNwAsset('');
      setNwTouched(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Create rejected', `${err.message} (${err.code})`);
      } else {
        push(false, 'Network error', 'Nothing was created. Check the server and retry.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reassign = async () => {
    if (!reWO || busy) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ statusLabel?: string }>(`/api/work-orders/${reWO.number}/transitions`, {
        method: 'POST',
        body: { action: 'assign', assigneeEmail: reEmail },
      });
      const tech = techs.find((t) => t.email === reEmail);
      push(true, 'Tech assigned — persisted', `${reWO.number} → ${tech?.name ?? reEmail} · status unchanged (${data.statusLabel}).`);
      setReWO(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        push(false, 'Reassign rejected', `${err.message} (${err.code})`);
      } else {
        push(false, 'Network error', 'Nothing was changed. Retry.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Work Orders</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="wo-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Dispatch Pipeline · {rows.length} work orders live from Postgres · tenant {orgId}</p>
            <h1 id="wo-h" className="text-2xl font-semibold tracking-tight">Work Orders</h1>
            <p className="text-[13px] text-muted">Execution pipeline from dispatch to close — priorities, SLA exposure, and crew assignment.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Export (CSV)</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!can.create} title={can.create ? undefined : 'Your role lacks wo.create'}><Plus size={16} /> New Work Order</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nw-h">
                <DialogTitle id="nw-h">New Work Order</DialogTitle>
                <DialogDescription>Number is assigned by the server sequence (canon engine) — not the browser.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nw-t">Title (required)</label>
                <Input id="nw-t" value={nwTitle} onChange={(e) => setNwTitle(e.target.value)} invalid={nwTouched && nwTitle.trim().length < 4} placeholder="e.g. Cooling tower fan belt replacement" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nw-a">Target asset (optional)</label>
                    <Input id="nw-a" value={nwAsset} onChange={(e) => setNwAsset(e.target.value.toUpperCase())} invalid={nwTouched && !!nwAsset.trim() && !/^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim())} className="apex-id" placeholder="AST-HVAC-004" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nw-p">Priority (sets SLA window)</label>
                    <select id="nw-p" value={nwPri} onChange={(e) => setNwPri(e.target.value as 'P1' | 'P2' | 'P3')} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {nwTouched && (nwTitle.trim().length < 4 || (nwAsset.trim() && !/^AST-[A-Z]+-\d{3}$/.test(nwAsset.trim()))) && (
                  <p className="text-[11px] font-semibold text-fail">Title (≥4 chars) required; asset must match AST-XXX-NNN.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
                  <Button onClick={create} disabled={busy}>
                    {busy && <LoaderCircle size={16} className="animate-spin" />} Create Work Order
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Open Pipeline', v: String(rows.length), s: `all WOs for tenant ${orgId}` },
            { l: 'P1 Critical', v: String(p1), s: '4h SLA window' },
            { l: 'SLA Breached', v: String(breached), s: 'past real due time' },
            { l: 'On Hold', v: String(hold), s: 'hold reasons persisted' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by ID, title, location, tech…" aria-label="Filter work orders" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={pri} onChange={(e) => setPri(e.target.value)} aria-label="Priority filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['All Priorities', 'P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={vintage} onChange={(e) => setVintage(e.target.value)} aria-label="Year filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['All Years', 'WO-2026', 'WO-2024'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Work Order</th>
                <th className="font-semibold">Title &amp; Location</th>
                <th className="font-semibold">Priority</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">SLA</th>
                <th className="font-semibold">Assignee</th>
                <th className="font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.number} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/work-orders/${r.number}`}>{r.number}</Link>
                    {r.number === CANON.workOrderSeal && <p className="text-[10px] font-bold text-pass">CANON HUB</p>}
                  </td>
                  <td>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted">{r.location || '—'}</p>
                    {r.holdReason && <p className="text-[11px] font-semibold text-warn-ink">HOLD: {r.holdReason}</p>}
                  </td>
                  <td><Badge variant={r.priority === 'P1' ? 'fail' : r.priority === 'P2' ? 'warn' : 'info'}>{r.priority}</Badge></td>
                  <td><Badge variant={statusTone(r)}>{r.statusLabel}</Badge></td>
                  <td className={cn('apex-id text-xs', r.slaLabel.includes('BREACH') ? 'font-bold text-fail' : 'text-muted')}>{r.slaLabel}</td>
                  <td className="text-xs">{r.tech ?? 'Unassigned'}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {can.transition && !r.isTerminal && (
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => { setReWO(r); setReEmail(techs[0]?.email ?? ''); }}>Reassign</button>
                      )}
                      <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/work-orders/${r.number}`}>{r.number === CANON.workOrderSeal ? 'Open Hub →' : 'Open →'}</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted">No work orders match — clear filters or create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Showing {filtered.length} of {rows.length} work orders · live from Postgres · tenant {orgId} · numbering by server sequence.
        </p>
      </section>

      <Dialog open={reWO !== null} onOpenChange={(v) => { if (!v) setReWO(null); }}>
        <DialogContent aria-labelledby="re-h">
          <DialogTitle id="re-h">Reassign {reWO?.number}</DialogTitle>
          <DialogDescription>Persists via the state-machine API — status stays {reWO?.statusLabel}, an event row is written.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="re-tech">Assignee (active users of your tenant)</label>
          <select id="re-tech" value={reEmail} onChange={(e) => setReEmail(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {techs.map((t) => <option key={t.email} value={t.email}>{t.name} · {t.role}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReWO(null)}>Cancel</Button>
            <Button onClick={reassign} disabled={busy || !reEmail}>
              {busy && <LoaderCircle size={16} className="animate-spin" />} Assign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map((t, i) => (
          <div key={i} className={cn('rounded-lg border p-3 shadow-card text-[13px]', t.ok ? 'bg-pass-bg border-pass' : 'bg-fail-bg border-fail')}>
            <p className="font-semibold">{t.ok ? '✓' : '✕'} {t.title}</p>
            <p className="text-muted">{t.detail}</p>
          </div>
        ))}
      </div>
    </>
  );
}
