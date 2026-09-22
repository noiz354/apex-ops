'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, CalendarClock, Database, Download, Eye, FileText, Play, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/client';

interface Aggregates {
  workOrders: { total: number; open: number; completed: number };
  assets: { totalRegistered: number };
  inventory: { totalSkus: number; lowStockSkus: number; valuationUsd: string };
  serviceRequests: { total: number; converted: number };
}

const MONTHS = [
  { m: 'JAN', v: 292 }, { m: 'FEB', v: 298 }, { m: 'MAR', v: 275 },
  { m: 'APR', v: 280 }, { m: 'MEI', v: 284 }, { m: 'JUN (Est)', v: 290 },
];

const CATS = [
  { n: 'HVAC & Central Utility Plant (CUP)', d: 'Chiller, Cooling Tower, otomasi BAS', v: '$600,033', p: 42.0 },
  { n: 'Electrical & High Voltage Switchgear', d: 'Trafo, UPS, genset ATS', v: '$342,876', p: 24.0 },
  { n: 'Fire & Life Safety Suppression', d: 'Detektor VESDA, riser dry chemical', v: '$214,297', p: 15.0 },
  { n: 'Plumbing & Water Treatment', d: 'Reverse osmosis, graywater pumps', v: '$157,151', p: 11.0 },
  { n: 'Elevators & Vertical Conveyance', d: 'Otis SkyRise 1-8 hydraulic traction', v: '$114,293', p: 8.0 },
];

const SLA = [
  { p: 'Prioritas 1 · Darurat', max: '4,0 jam', avg: 'rata-rata 1,4 jam', buf: 'Buffer 2,6 jam (margin 65%)', tgt: 'Target: < 4,0 jam', met: '100% Tercapai (42/42 tiket)', pct: 100 },
  { p: 'Prioritas 2 · Rutin Mendesak', max: '8,0 jam', avg: 'rata-rata 3,2 jam', buf: 'Buffer 4,8 jam (margin 60%)', tgt: 'Target: < 8,0 jam', met: '97,8% Tercapai (184/188 tiket)', pct: 97.8 },
  { p: 'Prioritas 3 · PM Rutin', max: '24,0 jam', avg: 'rata-rata 5,1 jam', buf: 'Buffer 18,9 jam (margin 78%)', tgt: 'Target: < 24,0 jam', met: '99,4% Tercapai (628/632 tiket)', pct: 99.4 },
];

interface Dossier { id: string; title: string; cat: string; meta: string; gen: string; owner: string; cadence: string; status: string }

const DOSSIERS: Dossier[] = [
  { id: 'RPT-OPEX-2026-M05', title: 'Ledger Biaya & Varians Pemeliharaan Menyeluruh', cat: 'Keuangan & OPEX', meta: '42 Halaman · Sinkron General Ledger penuh', gen: 'Hari ini, 08:00 UTC', owner: 'Marcus Vance (VP Ops)', cadence: 'Otomatis Bulanan (tgl 1)', status: 'Sesuai GAAP / SOX' },
  { id: 'RPT-REL-CHLR-004', title: 'Dossier Kesehatan Aset, Telemetri & Downtime Kritis', cat: 'Teknik Keandalan', meta: 'Fokus: Chiller #04, Substation B, Boiler #02', gen: 'Kemarin, 18:30 UTC', owner: 'Automated Telemetry Daemon', cadence: 'Mingguan tiap Senin (06:00 UTC)', status: 'Selaras ISO 55001' },
  { id: 'RPT-WFM-SHIFT-02', title: 'Produktivitas Teknisi & Utilisasi Tenaga Kerja', cat: 'Operasi Workforce', meta: '96 Teknisi Aktif · 88,4% wrench time tercatat', gen: '2 Hari Lalu', owner: 'Shift Lead Sarah K.', cadence: 'Siklus Shift Dua Mingguan', status: 'TRIR 0,00 · Safety Zero' },
  { id: 'RPT-INV-FIFO-91', title: 'Valuasi Suku Cadang & Audit Dead Stock', cat: 'Rantai Pasok', meta: '18 SKU flag reorder · basis biaya FIFO', gen: '14 Mei 2026', owner: 'Logistics Officer Kenji R.', cadence: 'Audit Bulanan (tgl 15)', status: 'Ledger Terekonsiliasi' },
];

