'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Pause,
  Play,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { apiFetch, ApiError } from '@/lib/api/client';

interface PmRule {
  id: string;
  title: string;
  assetCode: string;
  intervalDays: number;
  priority: 'P1' | 'P2' | 'P3';
  status: 'ACTIVE' | 'PAUSED';
  lastGeneratedAt: string | null;
  nextDueAt: string;
  isOverdue: boolean;
}

interface GenerateResult {
  rule: PmRule;
  wo: { number: string; title: string };
}

export default function PmRuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rule, setRule] = useState<PmRule | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'error' | 'missing'>('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setLoadError('');
    try {
      const rules = await apiFetch<PmRule[]>('/api/preventive-maintenance');
      const found = (Array.isArray(rules) ? rules : []).find((r) => r.id === id) ?? null;
      if (!found) {
        setState('missing');
        return;
      }
      setRule(found);
      setState('live');
    } catch (e) {
      setState('error');
      setLoadError(e instanceof ApiError ? `${e.message} (${e.code})` : 'Failed to load PM rule.');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (!rule || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const res = await apiFetch<GenerateResult>(`/api/preventive-maintenance/${encodeURIComponent(rule.id)}/generate`, { method: 'POST' });
      setNotice(`WO ${res.wo.number} generated — SCHEDULED.`);
      await load();
    } catch (e) {
      setNotice(e instanceof ApiError ? `Generate failed: ${e.message} (${e.code})` : 'Generate failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!rule || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await apiFetch(`/api/preventive-maintenance/${encodeURIComponent(rule.id)}/toggle`, { method: 'POST' });
      await load();
    } catch (e) {
      setNotice(e instanceof ApiError ? `Toggle failed: ${e.message} (${e.code})` : 'Toggle failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">Home</Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/preventive-maintenance">Preventive Maintenance</Link>
        <span>/</span>
        <span className="font-semibold text-body font-mono">{id}</span>
      </nav>

      {state === 'loading' && <p className="text-sm text-muted">Loading PM rule…</p>}

      {state === 'error' && (
        <EmptyState
          title="PM rule unavailable"
          description={loadError}
          action={<Link href="/preventive-maintenance"><Button variant="secondary" className="text-xs">Back to PM Schedule</Button></Link>}
        />
      )}

      {state === 'missing' && (
        <EmptyState
          title={`PM rule ${id} not found`}
          description="No rule with this ID exists on this tenant. Rules are created from the PM schedule hub — this page renders live data only."
          action={<Link href="/preventive-maintenance"><Button variant="secondary" className="text-xs">Back to PM Schedule</Button></Link>}
        />
      )}

      {state === 'live' && rule && (
        <>
          <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
                  <Wrench size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-cobalt">{rule.id}</span>
                    <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">{rule.title}</h1>
                    <Badge variant={rule.status === 'ACTIVE' ? 'pass' : 'warn'}>{rule.status}</Badge>
                    {rule.isOverdue && <Badge variant="fail">OVERDUE</Badge>}
                  </div>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    Every {rule.intervalDays} days · Priority {rule.priority} · Scheduler: none (manual generation only)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white"
                  onClick={generate}
                  disabled={busy || rule.status !== 'ACTIVE'}
                  title={rule.status !== 'ACTIVE' ? 'Resume the rule before generating' : 'Generate a scheduled WO now'}
                >
                  <Play size={14} /> Generate WO Now
                </Button>
                <Button variant="secondary" className="h-9 gap-1.5 text-xs" onClick={toggle} disabled={busy}>
                  {rule.status === 'ACTIVE' ? <><Pause size={14} /> Pause</> : <><RotateCcw size={14} /> Resume</>}
                </Button>
              </div>
            </div>
            {notice && <p className="text-xs text-body" role="status">{notice}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border-subtle text-xs">
              <div>
                <span className="text-[10px] font-bold text-muted uppercase block">Target Equipment</span>
                <Link href={`/assets/${rule.assetCode}`} className="font-mono font-bold text-sm text-cobalt hover:underline">
                  {rule.assetCode}
                </Link>
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted uppercase block">Next Due</span>
                <span className="font-semibold text-body text-sm flex items-center gap-1">
                  <Calendar size={13} className="text-muted" />{new Date(rule.nextDueAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted uppercase block">Last Generated</span>
                <span className="font-semibold text-body text-sm flex items-center gap-1">
                  <Clock size={13} className="text-muted" />
                  {rule.lastGeneratedAt ? new Date(rule.lastGeneratedAt).toLocaleString() : 'Never'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted uppercase block">Priority</span>
                <span className="font-mono font-bold text-sm text-body">{rule.priority}</span>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-3">
            <h2 className="text-base font-bold text-ink">Required Spare Parts &amp; Staging</h2>
            <EmptyState
              title="Parts list not stored"
              description="PM rules store schedule + asset only. Stage parts from the generated work order or the inventory ledger."
            />
          </section>

          <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-3">
            <h2 className="text-base font-bold text-ink">Execution Run History</h2>
            <EmptyState
              title="No rule-scoped history stored"
              description="Generated work orders are the history. Open the work-orders list to see what this rule produced."
              action={<Link href="/work-orders"><Button variant="secondary" className="text-xs">Open Work Orders</Button></Link>}
            />
          </section>

          <div className="flex items-center justify-between pt-2">
            <Link href="/preventive-maintenance">
              <Button variant="secondary" className="text-xs gap-1">
                <ArrowLeft size={14} /> Back to PM Schedule
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
