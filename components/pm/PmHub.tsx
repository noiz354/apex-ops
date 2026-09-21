'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, FlaskConical, Pause, Play, Plus, X, XCircle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { ApiError, apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Plan {
  id: string; name: string; asset: string; zone: string; cadence: string;
  trigger: string; last: string; lastWo: string; next: string; state: string; cat: string;
}

const SEED: Plan[] = [
  { id: 'PM-PLN-0082', name: 'Monthly High-Speed Elevator Overhaul & Brake Test', asset: 'AST-ELEV-02', zone: 'East Shaft Core (L1-42)', cadence: 'Every 30 Days', trigger: 'Floating Interval', last: '12 Jan 2025', lastWo: 'WO-2025-0144', next: '3d OVERDUE', state: 'OVERDUE', cat: 'Elevators' },
  { id: 'PM-PLN-0056', name: 'Bi-Weekly Diesel Generator Load Bank Run', asset: 'AST-GEN-001', zone: 'Sub-Basement Vault B2', cadence: 'Every 14 Days', trigger: 'Calendar (Fixed)', last: '01 Feb 2025', lastWo: 'WO-2025-0421', next: 'Today 17:00 · Shift B window', state: 'DUE SOON', cat: 'Generators' },
  { id: CANON.pmPlan, name: 'Quarterly Chiller Loop & Compressor Overhaul', asset: CANON.assetSeal, zone: 'Central Utility Plant · Basement L2', cadence: '90d / 5,000 hrs', trigger: 'Hybrid Dual', last: '14 Nov 2024', lastWo: 'WO-2024-8902', next: 'In 2 Days · 188 run-hrs left', state: 'READY', cat: 'HVAC & Chillers' },
  { id: 'PM-PLN-0112', name: 'Semi-Annual Cleanroom HEPA Filter Audit', asset: 'AST-ENV-108', zone: 'Clean Lab Annex 4', cadence: 'Every 180 Days', trigger: 'Calendar (Fixed)', last: '28 Aug 2024', lastWo: 'WO-2024-6101', next: 'In 12 Days', state: 'SCHEDULED', cat: 'Life Safety' },
  { id: 'PM-PLN-0041', name: 'Annual Transformer Dielectric Oil Sampling', asset: 'AST-ELEC-01', zone: 'Grid Substation North Yard', cadence: 'Every 365 Days', trigger: 'Calendar (Fixed)', last: '19 Mar 2024', lastWo: 'WO-2024-2209', next: 'In 32 Days', state: 'SCHEDULED', cat: 'Generators' },
];

interface ServerRule {
  id: string; title: string; assetCode: string; intervalDays: number;
  priority: 'P1' | 'P2' | 'P3'; status: 'ACTIVE' | 'PAUSED';
  lastGeneratedAt: string | null; nextDueAt: string; isOverdue: boolean; createdAt: string;
}

const DUE_SOON_MS = 14 * 24 * 3600 * 1000;

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 800;

const stateTone = (s: string) =>
  s === 'OVERDUE' ? 'fail' : s === 'DUE SOON' || s === 'PAUSED' ? 'warn' : s === 'READY' || s === 'ACTIVE' ? 'info' : 'hold';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dueLabel(r: ServerRule): { text: string; state: string } {
  if (r.status === 'PAUSED') return { text: `Paused · due ${fmtDate(r.nextDueAt)}`, state: 'PAUSED' };
  if (r.isOverdue) return { text: `OVERDUE · due ${fmtDate(r.nextDueAt)}`, state: 'OVERDUE' };
  if (new Date(r.nextDueAt).getTime() - Date.now() <= DUE_SOON_MS) {
    return { text: `Due soon · ${fmtDate(r.nextDueAt)}`, state: 'DUE SOON' };
  }
  return { text: fmtDate(r.nextDueAt), state: 'READY' };
}