const RANGES = ['7 Hari Terakhir', 'Rolling 30 Hari', 'Kuartal 1 2026', 'YTD 2026'] as const;
const FACS = ['HQ Campus - East Wing (Active)', 'Central Utility Plant B-204', 'High Voltage Substation A/B', 'West Tower Commercial Annex', 'Logistics Warehouse Crib #4', 'All Aggregated Locations (Cluster)'] as const;
const FAC_IDS = ['HQ-EAST-NUSANTARA', 'CUP-B2-MECH', 'SUBSTN-AB', 'WEST-TOWER-ANX', 'LOG-CRIB-04', 'ALL-CLUSTER'] as const;
const DIMS = ['Kelas Aset (HVAC, Mech, Power)', 'Kode Kerusakan (Standar ISO 14224)', 'Tier Vendor & Penyedia Jasa', 'Cost Center & Kode General Ledger', 'Tipe Work Order (Korektif vs PM)'] as const;
const DIM_SQL = ['asset_class', 'failure_code_iso14224', 'vendor_tier', 'cost_center_gl', 'wo_type'] as const;
const METRICS = [
  { n: 'Jam Kerja', sql: 'SUM(labor_cost)' },
  { n: 'Biaya Parts', sql: 'SUM(parts_cost)' },
  { n: 'Fee Kontraktor', sql: 'SUM(contractor_fees)' },
  { n: 'SLA Exposure', sql: 'AVG(mttr_hours)' },
] as const;
const OUTPUTS = ['Dossier Eksekutif PDF', 'Excel Terformat (.xlsx)', 'CSV / Parquet Mentah', 'Grid Data Live (simulasi)'] as const;


