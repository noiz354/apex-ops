'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, LoaderCircle } from 'lucide-react';
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

export function AssetRegistry({ rows }: { rows: AssetRow[] }) {
  const [q, setQ] = useState('');
  const [klass, setKlass] = useState('Semua Kelas');
  const [status, setStatus] = useState('Semua Status');
  const [busyExport, setBusyExport] = useState(false);

  const classes = useMemo(() => ['Semua Kelas', ...Array.from(new Set(rows.map((r) => r.klass)))], [rows]);
  const statuses = useMemo(() => ['Semua Status', ...Array.from(new Set(rows.map((r) => r.status)))], [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (klass !== 'Semua Kelas' && r.klass !== klass) return false;
      if (status !== 'Semua Status' && r.status !== status) return false;
      if (!needle) return true;
      return [r.code, r.name, r.location, r.oem, r.serial].join(' ').toLowerCase().includes(needle);
    });
  }, [rows, q, klass, status]);

  const stats = useMemo(() => ({
    degraded: rows.filter((r) => r.status === 'DEGRADED' || r.health < 70).length,
    openWos: rows.reduce((sum, r) => sum + r.openWos, 0),
    activeSrs: rows.reduce((sum, r) => sum + r.activeSrs, 0),
  }), [rows]);
  const { degraded, openWos, activeSrs } = stats;

  const exportCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
    const { exportTableCsv } = await import('@/lib/csv-export');
    const rows: (string | number)[][] = [
      ['code', 'name', 'class', 'location', 'oem', 'serial', 'health', 'status', 'commissioned_on', 'open_wos', 'total_wos', 'active_srs'],
      ...filtered.map((r) => [
        r.code, r.name, r.klass, r.location, r.oem, r.serial,
        r.health, r.status, r.commissionedOn ?? '', r.openWos, r.totalWos, r.activeSrs,
      ]),
    ];
    await exportTableCsv('asset-registry.csv', rows);
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Registry Aset</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="ar-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Buku induk aset · {rows.length} aset</p>
            <h1 id="ar-h" className="text-2xl font-semibold tracking-tight">Registry Aset</h1>
            <p className="text-[13px] text-muted">Aset terdaftar dengan beban kerja aktual — jumlah WO/SR dihitung dari database.</p>
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor (CSV)</Button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Aset Terdaftar', v: String(rows.length), s: `kelas: ${classes.length - 1}` },
            { l: 'Terdegradasi / Risiko', v: String(degraded), s: 'status DEGRADED atau kesehatan < 70' },
            { l: 'WO Terbuka', v: String(openWos), s: 'di semua aset' },
            { l: 'SR Aktif', v: String(activeSrs), s: 'OPEN/TRIAGED/BREACHED pada aset' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter berdasarkan kode, nama, lokasi, OEM, serial…" aria-label="Filter aset" />
          </div>
          <select value={klass} onChange={(e) => setKlass(e.target.value)} aria-label="Filter kelas" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {classes.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Aset</th>
                <th className="font-semibold">Nama / Lokasi</th>
                <th className="font-semibold">Kelas</th>
                <th className="font-semibold">OEM · Serial</th>
                <th className="font-semibold">Kesehatan</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Beban Kerja</th>
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
                    {r.openWos > 0 ? <span className="font-bold text-warn-ink">{r.openWos} terbuka</span> : <span className="text-muted">0 terbuka</span>}
                    <span className="text-muted"> / {r.totalWos} WO</span>
                    {r.activeSrs > 0 && <p className="text-[11px] text-cobalt font-semibold">{r.activeSrs} SR aktif</p>}
                  </td>
                  <td>
                    <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/assets/${r.code}`}>Buka →</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">Tidak ada aset yang cocok — ubah filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Menampilkan {filtered.length} dari {rows.length} aset · perubahan registry (kesehatan, BOM) menyusul di modul inventaris.
        </p>
      </section>
    </>
  );
}
