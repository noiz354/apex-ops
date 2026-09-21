'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Layers,
  Plus,
  Search,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface FindingRecord {
  id: string;
  title: string;
  assetId: string;
  assetName: string;
  zone: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'PENDING_TRIAGE' | 'CONVERTED' | 'DISMISSED';
  inspector: string;
  inspectionId: string;
  reportedAt: string;
  actionRequired: string;
  convertedWo?: string;
}

const SEVERITY_MAP: Record<string, FindingRecord['severity']> = {
  CRITICAL: 'CRITICAL',
  MAJOR: 'HIGH',
  MODERATE: 'MEDIUM',
  MINOR: 'LOW',
};

interface LiveFindingRow {
  number: string;
  title: string;
  severity: string;
  status: string;
  inspectionNumber: string | null;
  assetCode: string | null;
  convertedWoNumber: string | null;
  createdAt: string | Date;
}

function toRecord(r: LiveFindingRow): FindingRecord {
  const asset = r.assetCode ?? '—';
  return {
    id: r.number,
    title: r.title,
    assetId: asset,
    assetName: asset,
    zone: '—',
    severity: SEVERITY_MAP[r.severity] ?? 'MEDIUM',
    status: r.status === 'CONVERTED' ? 'CONVERTED' : r.status === 'DISMISSED' ? 'DISMISSED' : 'PENDING_TRIAGE',
    inspector: '—',
    inspectionId: r.inspectionNumber ?? '—',
    reportedAt: new Date(r.createdAt).toLocaleString(),
    actionRequired: 'Open triage desk for action',
    convertedWo: r.convertedWoNumber ?? undefined,
  };
}

export default function FindingsListPage() {
  const [filterSev, setFilterSev] = useState('ALL');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<FindingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/findings', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`GET /api/findings → HTTP ${res.status}`);
        const body = (await res.json()) as
          | { data?: { rows?: LiveFindingRow[] }; rows?: LiveFindingRow[] };
        const live = body.data?.rows ?? body.rows ?? [];
        if (!cancelled) {
          setRows(live.map(toRecord));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load findings');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = rows.filter((f) => {
    if (filterSev !== 'ALL' && f.severity !== filterSev) return false;
    const needle = q.trim().toLowerCase();
    return (
      !needle ||
      `${f.id} ${f.title} ${f.assetId} ${f.inspector} ${f.zone}`.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Breadcrumb & Header */}
      <section className="flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Home
          </Link>
          <span>/</span>
          <Link className="hover:text-cobalt transition-colors" href="/field-inspections">
            Field Inspections
          </Link>
          <span>/</span>
          <span className="font-semibold text-body">Findings &amp; Defect Triage Desk</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-fail-bg border border-fail/30 text-fail flex items-center justify-center">
              <Workflow size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display">
                  Findings &amp; Auto-WO Conversion Desk
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-fail text-white text-[11px] font-mono font-bold">
                  {loading ? '…' : `${rows.filter((f) => f.status === 'PENDING_TRIAGE').length} Pending Triage`}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Review failed checklist steps and convert critical field defects into dispatched Work Orders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/field/findings/new">
              <Button className="h-9 gap-1.5 text-xs bg-fail hover:bg-fail-dot text-white">
                <Plus size={14} /> + Log Defect Finding
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">
              Total Logged Defects
            </span>
            <span className="text-2xl font-bold font-display text-ink tabular-nums">{loading ? '…' : String(rows.length).padStart(2, '0')}</span>
            <span className="text-xs text-muted block mt-0.5">Across all zones (7d)</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-muted">
            <Layers size={20} />
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">
              Critical / Immediate Hazard
            </span>
            <span className="text-2xl font-bold font-display text-fail tabular-nums">{loading ? '…' : String(rows.filter((f) => f.severity === 'CRITICAL').length).padStart(2, '0')}</span>
            <span className="text-xs text-fail font-semibold block mt-0.5">LOTO Lockout Required</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-fail-bg flex items-center justify-center text-fail">
            <AlertOctagon size={20} />
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">
              Dispatched to Work Orders
            </span>
            <span className="text-2xl font-bold font-display text-pass-ink tabular-nums">{loading ? '…' : String(rows.filter((f) => f.status === 'CONVERTED').length).padStart(2, '0')}</span>
            <span className="text-xs text-pass-ink font-semibold block mt-0.5">Auto-WO Chain Active</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-pass-bg flex items-center justify-center text-pass">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search finding ID, title, asset, or zone…"
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs font-semibold text-muted">Criticality:</span>
          <select
            value={filterSev}
            onChange={(e) => setFilterSev(e.target.value)}
            className="h-9 px-2 border border-border-strong rounded text-xs bg-card"
          >
            <option value="ALL">All Levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </section>

      {/* Findings List */}
      <section className="flex flex-col gap-3">
        {loading ? (
          <p className="text-xs text-muted">Loading findings…</p>
        ) : loadError ? (
          <p role="alert" className="text-xs text-red-600">{loadError}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted">No findings match.</p>
        ) : null}
        {filtered.map((f) => (
          <div
            key={f.id}
            className={cn(
              'bg-card rounded-xl border p-5 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all',
              f.severity === 'CRITICAL' ? 'border-fail/40 bg-fail-bg/10' : 'border-border-subtle'
            )}
          >
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-ink">{f.id}</span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono font-bold',
                    f.severity === 'CRITICAL'
                      ? 'bg-fail text-white'
                      : f.severity === 'HIGH'
                      ? 'bg-warn text-white'
                      : 'bg-surface border border-border-subtle text-muted'
                  )}
                >
                  {f.severity}
                </span>
                <span className="font-mono text-xs text-muted">
                  from {f.inspectionId} ({f.reportedAt})
                </span>
              </div>

              <h2 className="text-base font-bold text-ink font-display">{f.title}</h2>

              <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                <span className="flex items-center gap-1 font-mono font-semibold text-body">
                  {f.assetId} · {f.assetName}
                </span>
                <span>•</span>
                <span>{f.zone}</span>
                <span>•</span>
                <span>Inspector: <strong className="text-body">{f.inspector}</strong></span>
              </div>

              <p className="text-xs text-muted font-mono mt-0.5">
                Action: <span className="text-body font-semibold">{f.actionRequired}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {f.status === 'CONVERTED' ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-pass-ink bg-pass-bg border border-pass/30 px-2 py-1 rounded">
                    CONVERTED: {f.convertedWo}
                  </span>
                  <Link href={`/work-orders/${f.convertedWo}`}>
                    <Button variant="secondary" className="h-8 px-2.5 text-xs">
                      View WO <ArrowRight size={12} className="ml-1" />
                    </Button>
                  </Link>
                </div>
              ) : f.status === 'DISMISSED' ? (
                <span className="text-xs font-mono font-semibold text-muted bg-surface border border-border-subtle px-2 py-1 rounded">
                  DISMISSED
                </span>
              ) : (
                <Link href={`/field/findings/${f.id}`}>
                  <Button
                    className={cn(
                      'h-9 px-3 text-xs gap-1.5 font-bold',
                      f.severity === 'CRITICAL'
                        ? 'bg-fail hover:bg-fail-dot text-white'
                        : 'bg-cobalt-deep hover:bg-cobalt text-white'
                    )}
                  >
                    Triage &amp; Auto-Convert <ArrowRight size={14} />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
