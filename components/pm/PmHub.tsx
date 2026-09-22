'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, FlaskConical, Pause, Play, Plus, X, XCircle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Plan {
  id: string; name: string; asset: string; zone: string; cadence: string;
  trigger: string; last: string; lastWo: string; next: string; state: string; cat: string;
}

const SEED: Plan[] = [
  { id: 'PM-PLN-0082', name: 'Overhaul Elevator & Uji Rem Bulanan', asset: 'AST-ELEV-02', zone: 'Poros Timur (L1-42)', cadence: 'Tiap 30 Hari', trigger: 'Interval Fleksibel', last: '12 Jan 2025', lastWo: 'WO-2025-0144', next: 'Terlambat 3 hari', state: 'OVERDUE', cat: 'Elevators' },
  { id: 'PM-PLN-0056', name: 'Uji Beban Genset Diesel Dwimingguan', asset: 'AST-GEN-001', zone: 'Ruang Bawah B2', cadence: 'Tiap 14 Hari', trigger: 'Kalender (Tetap)', last: '01 Feb 2025', lastWo: 'WO-2025-0421', next: 'Hari ini 17:00 · window Shift B', state: 'DUE SOON', cat: 'Generators' },
  { id: 'PM-PLN-0104', name: 'Overhaul Loop Chiller & Kompresor Triwulanan', asset: 'AST-HVAC-004', zone: 'Utilitas Sentral · Basemen L2', cadence: '90 hari / 5.000 jam', trigger: 'Hibrida Ganda', last: '14 Nov 2024', lastWo: 'WO-2024-8902', next: '2 Hari Lagi · sisa 188 jam jalan', state: 'READY', cat: 'HVAC & Chiller' },
  { id: 'PM-PLN-0112', name: 'Audit Filter HEPA Cleanroom Semesteran', asset: 'AST-ENV-108', zone: 'Lab Bersih Annex 4', cadence: 'Tiap 180 Hari', trigger: 'Calendar (Fixed)', last: '28 Aug 2024', lastWo: 'WO-2024-6101', next: '12 Hari Lagi', state: 'SCHEDULED', cat: 'Life Safety' },
  { id: 'PM-PLN-0041', name: 'Sampling Oli Dielektrik Trafo Tahunan', asset: 'AST-ELEC-01', zone: 'Gardu Utara', cadence: 'Tiap 365 Hari', trigger: 'Calendar (Fixed)', last: '19 Mar 2024', lastWo: 'WO-2024-2209', next: '32 Hari Lagi', state: 'SCHEDULED', cat: 'Generators' },
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
  if (r.status === 'PAUSED') return { text: `Jeda · jatuh tempo ${fmtDate(r.nextDueAt)}`, state: 'PAUSED' };
  if (r.isOverdue) return { text: `TERLAMBAT · jatuh tempo ${fmtDate(r.nextDueAt)}`, state: 'OVERDUE' };
  if (new Date(r.nextDueAt).getTime() - Date.now() <= DUE_SOON_MS) {
    return { text: `Segera jatuh tempo · ${fmtDate(r.nextDueAt)}`, state: 'DUE SOON' };
  }
  return { text: fmtDate(r.nextDueAt), state: 'READY' };
}