export function PmHub() {
  const [rules, setRules] = useState<ServerRule[] | null>(null);
  const [dirState, setDirState] = useState<'loading' | 'live' | 'demo'>('loading');
  const [dirError, setDirError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('All');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [dispatching, setDispatching] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [npName, setNpName] = useState('');
  const [npAsset, setNpAsset] = useState<string>(CANON.assetSeal);
  const [npDays, setNpDays] = useState('90');
  const [npTouched, setNpTouched] = useState(false);

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const live = dirState === 'live';

  const refresh = useCallback(async () => {
    try {
      const list = await apiFetch<ServerRule[]>('/api/preventive-maintenance');
      setRules(list);
      setDirState('live');
      setDirError('');
    } catch (err) {
      setRules(null);
      setDirState('demo');
      setDirError(err instanceof ApiError ? `${err.code} (${err.status})` : 'network');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const dueSoon = (r: ServerRule) =>
    r.status === 'ACTIVE' && !r.isOverdue && new Date(r.nextDueAt).getTime() - Date.now() <= DUE_SOON_MS;

  const queue: ServerRule[] = live && rules
    ? rules.filter((r) => r.status === 'ACTIVE' && (r.isOverdue || dueSoon(r)))
    : [];

  const filtered: Plan[] = live && rules
    ? rules
      .filter((r) => {
        if (filter === 'Overdue' && !r.isOverdue) return false;
        if (filter === 'Due soon' && !dueSoon(r)) return false;
        if (filter === 'Paused' && r.status !== 'PAUSED') return false;
        if (filter === 'Active' && r.status !== 'ACTIVE') return false;
        const needle = q.trim().toLowerCase();
        return !needle || `${r.id} ${r.title} ${r.assetCode}`.toLowerCase().includes(needle);
      })
      .map((r) => {
        const d = dueLabel(r);
        return {
          id: r.id, name: r.title, asset: r.assetCode, zone: '—',
          cadence: `Every ${r.intervalDays} Days`, trigger: 'Calendar (Fixed)',
          last: fmtDate(r.lastGeneratedAt), lastWo: generated[r.id] ?? '—',
          next: d.text, state: d.state,
          cat: r.status === 'PAUSED' ? 'Paused' : r.isOverdue ? 'Overdue' : dueSoon(r) ? 'Due soon' : 'Active',
        };
      })
    : SEED.filter((p) => {
      const needle = q.trim().toLowerCase();
      return !needle || `${p.id} ${p.name} ${p.asset}`.toLowerCase().includes(needle);
    });

  const createPlan = async () => {
    setNpTouched(true);
    const days = parseInt(npDays, 10);
    if (!npName.trim() || !/^AST-[A-Z]+-\d{3}$/.test(npAsset.trim()) || !Number.isFinite(days) || days < 1) return;
    try {
      const rule = await apiFetch<ServerRule>('/api/preventive-maintenance', {
        method: 'POST',
        body: {
          title: npName.trim(),
          assetCode: npAsset.trim(),
          intervalDays: days,
          priority: 'P2',
        },
      });
      await refresh();
      setNewOpen(false);
      setNpName('');
      setNpTouched(false);
      push(true, 'PM plan created', `${rule.id} · first cycle due ${fmtDate(rule.nextDueAt)} · persisted via /api/preventive-maintenance.`);
    } catch (err) {
      push(false, 'Create failed', err instanceof ApiError ? `${err.code} — server refused the plan.` : 'Network error — server tidak terjangkau.');
    }
  };

  const generateOne = async (ruleId: string): Promise<string | null> => {
    try {
      const res = await apiFetch<{ rule: ServerRule; wo: { number: string } }>(
        `/api/preventive-maintenance/${encodeURIComponent(ruleId)}/generate`,
        { method: 'POST' },
      );
      setGenerated((g) => ({ ...g, [ruleId]: res.wo.number }));
      await refresh();
      return res.wo.number;
    } catch (err) {
      push(false, `Generate failed (${ruleId})`, err instanceof ApiError ? `${err.code} — server refused generation.` : 'Network error — server tidak terjangkau.');
      return null;
    }
  };

  const executeBatch = async () => {
    if (dispatching || !live) return;
    const pending = queue.filter((r) => !generated[r.id]);
    if (pending.length === 0) {
      push(true, 'Batch clear', 'All queued plans already generated.');
      return;
    }
    setDispatching(true);
    push(true, 'Dispatch started', `Generating ${pending.length} work order(s) via /api/preventive-maintenance…`);
    let ok = 0;
    for (const r of pending) {
      const wo = await generateOne(r.id);
      if (wo) ok++;
    }
    setDispatching(false);
    push(ok === pending.length, 'Batch complete', `${ok}/${pending.length} WO(s) generated from server rules${ok < pending.length ? ' — see failures above.' : '.'}`);
  };

  const toggleRule = async (rule: ServerRule) => {
    const target = rule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await apiFetch<ServerRule>(`/api/preventive-maintenance/${encodeURIComponent(rule.id)}/toggle`, {
        method: 'POST',
        body: { status: target },
      });
      await refresh();
      push(true, target === 'PAUSED' ? 'Rule paused' : 'Rule resumed', `${rule.id} → ${target} · persisted.`);
    } catch (err) {
      push(false, 'Toggle failed', err instanceof ApiError ? `${err.code} — server refused.` : 'Network error — server tidak terjangkau.');
    }
  };

  const kpis = live && rules ? [
    { l: 'Total PM Rules', v: String(rules.length), s: 'live server count' },
    { l: 'Active Rules', v: String(rules.filter((r) => r.status === 'ACTIVE').length), s: 'live server count' },
    { l: 'Overdue', v: String(rules.filter((r) => r.isOverdue && r.status === 'ACTIVE').length), s: 'live server count' },
    { l: 'Due ≤ 14d', v: String(rules.filter((r) => dueSoon(r)).length), s: 'live server count' },
    { l: 'Dispatch Mode', v: 'MANUAL', s: 'Generate from the queue below · no auto-engine' },
  ] : [
    { l: 'Total Active PM Plans', v: '38 (demo)', s: 'demo records — server unreachable' },
    { l: 'PM Compliance Rate', v: '96.4% (demo)', s: 'demo records — server unreachable' },
    { l: 'Upcoming Cycles (14d)', v: '19 (demo)', s: 'demo records — server unreachable' },
    { l: 'Overdue / SLA Breach', v: '03 (demo)', s: 'demo records — server unreachable' },
    { l: 'Dispatch Mode', v: 'MANUAL', s: 'Generate from the queue below · no auto-engine' },
  ];

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">PM Master &amp; Automation Engine</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="pm-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Operations · <Badge variant="pass">SYS-RUNNING</Badge>{' '}
              <Badge variant={live ? 'pass' : 'warn'}>{live ? 'Live rules' : dirState === 'loading' ? 'Loading…' : 'Demo offline'}</Badge>
            </p>
            <h1 id="pm-h" className="text-2xl font-semibold tracking-tight">Preventive Maintenance Scheduling &amp; Automation Engine</h1>
            <p className="text-[13px] text-muted">Recurring calendar schedules with server-persisted rules and manual WO generation.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/shifts/plan"><Button variant="secondary"><CalendarDays size={16} /> Shift Calendar View</Button></Link>
            <Button
              variant="secondary"
              disabled={!live}
              title={live ? 'Scroll to the generation queue' : 'Server unreachable — demo mode'}
              onClick={() => {
                document.getElementById('dispatch-queue')?.scrollIntoView({ behavior: 'smooth' });
                push(true, 'Queue ready', `${queue.filter((r) => !generated[r.id]).length} plan(s) await execution below.`);
              }}
            >
              <Zap size={16} /> Generate Work Orders Now · {live ? queue.filter((r) => !generated[r.id]).length : '—'} Ready
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!live} title={live ? 'Define a new PM rule' : 'Server unreachable — demo mode'}><Plus size={16} /> New PM Plan Definition</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="np-h">
                <DialogTitle id="np-h">New PM Plan Definition</DialogTitle>
                <DialogDescription>Creates a calendar rule via POST /api/preventive-maintenance.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="np-name">Plan name (required)</label>
                <Input id="np-name" value={npName} onChange={(e) => setNpName(e.target.value)} invalid={npTouched && !npName.trim()} placeholder="e.g. Monthly Cooling Tower Descale" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-asset">Target asset</label>
                    <Input id="np-asset" value={npAsset} onChange={(e) => setNpAsset(e.target.value.toUpperCase())} invalid={npTouched && !/^AST-[A-Z]+-\d{3}$/.test(npAsset.trim())} className="apex-id" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-days">Cadence (days)</label>
                    <Input id="np-days" inputMode="numeric" value={npDays} onChange={(e) => setNpDays(e.target.value)} invalid={npTouched && !(parseInt(npDays, 10) >= 1)} />
                  </div>
                </div>
                {npTouched && (!npName.trim() || !/^AST-[A-Z]+-\d{3}$/.test(npAsset.trim()) || !(parseInt(npDays, 10) >= 1)) && (
                  <p className="text-[11px] font-semibold text-fail">Name + AST-XXX-000 asset + cadence ≥ 1 day are required.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
                  <Button onClick={() => void createPlan()}>Create Rule</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {dirState === 'demo' && (
          <p className="rounded-lg border border-warn bg-warn-bg/40 p-3 text-[13px]" role="alert">
            Server unreachable ({dirError}) — showing demo records. Create, generate, and pause are disabled until the server responds.
          </p>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {kpis.map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Trigger Model — <span className="apex-id">{CANON.pmPlan}</span></h2>
            <Badge variant="hold">DESIGN REFERENCE · LOCAL DEMO</Badge>
          </div>
          <p className="text-xs text-muted -mt-2">How calendar rules work on the server (intervalDays → nextDueAt). Meter/SCADA values below are illustrative — this console has no live Modbus link.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Time Cadence Component · Server Rule</p>
              <p className="font-semibold">Every N calendar days (intervalDays)</p>
              <p className="text-muted">Server computes nextDueAt = last + interval; overdue when now &gt; nextDueAt. Pause via the toggle in the table.</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Meter Component · Not Connected</p>
              <p className="font-semibold">Operating-hours triggers are planned, not wired</p>
              <p className="text-muted">No Modbus/SCADA link from this console (local demo). Telemetry ingest exists server-side only.</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Generation · Manual + Idempotent</p>
              <p className="apex-id">POST /api/preventive-maintenance/[id]/generate</p>
              <p className="text-muted">Creates a SCHEDULED WO numbered from the WO sequence; safe to retry with the same Idempotency-Key.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rules by ID, title, asset…" aria-label="Filter rules" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rule filters">
          {['All', 'Active', 'Overdue', 'Due soon', 'Paused'].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
              className={cn('h-8 px-3 rounded text-xs font-semibold border', filter === c ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Rule ID &amp; Title</th>
                <th className="font-semibold">Target Asset</th>
                <th className="font-semibold">Cadence</th>
                <th className="font-semibold">Trigger Type</th>
                <th className="font-semibold">Last Generated</th>
                <th className="font-semibold">Next Due</th>
                <th className="font-semibold">Health</th>
                <th className="font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rule = live && rules ? rules.find((r) => r.id === p.id) : undefined;
                return (
                  <tr key={p.id} className="border-b border-surface-subtle hover:bg-surface">
                    <td className="p-2"><p className="apex-id font-bold text-cobalt">{p.id}</p><p>{p.name}</p></td>
                    <td>
                      {p.asset === CANON.assetSeal ? (
                        <Link className="apex-id font-bold text-cobalt hover:underline" href={`/assets/${p.asset}`}>{p.asset}</Link>
                      ) : (
                        <span className="apex-id font-bold">{p.asset}</span>
                      )}
                      <p className="text-xs text-muted">{p.zone}</p>
                    </td>
                    <td>{p.cadence}</td>
                    <td className="text-xs">{p.trigger}</td>
                    <td><p>{p.last}</p>{p.lastWo !== '—' && <p className="apex-id text-xs text-muted">{p.lastWo}</p>}</td>
                    <td>{p.next}</td>
                    <td><Badge variant={stateTone(p.state)}>{p.state}</Badge></td>
                    <td>
                      {rule ? (
                        <div className="flex gap-1">
                          <Button variant="secondary" disabled={!live} title={rule.status === 'ACTIVE' ? 'Pause this rule' : 'Resume this rule'} onClick={() => void toggleRule(rule)}>
                            {rule.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
                          </Button>
                          <Button variant="secondary" disabled={!live || rule.status !== 'ACTIVE'} title="Generate a work order from this rule now" onClick={() => void generateOne(rule.id)}>
                            <Zap size={14} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">demo — no actions</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">{live ? 'No rules match — clear filters.' : 'No demo records match — clear filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">Showing {filtered.length} of {live && rules ? rules.length : SEED.length} {live ? 'live server' : 'demo'} rules.</p>

        <div id="dispatch-queue" className="rounded-lg border-2 border-warn bg-warn-bg/40 p-4 flex flex-col gap-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Generation Dispatch Queue</h2>
            <span className="text-xs text-muted">{live ? `Queue built from server rules: ${queue.length} overdue/due-soon plan(s).` : 'Server unreachable — demo queue without actions.'}</span>
          </div>
          {live ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {queue.map((r) => (
                <li key={r.id} className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="apex-id font-bold">{r.id}</span>
                    {generated[r.id]
                      ? <Badge variant="pass">GENERATED → {generated[r.id]}</Badge>
                      : <Badge variant={r.isOverdue ? 'fail' : 'warn'}>{r.isOverdue ? 'OVERDUE' : 'DUE SOON'}</Badge>}
                  </div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-muted text-xs">Asset: <span className="apex-id">{r.assetCode}</span> · every {r.intervalDays}d · {r.priority}</p>
                  {!generated[r.id] && (
                    <div><Button variant="secondary" disabled={dispatching} onClick={() => void generateOne(r.id)}><Zap size={14} /> Generate WO</Button></div>
                  )}
                </li>
              ))}
              {queue.length === 0 && (
                <li className="rounded-lg border border-border-subtle bg-card p-3 text-[13px] text-muted">Queue clear — no active rule is overdue or due within 14 days.</li>
              )}
            </ul>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SEED.slice(0, 4).map((i) => (
                <li key={i.id} className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="apex-id font-bold">{i.id}</span>
                    <Badge variant="hold">DEMO · NO ACTIONS</Badge>
                  </div>
                  <p className="font-semibold">{i.name}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void executeBatch()} disabled={dispatching || !live} title={live ? 'Generate WOs for every queued rule' : 'Server unreachable — demo mode'}>
              <Zap size={16} /> {dispatching ? 'Generating…' : `Execute Dispatch Batch (${live ? queue.filter((r) => !generated[r.id]).length : 0} WOs)`}
            </Button>
            <Button variant="secondary" onClick={() => setSimOpen((s) => !s)}>
              <FlaskConical size={16} /> Simulate Generation Run
            </Button>
          </div>
          {simOpen && (
            <div className="rounded-lg border border-border-subtle bg-card p-3 text-[13px]" role="status">
              <p className="font-semibold">Simulation — dry run estimate (local, no server calls)</p>
              <ul className="text-muted">
                {(live ? queue : []).map((r) => <li key={r.id}>· {r.id}: {r.title} · every {r.intervalDays}d</li>)}
              </ul>
              <p className="text-muted">Nothing dispatched — dry run only.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Shift Workload Balancing (14d) <span className="text-xs font-normal text-muted">Nusantara East Wing</span></h2>
              <Badge variant="hold">LOCAL DEMO</Badge>
            </div>
            <p className="text-xs text-muted">Illustrative capacity sketch — not computed from dispatch data.</p>
            <Link className="text-cobalt font-semibold hover:underline text-[13px]" href="/shifts/plan">Shift Plan →</Link>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">30-Day Dispatch Outlook</h2>
              <Badge variant={live ? 'pass' : 'hold'}>{live ? 'LIVE RULES' : 'DEMO'}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Ready now</p><p className="text-lg font-bold">{live && rules ? `${queue.length} rules` : '4 plans (demo)'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Paused</p><p className="text-lg font-bold">{live && rules ? String(rules.filter((r) => r.status === 'PAUSED').length) : '—'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Overdue</p><p className="text-lg font-bold text-fail">{live && rules ? String(rules.filter((r) => r.isOverdue && r.status === 'ACTIVE').length) : '03 (demo)'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Generated this session</p><p className="text-lg font-bold text-pass">{Object.keys(generated).length}</p></div>
            </div>
            <div className="rounded border border-border-subtle bg-card p-2 text-[13px]">
              <p className="font-semibold">Modbus SCADA Connection <Badge variant="hold">NOT CONNECTED</Badge></p>
              <p className="text-muted">No live meter link from this console (local demo). Telemetry ingest exists server-side only.</p>
            </div>
          </div>
        </div>
      </section>

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
