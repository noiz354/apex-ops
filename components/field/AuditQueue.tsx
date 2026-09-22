'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, CloudUpload, Inbox, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/client';
import { listOutbox } from '@/lib/offline/outbox';
import { FieldOffline } from './FieldOffline';
import { FieldToasts, useFieldToasts } from './toasts';

interface ServerAudit {
  number: string;
  title: string;
  auditorName: string;
  progressPct: number;
  status: string;
  createdAt: string;
}

interface Audit {
  id: string;
  title: string;
  sub: string;
  pill: string;
  pillTone: 'fail' | 'warn' | 'pass';
  progress?: number;
  foot?: string;
  critical?: boolean;
}

const AUDITS_DEMO: Audit[] = [
  {
    id: 'INS-2026-0412',
    title: 'Run-Check Chiller Mingguan · Chiller #04',
    sub: 'AST-HVAC-004 · Trane EarthWise CVHE · Langkah 2 dari 4',
    pill: '1 DEFECT KRITIS',
    pillTone: 'fail',
    progress: 65,
    foot: 'Jatuh tempo 15:30 WIB · Ketuk untuk lanjutkan',
    critical: true,
  },
  {
    id: 'INS-2026-0415',
    title: 'Walkdown Ruang Pompa · #B-201 Emer Gen Vault',
    sub: 'Belum mulai · 6 checkpoint · est. 25 mnt',
    pill: 'JATUH TEMPO 16:00',
    pillTone: 'warn',
  },
  {
    id: 'INS-2026-0418',
    title: 'Inspeksi Filter Bank AHU · Lantai 12',
    sub: 'Belum mulai · 4 checkpoint · est. 15 mnt',
    pill: 'ANTRE',
    pillTone: 'pass',
  },
];

const pillTone: Record<Audit['pillTone'], string> = {
  fail: 'text-fail border-fail bg-fail-bg',
  warn: 'text-warn border-warn bg-warn-bg',
  pass: 'text-pass border-pass bg-pass-bg',
};

function toCard(r: ServerAudit): Audit {
  const st = r.status.toUpperCase();
  if (st === 'COMPLETED') {
    return { id: r.number, title: r.title, sub: `${r.auditorName} · selesai`, pill: 'SELESAI', pillTone: 'pass', progress: 100 };
  }
  if (st === 'OVERDUE') {
    return { id: r.number, title: r.title, sub: `${r.auditorName} · terlambat`, pill: 'TERLAMBAT', pillTone: 'fail', progress: r.progressPct };
  }
  if (st === 'SCHEDULED') {
    return { id: r.number, title: r.title, sub: `${r.auditorName} · terjadwal`, pill: 'ANTRE', pillTone: 'pass' };
  }
  return {
    id: r.number, title: r.title, sub: `${r.auditorName} · berjalan`,
    pill: 'BERJALAN', pillTone: 'warn', progress: r.progressPct,
    foot: `Ketuk untuk lanjutkan`,
  };
}