const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function ReportsHub() {
  const [cat, setCat] = useState('Semua Klasifikasi');
  const { toasts, push, dismiss } = useToasts(8000);
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedRep, setSchedRep] = useState(DOSSIERS[0].id);
  const [schedCad, setSchedCad] = useState('Mingguan tiap Senin (06:00 UTC)');
  const [schedMail, setSchedMail] = useState('');
  const [schedTouched, setSchedTouched] = useState(false);
  const [scheduled, setScheduled] = useState<string[]>([
    'RPT-OPEX-2026-M05 · Otomatis Bulanan (tgl 1)',
    'RPT-REL-CHLR-004 · Mingguan tiap Senin (06:00 UTC)',
  ]);
  const [prev, setPrev] = useState<Dossier | null>(null);
  const [range, setRange] = useState<string>(RANGES[0]);
  const [fac, setFac] = useState<string>(FACS[0]);
  const [dim, setDim] = useState<string>(DIMS[0]);
  const [mets, setMets] = useState<string[]>(['Jam Kerja', 'Biaya Parts']);
  const [out, setOut] = useState<string>(OUTPUTS[2]);
  const [ran, setRan] = useState(false);
  const [agg, setAgg] = useState<Aggregates | null>(null);
  const [aggMs, setAggMs] = useState<number | null>(null);
  const [aggError, setAggError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<Aggregates | null>(null);
  const [kpiLive, setKpiLive] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(true);

  const loadKpi = async () => {
    setKpiLoading(true);
    try {
      const kpiData = await apiFetch<Aggregates>('/api/reports/aggregates');
      setKpi(kpiData);
      setKpiLive(true);
    } catch {
      setKpi(null);
      setKpiLive(false);
    } finally {
      setKpiLoading(false);
    }
  };



  const filtered = useMemo(() => DOSSIERS.filter((d) => cat === 'Semua Klasifikasi' || d.cat === cat), [cat]);

  useEffect(() => { void loadKpi(); }, []);

  const [busyExport, setBusyExport] = useState(false);
  const manifest = async (d: Dossier) => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [['section', 'key', 'value'],
        ['dossier', 'id', d.id], ['dossier', 'title', d.title], ['dossier', 'category', d.cat],
        ['dossier', 'meta', d.meta], ['dossier', 'last_generated', d.gen], ['dossier', 'owner', d.owner],
        ['dossier', 'cadence', d.cadence], ['dossier', 'compliance', d.status]];
      await exportTableCsv(`${d.id}-manifest.csv`, table);
      push(true, 'Manifest dossier diunduh', `${d.id} · ekstrak lokal (tanpa replika).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const schedule = () => {
    setSchedTouched(true);
    if (!/.+@.+\..+/.test(schedMail.trim())) return;
    setScheduled((s) => [...s, `${schedRep} · ${schedCad} → ${schedMail.trim().toLowerCase()}`]);
    setSchedOpen(false);
    setSchedMail('');
    setSchedTouched(false);
    push(true, 'Pengingat dicatat (lokal saja)', `${schedRep} · ${schedCad} · email tidak dikirim — pengiriman tidak tersambung.`);
  };

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 864e5);
  const monthAgo = new Date(today.getTime() - 30 * 864e5);
  const rangeSql = range === '7 Hari Terakhir' ? `BETWEEN '${isoDay(weekAgo)}' AND '${isoDay(today)}'`
    : range === 'Rolling 30 Hari' ? `BETWEEN '${isoDay(monthAgo)}' AND '${isoDay(today)}'`
    : range === 'Kuartal 1 2026' ? `BETWEEN '2026-01-01' AND '2026-03-31'` : `BETWEEN '2026-01-01' AND '${isoDay(today)}'`;
  const sql = `SELECT ${DIM_SQL[DIMS.indexOf(dim as (typeof DIMS)[number])]}, ${mets.map((m) => METRICS.find((x) => x.n === m)?.sql).join(', ') || 'COUNT(*)'} FROM telemetry_mart WHERE facility_id = '${FAC_IDS[FACS.indexOf(fac as (typeof FACS)[number])]}' AND log_timestamp ${rangeSql}`;

  const runQuery = async () => {
    if (mets.length === 0) {
      push(false, 'Belum ada metrik dipilih', 'Pilih minimal satu metrik telemetri.');
      return;
    }
    setAggError(null);
    const t0 = performance.now();
    try {
      const aggData = await apiFetch<Aggregates>('/api/reports/aggregates');
      setAgg(aggData);
      setAggMs(Math.round(performance.now() - t0));
      setRan(true);
      const total = aggData.workOrders.total + aggData.assets.totalRegistered
        + aggData.inventory.totalSkus + aggData.serviceRequests.total;
      push(true, 'Query agregat dijalankan', `${total} record live · agregat server (database ini).`);
    } catch (e) {
      setAgg(null);
      setAggMs(null);
      const msg = e instanceof Error ? e.message : 'Query agregat gagal';
      setAggError(`${msg} — tidak menampilkan angka.`);
      push(false, 'Query agregat gagal', `${msg} — tidak ada angka ditampilkan.`);
    }
  };

  const dossierCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const live = agg
        ? `live · WO ${agg.workOrders.total} / aset ${agg.assets.totalRegistered} / SKU ${agg.inventory.totalSkus} / SR ${agg.serviceRequests.total}`
        : 'belum ada agregat live — jalankan query agregat dulu';
      const table: (string | number)[][] = [['section', 'key', 'value'],
        ['query', 'temporal_scope', range], ['query', 'facility', fac], ['query', 'dimension', dim],
        ['query', 'metrics', mets.join(' | ') || '(none)'], ['query', 'output', out],
        ['receipt', 'records', live], ['receipt', 'exec_ms', aggMs === null ? 'n/a' : String(aggMs)], ['receipt', 'engine', 'server aggregates (this database)']];
      await exportTableCsv('custom-query-dossier.csv', table);
      push(true, 'Dossier diunduh', `${out} · ${live} · manifest + receipt terlampir.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Hub Laporan &amp; Analitik</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="rep-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Agregat server · baca DB langsung · tanpa replika</p>
            <h1 id="rep-h" className="text-2xl font-semibold tracking-tight">Hub Laporan &amp; Analitik</h1>
            <p className="text-[13px] text-muted">Business intelligence operasional, akuntansi biaya, analisis telemetri MTTR, dan pembangun laporan kustom untuk operasi multi-fasilitas.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><CalendarClock size={16} /> Jadwalkan Dispatch Otomatis</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="sch-h">
                <DialogTitle id="sch-h">Jadwalkan Dispatch Otomatis</DialogTitle>
                <DialogDescription>Hanya pengingat lokal — pengiriman email tidak tersambung, tidak ada yang dikirim.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="sch-rep">Dossier</label>
                <select id="sch-rep" value={schedRep} onChange={(e) => setSchedRep(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                  {DOSSIERS.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.title}</option>)}
                </select>
                <label className="text-xs font-semibold" htmlFor="sch-cad">Irama</label>
                <select id="sch-cad" value={schedCad} onChange={(e) => setSchedCad(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                  {['Mingguan tiap Senin (06:00 UTC)', 'Otomatis Bulanan (tgl 1)', 'Siklus Shift Dua Mingguan', 'Audit Bulanan (tgl 15)'].map((c) => <option key={c}>{c}</option>)}
                </select>
                <label className="text-xs font-semibold" htmlFor="sch-mail">Email penerima</label>
                <Input id="sch-mail" value={schedMail} onChange={(e) => setSchedMail(e.target.value)} invalid={schedTouched && !/.+@.+\..+/.test(schedMail.trim())} placeholder="lead@apexops.io" />
                {schedTouched && !/.+@.+\..+/.test(schedMail.trim()) && <p className="text-[11px] font-semibold text-fail">Email penerima yang valid wajib diisi.</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setSchedOpen(false)}>Batal</Button>
                  <Button onClick={schedule}>Jadwalkan</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="secondary" onClick={() => { window.print(); push(true, 'Dialog cetak dibuka', 'Dialog cetak browser · grafik sesuai layar.'); }}>
              <Download size={16} /> Ekspor Dossier PDF Penuh
            </Button>
            <Button onClick={() => document.getElementById('query-builder')?.scrollIntoView({ behavior: 'smooth' })}>
              <Database size={16} /> Bangun Query Kustom (SQL/Visual)
            </Button>
          </div>
        </div>

        {/* GAP-14/F21: KPI cards are live server aggregates. The old static
            OPEX/MTTR/availability figures had no source — removed. Charts
            below remain design reference (labeled as such). */}
        <div className="flex items-center gap-2">
          <Badge variant={kpiLive ? 'pass' : 'warn'}>
            {kpiLoading ? 'Memuat agregat…' : kpiLive ? 'Live · agregat server' : 'Demo offline — server tidak terjangkau'}
          </Badge>
          <button type="button" onClick={() => void loadKpi()} disabled={kpiLoading} className="text-xs font-semibold text-cobalt hover:underline disabled:opacity-50">
            Muat Ulang KPI
          </button>
        </div>
        {!kpiLive && !kpiLoading && (
          <p className="rounded border border-warn bg-warn-bg text-warn-ink text-[13px] p-3" role="alert">
            Query agregat gagal — tidak menampilkan angka.
          </p>
        )}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Work Order Terbuka', v: kpi ? String(kpi.workOrders.open) : '—', s: kpi ? `${kpi.workOrders.total} total · ${kpi.workOrders.completed} selesai (live)` : 'tanpa data live' },
            { l: 'Aset Terdaftar', v: kpi ? String(kpi.assets.totalRegistered) : '—', s: kpi ? 'jumlah aset live (database ini)' : 'tanpa data live' },
            { l: 'Valuasi Inventaris', v: kpi ? `$${kpi.inventory.valuationUsd}` : '—', s: kpi ? `${kpi.inventory.totalSkus} SKU · ${kpi.inventory.lowStockSkus} stok rendah (live)` : 'tanpa data live' },
            { l: 'Service Request', v: kpi ? String(kpi.serviceRequests.total) : '—', s: kpi ? `${kpi.serviceRequests.converted} dikonversi (live)` : 'tanpa data live' },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">OPEX Bulanan vs Varians Budget <span className="text-xs font-normal text-muted">FY 2026 · referensi desain — angka arsip, bukan live</span></h2>
              <TrendingDown size={16} className="text-pass" />
            </div>
            <p className="text-xs text-muted -mt-1">Consolidated operating maintenance spend across Nusantara Tower campus</p>
            <div className="flex items-end gap-2 h-40 pt-4" role="img" aria-label="Batang OPEX bulanan Januari hingga Juni terhadap batas budget 305k">
              {MONTHS.map((m) => (
                <div key={m.m} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="apex-id text-[11px] font-bold">{m.m.startsWith('JUN') ? '~$290k' : `$${m.v}k`}</span>
                  <div className="w-full rounded-t bg-cobalt-deep/80" style={{ height: `${(m.v / 320) * 100}%`, opacity: m.m.startsWith('JUN') ? 0.45 : 1 }} />
                  <span className="text-[10px] font-bold text-muted">{m.m}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-cobalt-deep/80 inline-block" /> Belanja Aktual (OPEX)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-fail inline-block" /> Batas Budget Disetujui ($305rb/bln)</span>
            </div>
            <p className="text-[13px]">Aktual Mei $284rb vs Budget $305rb <strong className="text-pass">(-$21rb di bawah budget)</strong></p>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <h2 className="text-base font-semibold">Alokasi Biaya per Kategori <span className="text-xs font-normal text-muted">· referensi desain — angka arsip, bukan live</span></h2>
            <p className="text-xs text-muted -mt-1">Distribusi antar subsistem infrastruktur utama · Total Run Terlacak: 4.892 baris WO</p>
            {CATS.map((c) => (
              <div key={c.n} className="text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{c.n} <span className="font-normal text-muted text-xs">· {c.d}</span></span>
                  <strong className="apex-id whitespace-nowrap">{c.v} · {c.p.toFixed(1)}%</strong>
                </div>
                <div className="h-2.5 rounded bg-surface-subtle overflow-hidden mt-0.5" role="img" aria-label={`${c.n} ${c.p} persen`}>
                  <div className="h-full bg-cobalt-deep" style={{ width: `${c.p}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold flex items-center gap-2"><Activity size={16} /> Kecepatan Resolusi Insiden &amp; Kepatuhan SLA <span className="text-xs font-normal text-muted">· referensi desain — angka arsip, bukan live</span></h2>
            <Badge variant="pass">100% KEPATUHAN P1</Badge>
          </div>
          <p className="text-xs text-muted -mt-1">Tolok ukur respons dispatch real-time terhadap ambang severity fasilitas · Siklus Telemetri Sensor: 60 dtk</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
            {SLA.map((s) => (
              <div key={s.p} className="rounded border border-border-subtle bg-card p-3 flex flex-col gap-1">
                <p className="font-semibold">{s.p} <span className="text-xs font-normal text-muted">· SLA Maks {s.max}</span></p>
                <p><strong className="text-lg">{s.avg}</strong> <span className="text-muted text-xs">{s.buf} · {s.tgt}</span></p>
                <div className="h-2 rounded bg-surface-subtle overflow-hidden" role="img" aria-label={`${s.p} ${s.met}`}>
                  <div className={cn('h-full', s.pct >= 99 ? 'bg-pass' : 'bg-warn')} style={{ width: `${s.pct}%` }} />
                </div>
                <p className="text-xs font-bold text-pass">{s.met}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Laporan &amp; Dossier Operasional Standar <span className="text-xs font-normal text-muted">{filtered.length} Dossier Aktif · katalog referensi — hanya metadata, belum ada report engine</span></h2>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter klasifikasi laporan" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
              {['Semua Klasifikasi', 'Keuangan & OPEX', 'Teknik Keandalan', 'Operasi Workforce', 'Rantai Pasok'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted -mt-2">Ekspor kepatuhan regulasi, finansial, dan teknik otomatis</p>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-[13px] min-w-[900px]">
              <thead>
                <tr className="text-left text-muted border-b border-border-subtle bg-card">
                  <th className="p-2 font-semibold">ID &amp; Judul Laporan</th>
                  <th className="font-semibold">Kategori</th>
                  <th className="font-semibold">Terakhir Dibuat</th>
                  <th className="font-semibold">Irama / Cakupan</th>
                  <th className="font-semibold">Status Kepatuhan</th>
                  <th className="font-semibold">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-surface-subtle hover:bg-card">
                    <td className="p-2"><p className="apex-id font-bold text-cobalt">{d.id}</p><p className="font-medium">{d.title}</p><p className="text-xs text-muted">{d.meta}</p></td>
                    <td>{d.cat}</td>
                    <td><p>{d.gen}</p><p className="text-xs text-muted">{d.owner}</p></td>
                    <td className="text-xs">{d.cadence}</td>
                    <td><Badge variant="pass">{d.status}</Badge></td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => setPrev(d)}>Pratinjau</button>
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => manifest(d)}>Ekstrak</button>
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => { setSchedRep(d.id); setSchedOpen(true); }}>Jadwalkan</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Dispatch terjadwal: {scheduled.join(' · ')}</p>
        </div>

        <div id="query-builder" className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Query Analitik Kustom &amp; Pembangun Laporan</h2>
            <Badge variant="info">AGREGAT SERVER</Badge>
          </div>
          <p className="text-[13px] text-muted -mt-2">Susun query multidimensi dengan irisan field granular · Run mengeksekusi query agregat server live</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold" htmlFor="qb-range">1. Cakupan / Rentang Waktu</label>
              <select id="qb-range" value={range} onChange={(e) => { setRange(e.target.value); setRan(false); }} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {RANGES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold" htmlFor="qb-fac">2. Cakupan Fasilitas <span className="font-normal text-muted">· 412 Aset · 28 Zona Termasuk</span></label>
              <select id="qb-fac" value={fac} onChange={(e) => { setFac(e.target.value); setRan(false); }} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {FACS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-semibold" htmlFor="qb-dim">3. Dimensi Agregasi Primer <span className="font-normal text-muted">· Hirarki: Kategori &gt; Subkategori &gt; Tag</span></label>
              <select id="qb-dim" value={dim} onChange={(e) => { setDim(e.target.value); setRan(false); }} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {DIMS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold">4. Metrik Telemetri yang Disertakan</legend>
              <div className="flex flex-wrap gap-3 mt-1">
                {METRICS.map((m) => (
                  <label key={m.n} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={mets.includes(m.n)} onChange={() => { setMets((x) => (x.includes(m.n) ? x.filter((y) => y !== m.n) : [...x, m.n])); setRan(false); }} className="w-4 h-4 accent-[#1E40AF]" />
                    {m.n}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold">Output Format</legend>
            <div className="flex flex-wrap gap-2 mt-1" role="radiogroup" aria-label="Format output">
              {OUTPUTS.map((o) => (
                <button key={o} type="button" onClick={() => setOut(o)} aria-pressed={out === o} className={cn('h-8 px-3 rounded text-xs font-semibold border', out === o ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                  {o}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="text-[11px] text-muted">Builder preview (local only — Run executes the server aggregate query, not this SQL):</p>
          <pre className="rounded border border-border-subtle bg-card p-2 text-[11px] apex-id overflow-x-auto" aria-label="SQL ter-generate (pratinjau desain lokal — tidak dieksekusi)">{sql}</pre>
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="secondary" onClick={() => void runQuery()}><Play size={15} /> Jalankan Query Agregat (live)</Button>
            <Button onClick={dossierCsv} disabled={busyExport}><FileText size={15} /> Buat &amp; Unduh Dossier</Button>
            {aggError && <span className="text-[13px] font-semibold text-fail" role="alert">{aggError}</span>}
            {ran && agg && aggMs !== null && (
              <span className="text-[13px] font-semibold text-pass" role="status">
                Agregat live dalam {aggMs}ms · WO {agg.workOrders.total} (terbuka {agg.workOrders.open})
                {' '}· assets {agg.assets.totalRegistered} · SKUs {agg.inventory.totalSkus} (low {agg.inventory.lowStockSkus})
                {' '}· valuation ${agg.inventory.valuationUsd} · SR {agg.serviceRequests.total} (converted {agg.serviceRequests.converted})
              </span>
            )}
          </div>
        </div>
      </section>

      <Dialog open={prev !== null} onOpenChange={(v) => { if (!v) setPrev(null); }}>
        <DialogContent aria-labelledby="prev-h">
          {prev && (
            <>
              <DialogTitle id="prev-h">{prev.id}</DialogTitle>
              <DialogDescription>{prev.title}</DialogDescription>
              <ul className="text-[13px] flex flex-col gap-1">
                <li><strong>Kategori:</strong> {prev.cat}</li>
                <li><strong>Cakupan:</strong> {prev.meta}</li>
                <li><strong>Dibuat:</strong> {prev.gen} · {prev.owner}</li>
                <li><strong>Irama:</strong> {prev.cadence}</li>
                <li><strong>Status:</strong> {prev.status}</li>
              </ul>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setPrev(null)}>Tutup</Button>
                <Button onClick={() => { if (prev) manifest(prev); }} disabled={busyExport}><Eye size={15} /> Unduh Ekstrak</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
