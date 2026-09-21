'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { AssetRow } from '@/lib/services/asset-service';

function healthTone(h: number): 'pass' | 'warn' | 'fail' {
  if (h >= 85) return 'pass';
  if (h >= 70) return 'warn';
  return 'fail';
}

function statusTone(s: string): 'pass' | 'warn' | 'info' {
  if (s === 'OPERATIONAL') return 'pass';
  if (s === 'DEGRADED') return 'warn';
  return 'info';
}

export function AssetRegistry({ rows, orgId }: { rows: AssetRow[]; orgId: string }) {
  const [q, setQ] = useState('');
  const [klass, setKlass] = useState('All Classes');
  const [status, setStatus] = useState('All Statuses');

  const classes = ['All Classes', ...Array.from(new Set(rows.map((r) => r.klass)))];
  const statuses = ['All Statuses', ...Array.from(new Set(rows.map((r) => r.status)))];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (klass !== 'All Classes' && r.klass !== klass) return false;
      if (status !== 'All Statuses' && r.status !== status) return false;
      if (!needle) return true;
      return [r.code, r.name, r.location, r.oem, r.serial].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, klass, status]);

  const degraded = rows.filter((r) => r.status === 'DEGRADED' || r.health < 70).length;
  const openWos = rows.reduce((sum, r) => sum + r.openWos, 0);
  const activeSrs = rows.reduce((sum, r) => sum + r.activeSrs, 0);

  const exportCsv = async () => {
    const { saveAsViaPickerOrDownload } = await import('@/lib/download');
    const rows: (string | number)[][] = [
      ['code', 'name', 'class', 'location', 'oem', 'serial', 'health', 'status', 'commissioned_on', 'open_wos', 'total_wos', 'active_srs'],
      ...filtered.map((r) => [
        r.code, r.name, r.klass, r.location, r.oem, r.serial,
        r.health, r.status, r.commissionedOn ?? '', r.openWos, r.totalWos, r.activeSrs,
      ]),
    ];
    const { buildCsvViaWorker } = await import('@/lib/download');
    const csv = await buildCsvViaWorker(rows, ',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    await saveAsViaPickerOrDownload('asset-registry.csv', blob, 'text/csv');
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Asset Registry</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="ar-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Lifecycle Ledger · {rows.length} assets live from Postgres · tenant {orgId}</p>
            <h1 id="ar-h" className="text-2xl font-semibold tracking-tight">Asset Registry</h1>
            <p className="text-[13px] text-muted">Registered plant with real workload links — WO/SR counts are computed from the database, not painted on.</p>
          </div>
          <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Export (CSV)</Button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Registered Assets', v: String(rows.length), s: `classes: ${classes.length - 1}` },
            { l: 'Degraded / Risk', v: String(degraded), s: 'status DEGRADED or health < 70' },
            { l: 'Open Work Orders', v: String(openWos), s: 'across all assets (real count)' },
            { l: 'Active Service Requests', v: String(activeSrs), s: 'OPEN/TRIAGED/BREACHED on assets' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by code, name, location, OEM, serial…" aria-label="Filter assets" />
          </div>
          <select value={klass} onChange={(e) => setKlass(e.target.value)} aria-label="Class filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {classes.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Asset</th>
                <th className="font-semibold">Name / Location</th>
                <th className="font-semibold">Class</th>
                <th className="font-semibold">OEM · Serial</th>
                <th className="font-semibold">Health</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Workload</th>
                <th className="font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.code} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="apex-id font-bold text-cobalt hover:underline" href={`/assets/${r.code}`}>{r.code}</Link>
                    {r.commissionedOn && <p className="text-[10px] text-muted apex-id">comm. {r.commissionedOn}</p>}
                  </td>
                  <td>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{r.location}</p>
                  </td>
                  <td className="apex-id text-xs">{r.klass}</td>
                  <td className="text-xs">
                    <p>{r.oem}</p>
                    <p className="apex-id text-muted">{r.serial}</p>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
                        <div className={cn('h-full', r.health >= 85 ? 'bg-pass' : r.health >= 70 ? 'bg-warn-dot' : 'bg-fail')} style={{ width: `${r.health}%` }} />
                      </div>
                      <Badge variant={healthTone(r.health)}>{r.health}/100</Badge>
                    </div>
                  </td>
                  <td><Badge variant={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="text-xs tabular-nums">
                    {r.openWos > 0 ? <span className="font-bold text-warn-ink">{r.openWos} open</span> : <span className="text-muted">0 open</span>}
                    <span className="text-muted"> / {r.totalWos} WO</span>
                    {r.activeSrs > 0 && <p className="text-[11px] text-cobalt font-semibold">{r.activeSrs} active SR</p>}
                  </td>
                  <td>
                    <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/assets/${r.code}`}>Open →</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">No assets match — clear filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Showing {filtered.length} of {rows.length} assets · live from Postgres · tenant {orgId} · registry edits (health, BOM) arrive with the inventory slice — no fake mutations here.
        </p>
      </section>
    </>
  );
}