export function AuditQueue() {
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [completed, setCompleted] = useState<ServerAudit[]>([]);
  const [syncCount, setSyncCount] = useState(0);
  const [q, setQ] = useState('');
  const { toasts, push } = useFieldToasts();

  useEffect(() => {
    let alive = true;
    void listOutbox()
      .then((items) => {
        if (alive) setSyncCount(items.filter((i) => i.status === 'QUEUED' || i.status === 'FAILED').length);
      })
      .catch(() => { /* outbox unreadable — badge stays 0 */ });
    void apiFetch<{ rows: ServerAudit[]; total: number }>('/api/inspections')
      .then((res) => {
        if (!alive) return;
        setAudits(res.rows.filter((r) => r.status.toUpperCase() !== 'COMPLETED').map(toCard));
        setCompleted(res.rows.filter((r) => r.status.toUpperCase() === 'COMPLETED'));
        setLive(true);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setAudits(AUDITS_DEMO);
        setCompleted([]);
        setLive(false);
        setLoading(false);
        push(false, 'Luring', 'Daftar audit dari fallback demo. Perubahan antre ke Sinkron.');
      });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => audits.filter(
    (a) => a.id.toLowerCase().includes(q.toLowerCase()) || a.title.toLowerCase().includes(q.toLowerCase())
  ), [audits, q]);
  const lastDone = completed[0] ?? null;

  return (
    <>
      <header className="no-print fixed top-7 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b-2 border-slate900">
        <div className="min-h-16 px-4 flex items-center justify-between gap-2 max-w-3xl mx-auto w-full py-2">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="h-9 w-9 shrink-0" viewBox="0 0 160 40" fill="none" role="img" aria-label="Apex Ops logo">
              <rect width="36" height="36" rx="8" fill="#1E40AF" />
              <path d="M18 8L27 24H9L18 8Z" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" />
              <circle cx="18" cy="20" r="2.5" fill="#FFFFFF" />
              <path d="M12 28H24" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold font-display leading-tight truncate">Audit Saya</h1>
              <p className="text-xs text-muted truncate">
                E. Voronova · Shift A · {live ? 'Daftar server' : 'Demo luring'}
              </p>
            </div>
          </div>
          <Link
            href="/field/sync"
            className="relative min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white"
            aria-label={`Status sinkron, ${syncCount} item antre`}
          >
            <CloudUpload size={24} />
            <span className="absolute -top-2 -right-2 px-1 rounded bg-fail text-white text-[11px] leading-tight font-bold min-w-[20px] text-center">{syncCount}</span>
          </Link>
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 pt-[124px] flex flex-col gap-4">
        <FieldOffline />

        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter audit berdasar ID atau judul…"
            aria-label="Filter audit"
            className="min-h-[48px] pl-10 text-base border-2 focus:border-slate900 focus:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2" aria-label="Memuat audit">
            <Skeleton className="h-24 rounded border-2 border-border-strong" />
            <Skeleton className="h-24 rounded border-2 border-border-strong" />
            <Skeleton className="h-24 rounded border-2 border-border-strong" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border-2 border-dashed border-hold bg-white p-6 text-center flex flex-col items-center gap-2">
            <Inbox size={36} className="text-muted" />
            <p className="text-lg font-semibold font-display">Tidak ada audit yang cocok</p>
            <p className="text-sm text-muted">Tidak ada run yang cocok “{q}”.</p>
            <Link href="/field/sync" className="min-h-[48px] inline-flex items-center px-4 rounded bg-slate900 text-white text-sm font-bold">
              Buka Antrean Sinkron
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Audit yang ditugaskan">
            {rows.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/field/audits/${a.id}/run`}
                  className={cn(
                    'block rounded border-2 bg-white overflow-hidden active:scale-[0.99]',
                    a.critical ? 'border-fail' : 'border-border-strong'
                  )}
                >
                  <span className="flex">
                    {a.critical && <span className="w-2 bg-fail shrink-0" aria-hidden="true" />}
                    <span className="flex-1 p-3 flex flex-col gap-2 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="apex-id font-bold bg-surface-subtle border-[1.5px] border-hold px-2 py-0.5 rounded">{a.id}</span>
                        <span className={cn('text-xs font-bold border px-2 py-0.5 rounded', pillTone[a.pillTone])}>{a.pill}</span>
                      </span>
                      {/* GAP-15 (F18): run route only renders the checklist for the
                          canonical inspection — other audits land on an honest
                          "TODO Fase 2" EmptyState, so the card says so upfront. */}
                      {a.id !== 'INS-2026-0412' && (
                        <span className="text-xs font-bold text-warn border border-warn bg-warn-bg px-2 py-0.5 rounded self-start">
                          Fase 2 · checklist run belum tersedia
                        </span>
                      )}
                      <span className="text-lg font-semibold font-display">{a.title}</span>
                      <span className="text-sm text-muted">{a.sub}</span>
                      {typeof a.progress === 'number' && (
                        <span className="flex items-center gap-2">
                          <span className="flex-1 h-3 rounded-full bg-surface-subtle border border-border-strong overflow-hidden">
                            <span className="block h-full bg-pass rounded-full" style={{ width: `${a.progress}%` }} />
                          </span>
                          <span className="apex-id font-bold">{a.progress}%</span>
                        </span>
                      )}
                      {a.foot && <span className="text-xs text-muted">{a.foot}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {lastDone && (
          <section className="rounded border-2 border-slate900 bg-white shadow-hard p-3 flex flex-col gap-2" aria-label="Run terakhir selesai">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold font-display">Run Terakhir Selesai</h2>
              <span className="text-xs font-bold text-pass border border-pass bg-pass-bg px-2 py-0.5 rounded">COMPLETED</span>
            </div>
            <p className="text-sm">
              <span className="apex-id font-bold">{lastDone.number}</span> · {lastDone.title} · {lastDone.auditorName}
            </p>
            <p className="text-xs text-muted">Tercatat di ledger inspeksi {new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB · status server {lastDone.status}</p>
          </section>
        )}

        <p className="text-xs text-muted flex items-center gap-1">
          <ClipboardList size={14} /> {audits.length} ditugaskan · Shift A 07:00–15:30 WIB {live ? '(live)' : '(demo)'}
        </p>
      </main>

      <FieldToasts toasts={toasts} />
    </>
  );
}