export function PmHub() {
  const [rules, setRules] = useState<ServerRule[] | null>(null);
  const [dirState, setDirState] = useState<'loading' | 'live' | 'demo'>('loading');
  const [dirError, setDirError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('Semua');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [dispatching, setDispatching] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [npName, setNpName] = useState('');
  const [npAsset, setNpAsset] = useState<string>('AST-HVAC-004');
  const [npDays, setNpDays] = useState('90');
  const [npTouched, setNpTouched] = useState(false);

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-2), { id, ok, title, msg }]);
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
    toastTimers.current.push(timer);
  };

  useEffect(() => () => {
    toastTimers.current.forEach((t) => window.clearTimeout(t));
    toastTimers.current = [];
  }, []);

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
        if (filter === 'Terlambat' && !r.isOverdue) return false;
        if (filter === 'Jatuh tempo' && !dueSoon(r)) return false;
        if (filter === 'Jeda' && r.status !== 'PAUSED') return false;
        if (filter === 'Aktif' && r.status !== 'ACTIVE') return false;
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
      push(true, 'Plan PM dibuat', `${rule.id} · siklus pertama jatuh tempo ${fmtDate(rule.nextDueAt)} · tersimpan via /api/preventive-maintenance.`);
    } catch (err) {
      push(false, 'Gagal membuat', err instanceof ApiError ? `${err.code} — server menolak plan.` : 'Gangguan jaringan — server tidak terjangkau.');
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
      push(false, `Gagal generate (${ruleId})`, err instanceof ApiError ? `${err.code} — server menolak generate.` : 'Gangguan jaringan — server tidak terjangkau.');
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
    push(true, 'Dispatch dimulai', `Membuat ${pending.length} work order via /api/preventive-maintenance…`);
    let ok = 0;
    for (const r of pending) {
      const wo = await generateOne(r.id);
      if (wo) ok++;
    }
    setDispatching(false);
    push(ok === pending.length, 'Batch selesai', `${ok}/${pending.length} WO dibuat dari rule server${ok < pending.length ? ' — lihat error di atas.' : '.'}`);
  };

  const toggleRule = async (rule: ServerRule) => {
    const target = rule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await apiFetch<ServerRule>(`/api/preventive-maintenance/${encodeURIComponent(rule.id)}/toggle`, {
        method: 'POST',
        body: { status: target },
      });
      await refresh();
      push(true, target === 'PAUSED' ? 'Rule dijeda' : 'Rule dilanjutkan', `${rule.id} → ${target} · tersimpan.`);
    } catch (err) {
      push(false, 'Gagal toggle', err instanceof ApiError ? `${err.code} — server menolak.` : 'Gangguan jaringan — server tidak terjangkau.');
    }
  };

  const kpis = live && rules ? [
    { l: 'Total Rule PM', v: String(rules.length), s: 'jumlah server live' },
    { l: 'Rule Aktif', v: String(rules.filter((r) => r.status === 'ACTIVE').length), s: 'jumlah server live' },
    { l: 'Terlambat', v: String(rules.filter((r) => r.isOverdue && r.status === 'ACTIVE').length), s: 'jumlah server live' },
    { l: 'Jatuh tempo ≤ 14 hari', v: String(rules.filter((r) => dueSoon(r)).length), s: 'jumlah server live' },
    { l: 'Mode Dispatch', v: 'MANUAL', s: 'Generate dari antrean di bawah · tanpa mesin otomatis' },
  ] : [
    { l: 'Total Plan PM Aktif', v: '38 (demo)', s: 'data demo — server tidak terjangkau' },
    { l: 'Kepatuhan PM', v: '96,4% (demo)', s: 'data demo — server tidak terjangkau' },
    { l: 'Siklus Mendatang (14 hari)', v: '19 (demo)', s: 'data demo — server tidak terjangkau' },
    { l: 'Terlambat / SLA', v: '03 (demo)', s: 'data demo — server tidak terjangkau' },
    { l: 'Dispatch Mode', v: 'MANUAL', s: 'Generate from the queue below · no auto-engine' },
  ];

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">PM &amp; Otomasi</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="pm-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Operasi · <Badge variant="pass">SYS-RUNNING</Badge>{' '}
              <Badge variant={live ? 'pass' : 'warn'}>{live ? 'Rule live' : dirState === 'loading' ? 'Memuat…' : 'Demo offline'}</Badge>
            </p>
            <h1 id="pm-h" className="text-2xl font-semibold tracking-tight">Penjadwalan Preventive Maintenance &amp; Otomasi</h1>
            <p className="text-[13px] text-muted">Jadwal kalender berulang dengan rule tersimpan di server dan generate WO manual.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/shifts/plan"><Button variant="secondary"><CalendarDays size={16} /> Kalender Shift</Button></Link>
            <Button
              variant="secondary"
              disabled={!live}
              title={live ? 'Gulir ke antrean generate' : 'Server tidak terjangkau — mode demo'}
              onClick={() => {
                document.getElementById('dispatch-queue')?.scrollIntoView({ behavior: 'smooth' });
                push(true, 'Antrean siap', `${queue.filter((r) => !generated[r.id]).length} plan menunggu eksekusi di bawah.`);
              }}
            >
              <Zap size={16} /> Generate Work Order · {live ? queue.filter((r) => !generated[r.id]).length : '—'} Siap
            </Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!live} title={live ? 'Buat rule PM baru' : 'Server tidak terjangkau — mode demo'}><Plus size={16} /> Definisi Plan PM Baru</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="np-h">
                <DialogTitle id="np-h">Definisi Plan PM Baru</DialogTitle>
                <DialogDescription>Membuat rule kalender via POST /api/preventive-maintenance.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="np-name">Nama plan (wajib)</label>
                <Input id="np-name" value={npName} onChange={(e) => setNpName(e.target.value)} invalid={npTouched && !npName.trim()} placeholder="mis. Descale Cooling Tower Bulanan" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-asset">Aset target</label>
                    <Input id="np-asset" value={npAsset} onChange={(e) => setNpAsset(e.target.value.toUpperCase())} invalid={npTouched && !/^AST-[A-Z]+-\d{3}$/.test(npAsset.trim())} className="apex-id" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="np-days">Irama (hari)</label>
                    <Input id="np-days" inputMode="numeric" value={npDays} onChange={(e) => setNpDays(e.target.value)} invalid={npTouched && !(parseInt(npDays, 10) >= 1)} />
                  </div>
                </div>
                {npTouched && (!npName.trim() || !/^AST-[A-Z]+-\d{3}$/.test(npAsset.trim()) || !(parseInt(npDays, 10) >= 1)) && (
                  <p className="text-[11px] font-semibold text-fail">Nama + aset AST-XXX-000 + irama ≥ 1 hari wajib diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Batal</Button>
                  <Button onClick={() => void createPlan()}>Buat Rule</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        {dirState === 'demo' && (
          <p className="rounded-lg border border-warn bg-warn-bg/40 p-3 text-[13px]" role="alert">
            Server tidak terjangkau ({dirError}) — menampilkan data demo. Buat, generate, dan jeda nonaktif sampai server merespons.
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
            <h2 className="text-base font-semibold">Model Pemicu — <span className="apex-id">PM-PLN-0104</span></h2>
            <Badge variant="hold">REFERENSI DESAIN · DEMO LOKAL</Badge>
          </div>
          <p className="text-xs text-muted -mt-2">Cara kerja rule kalender di server (intervalDays → nextDueAt). Nilai meter/SCADA di bawah hanya ilustrasi — konsol ini tidak punya link Modbus live.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Komponen Irama Waktu · Rule Server</p>
              <p className="font-semibold">Tiap N hari kalender (intervalDays)</p>
              <p className="text-muted">Server menghitung nextDueAt = last + interval; terlambat bila now &gt; nextDueAt. Jeda via toggle di tabel.</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Komponen Meter · Tidak Tersambung</p>
              <p className="font-semibold">Pemicu jam operasi direncanakan, belum disambung</p>
              <p className="text-muted">Tidak ada link Modbus/SCADA dari konsol ini (demo lokal). Ingest telemetri hanya ada di sisi server.</p>
            </div>
            <div className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1">
              <p className="apex-label-caps text-muted">Generate · Manual + Idempoten</p>
              <p className="apex-id">POST /api/preventive-maintenance/[id]/generate</p>
              <p className="text-muted">Membuat WO SCHEDULED bernomor dari sequence WO; aman di-retry dengan Idempotency-Key sama.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rule berdasarkan ID, judul, aset…" aria-label="Filter rule" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rule">
          {['Semua', 'Aktif', 'Terlambat', 'Jatuh tempo', 'Jeda'].map((c) => (
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
                <th className="p-2 font-semibold">ID Rule &amp; Judul</th>
                <th className="font-semibold">Aset Target</th>
                <th className="font-semibold">Irama</th>
                <th className="font-semibold">Tipe Pemicu</th>
                <th className="font-semibold">Terakhir Dibuat</th>
                <th className="font-semibold">Jatuh Tempo</th>
                <th className="font-semibold">Kesehatan</th>
                <th className="font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rule = live && rules ? rules.find((r) => r.id === p.id) : undefined;
                return (
                  <tr key={p.id} className="border-b border-surface-subtle hover:bg-surface">
                    <td className="p-2"><p className="apex-id font-bold text-cobalt">{p.id}</p><p>{p.name}</p></td>
                    <td>
                      {p.asset === 'AST-HVAC-004' ? (
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
                          <Button variant="secondary" disabled={!live} title={rule.status === 'ACTIVE' ? 'Jeda rule ini' : 'Lanjutkan rule ini'} onClick={() => void toggleRule(rule)}>
                            {rule.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
                          </Button>
                          <Button variant="secondary" disabled={!live || rule.status !== 'ACTIVE'} title="Generate work order dari rule ini sekarang" onClick={() => void generateOne(rule.id)}>
                            <Zap size={14} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">demo — tanpa aksi</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">{live ? 'Tidak ada rule yang cocok — ubah filter.' : 'Tidak ada data demo yang cocok — ubah filter.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">Menampilkan {filtered.length} dari {live && rules ? rules.length : SEED.length} rule {live ? 'server live' : 'demo'}.</p>

        <div id="dispatch-queue" className="rounded-lg border-2 border-warn bg-warn-bg/40 p-4 flex flex-col gap-3 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Antrean Dispatch Generate</h2>
            <span className="text-xs text-muted">{live ? `Antrean dari rule server: ${queue.length} plan terlambat/segera jatuh tempo.` : 'Server tidak terjangkau — antrean demo tanpa aksi.'}</span>
          </div>
          {live ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {queue.map((r) => (
                <li key={r.id} className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="apex-id font-bold">{r.id}</span>
                    {generated[r.id]
                      ? <Badge variant="pass">TERBUAT → {generated[r.id]}</Badge>
                      : <Badge variant={r.isOverdue ? 'fail' : 'warn'}>{r.isOverdue ? 'TERLAMBAT' : 'SEGERA'}</Badge>}
                  </div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-muted text-xs">Aset: <span className="apex-id">{r.assetCode}</span> · tiap {r.intervalDays} hari · {r.priority}</p>
                  {!generated[r.id] && (
                    <div><Button variant="secondary" disabled={dispatching} onClick={() => void generateOne(r.id)}><Zap size={14} /> Generate WO</Button></div>
                  )}
                </li>
              ))}
              {queue.length === 0 && (
                <li className="rounded-lg border border-border-subtle bg-card p-3 text-[13px] text-muted">Antrean kosong — tidak ada rule aktif yang terlambat atau jatuh tempo dalam 14 hari.</li>
              )}
            </ul>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SEED.slice(0, 4).map((i) => (
                <li key={i.id} className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="apex-id font-bold">{i.id}</span>
                    <Badge variant="hold">DEMO · TANPA AKSI</Badge>
                  </div>
                  <p className="font-semibold">{i.name}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void executeBatch()} disabled={dispatching || !live} title={live ? 'Generate WO untuk semua rule antre' : 'Server tidak terjangkau — mode demo'}>
              <Zap size={16} /> {dispatching ? 'Membuat…' : `Eksekusi Batch Dispatch (${live ? queue.filter((r) => !generated[r.id]).length : 0} WO)`}
            </Button>
            <Button variant="secondary" onClick={() => setSimOpen((s) => !s)}>
              <FlaskConical size={16} /> Simulasi Generate
            </Button>
          </div>
          {simOpen && (
            <div className="rounded-lg border border-border-subtle bg-card p-3 text-[13px]" role="status">
              <p className="font-semibold">Simulasi — estimasi dry run (lokal, tanpa call server)</p>
              <ul className="text-muted">
                {(live ? queue : []).map((r) => <li key={r.id}>· {r.id}: {r.title} · every {r.intervalDays}d</li>)}
              </ul>
              <p className="text-muted">Tidak ada yang didispatch — dry run saja.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Penyeimbang Beban Shift (14 hari) <span className="text-xs font-normal text-muted">Nusantara East Wing</span></h2>
              <Badge variant="hold">DEMO LOKAL</Badge>
            </div>
            <p className="text-xs text-muted">Sketsa kapasitas ilustratif — tidak dihitung dari data dispatch.</p>
            <Link className="text-cobalt font-semibold hover:underline text-[13px]" href="/shifts/plan">Plan Shift →</Link>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Outlook Dispatch 30 Hari</h2>
              <Badge variant={live ? 'pass' : 'hold'}>{live ? 'RULE LIVE' : 'DEMO'}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Siap sekarang</p><p className="text-lg font-bold">{live && rules ? `${queue.length} rule` : '4 plan (demo)'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Jeda</p><p className="text-lg font-bold">{live && rules ? String(rules.filter((r) => r.status === 'PAUSED').length) : '—'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Terlambat</p><p className="text-lg font-bold text-fail">{live && rules ? String(rules.filter((r) => r.isOverdue && r.status === 'ACTIVE').length) : '03 (demo)'}</p></div>
              <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Terbuat sesi ini</p><p className="text-lg font-bold text-pass">{Object.keys(generated).length}</p></div>
            </div>
            <div className="rounded border border-border-subtle bg-card p-2 text-[13px]">
              <p className="font-semibold">Koneksi Modbus SCADA <Badge variant="hold">TIDAK TERSAMBUNG</Badge></p>
              <p className="text-muted">Tidak ada link meter live dari konsol ini (demo lokal). Ingest telemetri hanya ada di sisi server.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Tutup notifikasi" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
