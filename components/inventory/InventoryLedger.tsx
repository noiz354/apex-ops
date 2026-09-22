'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, PackagePlus, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { useWindow } from '@/lib/ui/useWindow';
import { ApiError, apiFetch } from '@/lib/api/client';

interface Sku {
  id: string; cat: string; name: string; spec: string; bin: string; hub: string;
  on: number; reserved: number | null; avail: number | null; min: number;
  status: string; level: 'critical' | 'rop' | 'optimal';
}

const SEED: Sku[] = [
  { id: CANON.sealSku, cat: 'HVAC Mechanical', name: 'Silicon Carbide Shaft Seal 2.5"', spec: 'Trane EarthWise CVHE Kit • OEM #4920-11', bin: CANON.sealBin, hub: 'Central Crib - Bldg B', on: 2, reserved: 1, avail: 1, min: 4, status: 'CRITICAL (1/4)', level: 'critical' },
  { id: 'PART-LUB-09', cat: 'Lubricants & Fluids', name: 'Synthetic POE Refrigerant Lubricant ISO 68', spec: '5 Gal Pail • Mobil EAL Arctic Series', bin: 'CRIB-CHEM / Rack 02', hub: 'Central Crib - Bldg B', on: 6, reserved: 2, avail: 4, min: 5, status: 'BELOW ROP (4/5)', level: 'rop' },
  { id: 'PART-FLTR-401', cat: 'Filters & Consumables', name: 'MERV 14 Chilled Air Filter Cartridge', spec: '24x24x2 Pleated High Efficiency Camfil', bin: 'SUB-LCK-4B / Bay 01', hub: 'Substation Locker 4B', on: 48, reserved: 4, avail: 44, min: 12, status: 'OPTIMAL', level: 'optimal' },
  { id: 'PART-BRG-6205', cat: 'HVAC Mechanical', name: 'Deep Groove SKF Ceramic Ball Bearing', spec: '25x52x15mm Hybrid Insulated • SKF Explorer', bin: 'CRIB-B / Shelf A-12', hub: 'Central Crib - Bldg B', on: 18, reserved: 0, avail: 18, min: 6, status: 'OPTIMAL', level: 'optimal' },
  { id: 'PART-VALV-GT2', cat: 'Filters & Consumables', name: '2-Inch High Pressure Bronze Gate Valve', spec: 'Threaded 300 WOG • Nibco Class 150', bin: 'CRIB-PIPE / Bin 08', hub: 'Central Crib - Bldg B', on: 2, reserved: null, avail: null, min: 10, status: 'BELOW ROP', level: 'rop' },
  { id: 'PART-FUSE-600V', cat: 'Electrical & Switchgear', name: '600V Fast-Acting Class J Fuse 30A', spec: 'Bussmann LPJ-30SP Dual-Element Time Delay', bin: 'ELEC-VAULT / Drw 03', hub: 'Central Crib - Bldg B', on: 3, reserved: 2, avail: 1, min: 10, status: 'CRITICAL (1/10)', level: 'critical' },
];

const CATS = ['Semua Kategori', 'HVAC Mechanical', 'Electrical & Switchgear', 'Lubricants & Fluids', 'Filters & Consumables'] as const;
const CAT_COUNT_DEMO: Record<string, string> = { 'Semua Kategori': '4,218', 'HVAC Mechanical': '842', 'Electrical & Switchgear': '612', 'Lubricants & Fluids': '248', 'Filters & Consumables': '1,150' };
const HUBS = ['Semua Gudang (Konsolidasi)', 'Central Crib - Bldg B', 'Substation Locker 4B', 'Cleanroom Cage C-04'] as const;
const LEVELS = ['Semua Level Stok', 'Stok Kritis (< Safety)', 'Di Bawah ROP', 'Optimal / Cukup'] as const;

type MovKind = 'IN' | 'OUT' | 'ADJ' | 'TRF';
interface Mov { kind: MovKind; delta: string; doc: string; ts: string; part: string; detail: string }

const MOV_SEED: Mov[] = [
  { kind: 'OUT', delta: '−1 ea', doc: CANON.workOrderSeal, ts: 'Today 14:32 UTC', part: `${CANON.sealSku} (Mechanical Shaft Seal)`, detail: `AST-HVAC-004 · ${CANON.sealBin} · dispatched to M. Kowalski (Lead Tech) · auth:mvance` },
  { kind: 'IN', delta: '+2 ea', doc: `${CANON.purchaseOrder} · GRN Rec`, ts: 'Today 11:15 UTC', part: `${CANON.sealSku} (Mechanical Shaft Seal Kit)`, detail: 'Trane Supply Co · dock bay-02 · barcode verified' },
  { kind: 'OUT', delta: '−2 pails', doc: `${CANON.pmPlan} · Quarterly PM`, ts: 'Yest 16:40 UTC', part: 'PART-LUB-09 (Synthetic POE ISO 68)', detail: 'CRIB-CHEM · recipient HVAC Shift Team A · ref:PM-Q1' },
];

const MOV_TABS = ['Semua', 'Penerimaan', 'WO Keluar', 'Penyesuaian', 'Transfer'] as const;

const REASONS = [
  'Transfer ke Sub-Gudang (Stage Lapangan)',
  'Scrap / Write-Off Rusak Cacat',
  'Penyesuaian Selisih Opname Fisik',
  'Alokasi Pinjam & Kembali Darurat',
] as const;

const DESTS = ['Substation Locker 4B (Bldg B - L1)', 'Mobile Van 03 - Field Service', 'Quarantine Holding Bay'] as const;


interface PartLive {
  sku: string; name: string; unitPriceCents: number; bin: string;
  onHand: number; reserved: number; available: number; minStock: number;
}

interface DisplaySku extends Sku { cataloged: boolean }

const CODE_RE = /^\d{6}$/;

function deriveStatus(avail: number, min: number): { status: string; level: 'critical' | 'rop' | 'optimal' } {
  if (avail <= 0) return { status: 'OUT OF STOCK', level: 'critical' };
  if (avail < min) return { status: `CRITICAL (${avail}/${min})`, level: 'critical' };
  if (avail < min * 2) return { status: `BELOW ROP (${avail}/${min})`, level: 'rop' };
  return { status: 'OPTIMAL', level: 'optimal' };
}

const fmtTs = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

export function InventoryLedger() {
  const [liveQty, setLiveQty] = useState<Record<string, PartLive>>({});
  const [live, setLive] = useState<boolean | null>(null);
  const [canMutate, setCanMutate] = useState(false);
  const [movServer, setMovServer] = useState<Mov[]>([]);
  const [movLive, setMovLive] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Semua Kategori');
  const [hub, setHub] = useState<string>('Semua Gudang (Konsolidasi)');
  const [level, setLevel] = useState<string>('Semua Level Stok');
  const [mtab, setMtab] = useState<string>('Semua');
  const { toasts, push, dismiss } = useToasts(8000);
  const [note, setNote] = useState<Record<string, string>>({});
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvPo, setRecvPo] = useState('');
  const [recvSku, setRecvSku] = useState<string>(CANON.sealSku);
  const [recvQty, setRecvQty] = useState('2');
  const [recvCode, setRecvCode] = useState('');
  const [recvTouched, setRecvTouched] = useState(false);
  const [posting, setPosting] = useState(false);
  const [focus, setFocus] = useState<string>(CANON.sealSku);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [dest, setDest] = useState<string>(DESTS[0]);
  const [qty, setQty] = useState('1');
  const [woRef, setWoRef] = useState<string>(CANON.workOrderSeal);
  const [code, setCode] = useState('');
  const [mutTouched, setMutTouched] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [issueCode, setIssueCode] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hot = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', hot);
    return () => document.removeEventListener('keydown', hot);
  }, []);



  const errMsg = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — tidak ada yang dikirim.');

  const refresh = async () => {
    try {
      const parts = await apiFetch<{ rows: PartLive[]; can: { mutate: boolean } }>('/api/parts');
      const map: Record<string, PartLive> = {};
      for (const p of parts.rows) map[p.sku] = p;
      setLiveQty(map);
      setLive(true);
      setCanMutate(parts.can.mutate);
    } catch {
      setLive(false);
    }
    try {
      const feed = await apiFetch<{ movements: Mov[] }>('/api/parts/movements?limit=50');
      setMovServer(feed.movements);
      setMovLive(true);
    } catch {
      setMovLive(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const display: DisplaySku[] = (() => {
    const merged = SEED.map((s) => {
      const p = liveQty[s.id];
      if (!p || live !== true) return { ...s, cataloged: live !== true ? true : false };
      const avail = p.available;
      const { status, level } = deriveStatus(avail, p.minStock);
      return { ...s, name: p.name, bin: p.bin, on: p.onHand, reserved: p.reserved, avail, min: p.minStock, status, level, cataloged: true };
    });
    if (live === true) {
      for (const p of Object.values(liveQty)) {
        if (SEED.some((s) => s.id === p.sku)) continue;
        const { status, level } = deriveStatus(p.available, p.minStock);
        merged.push({
          id: p.sku, cat: 'Unclassified', name: p.name, spec: 'System catalog row (no display metadata)',
          bin: p.bin, hub: 'System catalog', on: p.onHand, reserved: p.reserved, avail: p.available,
          min: p.minStock, status, level, cataloged: true,
        });
      }
    }
    return merged;
  })();

  const catalogedIds = useMemo(() => display.filter((r) => r.cataloged).map((r) => r.id), [display]);

  const filtered = useMemo(() => display.filter((r) => {
    if (cat !== 'Semua Kategori' && r.cat !== cat) return false;
    if (hub !== 'Semua Gudang (Konsolidasi)' && r.hub !== hub) return false;
    if (level === 'Stok Kritis (< Safety)' && r.level !== 'critical') return false;
    if (level === 'Di Bawah ROP' && r.level !== 'rop') return false;
    if (level === 'Optimal / Cukup' && r.level !== 'optimal') return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.id} ${r.name} ${r.spec} ${r.bin}`.toLowerCase().includes(needle);
  }),
  [display, cat, hub, level, q]);

  const feed: Mov[] = movLive ? movServer : MOV_SEED;
  const movFiltered = useMemo(() => feed.filter((m) =>
    mtab === 'Semua' || (mtab === 'Penerimaan' && m.kind === 'IN') || (mtab === 'WO Keluar' && m.kind === 'OUT') ||
    (mtab === 'Penyesuaian' && m.kind === 'ADJ') || (mtab === 'Transfer' && m.kind === 'TRF')
  ), [feed, mtab]);
  const tabCount = (t: string) => t === 'Semua'
    ? feed.length
    : feed.filter((m) => (t === 'Penerimaan' && m.kind === 'IN') || (t === 'WO Keluar' && m.kind === 'OUT') ||
      (t === 'Penyesuaian' && m.kind === 'ADJ') || (t === 'Transfer' && m.kind === 'TRF')).length;

  const movWin = useWindow(movFiltered, { rowHeight: 76, threshold: 60, initialHeight: 480 });

  const kpis = live === true ? (() => {
    const vals = Object.values(liveQty);
    const valuation = vals.reduce((s, p) => s + (p.onHand * p.unitPriceCents) / 100, 0);
    const low = vals.filter((p) => p.available < p.minStock).length;
    return [
      { l: 'Valuasi Katalog (dimuat)', v: `$${valuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, s: `FIFO · ${vals.length} SKU dimuat dari server` },
      { l: 'Kesehatan Ketersediaan Stok', v: low === 0 ? '100%' : `${(((vals.length - low) / Math.max(vals.length, 1)) * 100).toFixed(1)}%`, s: `${low} SKU di bawah minimum (halaman dimuat)` },
      { l: 'Pemicu Stok Rendah & Reorder', v: `${low} SKU`, s: 'Di bawah minimum di halaman dimuat' },
      { l: 'Mutasi Stok Bulanan', v: `${feed.length}`, s: 'Feed audit server (50 event terakhir)' },
    ];
  })() : [
    { l: 'Valuasi Katalog', v: '$1,428,650.00', s: 'FIFO · 4.218 SKU · +4,8% kuartal ini (demo)' },
    { l: 'Stock Availability Health', v: '94.2%', s: 'Operasional · 38 kritis direservasi WO (demo)' },
    { l: 'Pemicu Stok Rendah & Reorder', v: '7 draft PO', s: 'Otomatis antre · 2 kilat in-transit (demo)' },
    { l: 'Mutasi Stok Bulanan', v: '1,840', s: '+1.240 masuk · −560 keluar · 40 trf · velositas 3,8x (demo)' },
  ];

  const catCount = (c: string) => {
    if (live !== true) return CAT_COUNT_DEMO[c];
    if (c === 'Semua Kategori') return String(display.length);
    return String(display.filter((r) => r.cat === c).length);
  };

  const [busyExport, setBusyExport] = useState(false);
  const exportCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [
        ['sku', 'category', 'name', 'bin', 'hub', 'on_hand', 'reserved', 'available', 'min_rop', 'status'],
        ...filtered.map((r) => [r.id, r.cat, r.name, r.bin, r.hub, r.on, r.reserved ?? '', r.avail ?? '', r.min, r.status]),
      ];
      await exportTableCsv('spare-parts-ledger.csv', table);
      push(true, 'Ledger diekspor', `${filtered.length} baris tampil → spare-parts-ledger.csv${live === true ? ' (data server live)' : ' (data demo — server tidak terjangkau)'}.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const reorder = (id: string, kind: 'PR' | 'PO') => {
    const ref = kind === 'PR' ? 'PR-2026-0316' : 'PO-2026-0316';
    setNote((n) => ({ ...n, [id]: `${ref} dibuat` }));
    push(true, kind === 'PR' ? 'PR dibuat' : 'PO cepat dibuat', `${ref} · ${id} → antrean purchasing.`);
  };

  const postStock = (body: Record<string, unknown>) =>
    apiFetch<PartLive>('/api/parts/movements', { method: 'POST', body });

  const receive = async () => {
    setRecvTouched(true);
    if (live !== true) {
      push(false, 'Penerimaan tidak tersedia', 'Server tidak terjangkau — penerimaan dimatikan di mode demo.');
      return;
    }
    const n = parseInt(recvQty, 10);
    if (!/^PO-\d{4}-\d{4}$/.test(recvPo.trim()) || !Number.isFinite(n) || n < 1 || !CODE_RE.test(recvCode.trim())) return;
    setPosting(true);
    try {
      const updated = await postStock({
        sku: recvSku, type: 'RECEIVE', qty: n,
        refNumber: recvPo.trim(), reason: 'PO goods receipt · Dock Bay 02',
        stepUpCode: recvCode.trim(),
      });
      await refresh();
      setRecvOpen(false);
      setRecvPo('');
      setRecvCode('');
      setRecvTouched(false);
      push(true, 'Stok diterima', `${recvSku} +${n} · ${recvPo.trim()} · stok server kini ${updated.onHand}.`);
    } catch (e) {
      push(false, 'Receipt rejected', errMsg(e));
    } finally {
      setPosting(false);
    }
  };

  const focusRow = display.find((r) => r.id === focus) ?? display[0];
  const focusLive = liveQty[focus];
  const qn = parseInt(qty, 10);
  const mutOk =
    live === true && canMutate && !!focusLive &&
    Number.isFinite(qn) && qn >= 1 && (focusRow.avail ?? 0) >= qn &&
    CODE_RE.test(code.trim()) && (reason !== REASONS[3] || /^WO-2026-\d{4}$/.test(woRef.trim()));

  const postMutation = async () => {
    setMutTouched(true);
    if (!mutOk || !focusLive) return;
    const isAdjust = reason === REASONS[2];
    const body: Record<string, unknown> = isAdjust
      ? {
        sku: focus, type: 'ADJUST', qty: Math.max(0, focusLive.onHand - qn),
        refNumber: woRef.trim() || null, reason: `${reason} · Central Crib → ${dest}`,
        stepUpCode: code.trim(),
      }
      : {
        sku: focus, type: 'ISSUE', qty: qn,
        refNumber: reason === REASONS[3] ? woRef.trim() : null,
        reason: `${reason} · Central Crib → ${dest}`,
        stepUpCode: code.trim(),
      };
    setPosting(true);
    try {
      const updated = await postStock(body);
      await refresh();
      setQty('1');
      setCode('');
      setMutTouched(false);
      push(true, 'Mutasi terkirim', `${focus} −${qn} · ${String(body.refNumber ?? focus)} · stok server kini ${updated.onHand}.`);
    } catch (e) {
      push(false, 'Mutation rejected', errMsg(e));
    } finally {
      setPosting(false);
    }
  };

  const issue = async (id: string) => {
    if (live !== true) {
      push(false, 'Issue unavailable', 'Server unreachable — issues are disabled in demo mode.');
      return;
    }
    if (issuing !== id) {
      setIssuing(id);
      setIssueCode('');
      return;
    }
    if (!CODE_RE.test(issueCode.trim())) return;
    setPosting(true);
    try {
      const updated = await postStock({
        sku: id, type: 'ISSUE', qty: 1,
        refNumber: CANON.workOrderSeal, reason: `Issue to ${CANON.workOrderSeal}`,
        stepUpCode: issueCode.trim(),
      });
      await refresh();
      setIssuing(null);
      setIssueCode('');
      push(true, 'Issued to WO', `${id} · 1 pc → ${CANON.workOrderSeal} · server on-hand now ${updated.onHand}.`);
    } catch (e) {
      push(false, 'Issue rejected', errMsg(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Inventaris &amp; Ledger Suku Cadang</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="inv-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Ledger Suku Cadang &amp; Consumables · SKU-REG v4.2 · Hub: Central Crib (Bldg B)</p>
            <h1 id="inv-h" className="text-2xl font-semibold tracking-tight">Inventaris &amp; Ledger Suku Cadang</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            {live === null ? (
              <Badge variant="warn">Menghubungkan…</Badge>
            ) : live ? (
              <Badge variant="pass">Live · dari server</Badge>
            ) : (
              <Badge variant="fail">Demo offline — server tidak terjangkau</Badge>
            )}
            <Button variant="secondary" onClick={exportCsv} disabled={busyExport}>{busyExport ? 'Mengekspor…' : <><Download size={16} /> Ekspor · Export CSV (loaded rows)</>}</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Cetak QR / Barcode</Button>
            <Dialog open={recvOpen} onOpenChange={setRecvOpen}>
              <DialogTrigger asChild>
                <Button><PackagePlus size={16} /> Terima Langsung (tanpa GRN)</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="recv-h">
                <DialogTitle id="recv-h">Terima Stok</DialogTitle>
                <DialogDescription>Mencatat mutasi RECEIVE langsung + menambah stok. Tidak membuat baris GRN — untuk penerimaan berbasis PO dengan GRN, terima via Purchasing → GRN. Dock Bay 02 · butuh kode approver.</DialogDescription>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="recv-po">Ref PO (PO-YYYY-NNNN)</label>
                    <Input id="recv-po" value={recvPo} onChange={(e) => setRecvPo(e.target.value.toUpperCase())} invalid={recvTouched && !/^PO-\d{4}-\d{4}$/.test(recvPo.trim())} className="apex-id" placeholder="PO-2026-0298" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="recv-qty">Jml</label>
                    <Input id="recv-qty" inputMode="numeric" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} invalid={recvTouched && !(parseInt(recvQty, 10) >= 1)} />
                  </div>
                </div>
                <label className="text-xs font-semibold" htmlFor="recv-sku">SKU</label>
                <select id="recv-sku" value={recvSku} onChange={(e) => setRecvSku(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                  {catalogedIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="recv-code">Kode approver (aplikasi authenticator, 6 digit)</label>
                  <Input id="recv-code" type="password" inputMode="numeric" autoComplete="off" value={recvCode} onChange={(e) => setRecvCode(e.target.value)} invalid={recvTouched && !CODE_RE.test(recvCode.trim())} placeholder="••••••" />
                </div>
                {recvTouched && (!/^PO-\d{4}-\d{4}$/.test(recvPo.trim()) || !(parseInt(recvQty, 10) >= 1) || !CODE_RE.test(recvCode.trim())) && (
                  <p className="text-[11px] font-semibold text-fail">Ref PO valid + jml ≥ 1 + kode approver 6 digit wajib diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setRecvOpen(false)}>Batal</Button>
                  <Button onClick={() => void receive()} disabled={posting}>{posting ? 'Mengirim…' : 'Kirim Penerimaan'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter SKU, nama, bin… (Ctrl+/)" aria-label="Filter SKU" />
          </div>
          <select value={hub} onChange={(e) => setHub(e.target.value)} aria-label="Hub gudang" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {HUBS.map((h) => <option key={h}>{h}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Ambang inventaris" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Kategori part">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={cn('h-8 px-3 rounded text-xs font-semibold border', cat === c ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}
            >
              {c} · {catCount(c)}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1000px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">SKU &amp; Spesifikasi Part</th>
                <th className="font-semibold">Bin / Hub</th>
                <th className="font-semibold">Stok</th>
                <th className="font-semibold">Direservasi</th>
                <th className="font-semibold">Tersedia</th>
                <th className="font-semibold">Min / ROP</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <p><span className="apex-id font-bold text-cobalt">{r.id}</span> <span className="text-[10px] font-bold text-muted">{r.cat.split(' ')[0].toUpperCase()}</span></p>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{r.spec}</p>
                    {!r.cataloged && <p className="text-[11px] font-semibold text-warn">Tidak di katalog — baris demo, mutasi dimatikan.</p>}
                  </td>
                  <td><p className="apex-id text-xs">{r.bin}</p><p className="text-xs text-muted">{r.hub}</p></td>
                  <td className="apex-id font-bold">{r.on}</td>
                  <td className="apex-id">{r.reserved ?? '—'}</td>
                  <td className="apex-id font-bold">{r.avail ?? '—'}</td>
                  <td className="apex-id">{r.min}</td>
                  <td>
                    <Badge variant={r.level === 'critical' ? 'fail' : r.level === 'rop' ? 'warn' : 'pass'}>{r.status}</Badge>
                  </td>
                  <td>
                    {!r.cataloged ? (
                      <span className="text-xs text-muted">—</span>
                    ) : note[r.id] ? (
                      <span className="text-xs font-semibold text-pass">{note[r.id]}</span>
                    ) : r.id === 'PART-FLTR-401' ? (
                      <span className="flex flex-col gap-1">
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs text-left" onClick={() => void issue(r.id)}>Keluarkan ke WO</button>
                        {issuing === r.id && (
                          <span className="flex items-center gap-1">
                            <Input aria-label={`Kode approver untuk mengeluarkan ${r.id}`} type="password" inputMode="numeric" autoComplete="off" value={issueCode} onChange={(e) => setIssueCode(e.target.value)} placeholder="••••••" className="h-7 w-20 text-xs" />
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => void issue(r.id)} disabled={posting}>Konfirmasi</button>
                          </span>
                        )}
                      </span>
                    ) : r.id === CANON.sealSku || r.level === 'critical' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PR')}>+ Minta PR</button>
                    ) : r.level === 'rop' && r.id === 'PART-LUB-09' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PO')}>+ PO Cepat</button>
                    ) : r.level === 'rop' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PR')}>+ PR Request</button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">Tidak ada SKU — ubah filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">Menampilkan {filtered.length} dari {display.length} SKU{live === true ? ' (jumlah server live)' : ' (jumlah demo — server tidak terjangkau)'}.</p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Ledger Mutasi <span className="text-xs font-normal text-muted">{movLive ? 'Feed audit server · UTC' : 'Feed demo · UTC'}</span></h2>
              {movLive ? <Badge variant="pass">Live · dari server</Badge> : <Badge variant="warn">Demo offline</Badge>}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Movement filter">
              {MOV_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMtab(t)}
                  aria-pressed={mtab === t}
                  className={cn('h-8 px-3 rounded text-xs font-semibold border', mtab === t ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}
                >
                  {t} ({tabCount(t)})
                </button>
              ))}
            </div>
            <ol
              ref={movWin.containerRef as React.RefObject<HTMLOListElement>}
              onScroll={movWin.onScroll}
              className="flex flex-col gap-2 overflow-y-auto max-h-[560px]"
            >
              {movWin.topPad > 0 && <li style={{ height: movWin.topPad }} aria-hidden="true" />}
              {movWin.items.map((m, i) => (
                <li key={`${m.doc}-${i}`} className="rounded-lg border border-border-subtle bg-card p-3 flex flex-col gap-1 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('apex-id font-bold', m.kind === 'IN' || m.kind === 'TRF' ? 'text-pass' : m.kind === 'ADJ' ? 'text-warn' : 'text-fail')}>{m.delta}</span>
                    {m.doc === CANON.workOrderSeal ? (
                      <Link className="apex-id font-bold text-cobalt hover:underline" href={`/work-orders/${m.doc}`}>{m.doc}</Link>
                    ) : m.doc.startsWith(CANON.purchaseOrder) ? (
                      <Link className="apex-id font-bold text-cobalt hover:underline" href={`/purchasing/${CANON.purchaseOrder}?tab=receiving`}>{m.doc}</Link>
                    ) : m.doc.startsWith(CANON.pmPlan) ? (
                      <Link className="apex-id font-bold text-cobalt hover:underline" href="/preventive-maintenance">{m.doc}</Link>
                    ) : (
                      <span className="apex-id font-bold">{m.doc}</span>
                    )}
                    <span className="apex-id text-muted ml-auto">{movLive ? fmtTs(m.ts) : m.ts}</span>
                  </div>
                  <p className="font-semibold">{m.part}</p>
                  <p className="text-muted text-xs">{m.detail}</p>
                </li>
              ))}
              {movWin.bottomPad > 0 && <li style={{ height: movWin.bottomPad }} aria-hidden="true" />}
              {movFiltered.length === 0 && <li className="text-sm text-muted p-2">Belum ada mutasi di sini.</li>}
            </ol>
          </div>

          <div className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-semibold">Meja Transfer &amp; Mutasi</h2>
            {live !== true && <p className="text-[13px] font-semibold text-warn" role="status">Server tidak terjangkau — mutasi dimatikan di mode demo.</p>}
            {live === true && !canMutate && <p className="text-[13px] font-semibold text-warn" role="status">Peran Anda tidak dapat menyetujui mutasi stok.</p>}
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-sku">SKU Fokus Aktif</label>
                <select id="mut-sku" value={focus} onChange={(e) => setFocus(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                  {catalogedIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-reason">Alasan / Arahan Mutasi</label>
                <select id="mut-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                  {REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-dest">Hub / Teknisi Tujuan</label>
                <select id="mut-dest" value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                  {DESTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-qty">Jumlah Transfer</label>
                <Input id="mut-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} invalid={mutTouched && !(Number.isFinite(qn) && qn >= 1 && (focusRow.avail ?? 0) >= qn)} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-wo">WO Terkait / X-Ref{reason === REASONS[3] ? ' (wajib)' : ''}</label>
                <Input id="mut-wo" value={woRef} onChange={(e) => setWoRef(e.target.value.toUpperCase())} invalid={mutTouched && reason === REASONS[3] && !/^WO-2026-\d{4}$/.test(woRef.trim())} className="apex-id" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-pin">Kode approver (aplikasi authenticator, 6 digit)</label>
                <Input id="mut-pin" type="password" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} invalid={mutTouched && !CODE_RE.test(code.trim())} placeholder="••••••" />
              </div>
            </div>
            <p className="text-[13px]" role="status">
              Tersedia Central: <strong className="apex-id">{focusRow.avail ?? '—'}</strong>
              {' '}→ Saldo setelah transfer: <strong className={cn('apex-id', Number.isFinite(qn) && (focusRow.avail ?? 0) - qn < 0 ? 'text-fail' : 'text-pass')}>
                {focusRow.avail === null ? '—' : Number.isFinite(qn) ? `${(focusRow.avail ?? 0) - qn} tersedia di Central` : '—'}
              </strong>
            </p>
            {mutTouched && !mutOk && (
              <p className="text-[11px] font-semibold text-fail">Jml ≤ tersedia, kode approver 6 digit{reason === REASONS[3] ? ', dan ref WO-2026-NNNN' : ''} wajib diisi{live !== true ? ' (dan koneksi server live)' : ''}.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setQty('1'); setCode(''); setMutTouched(false); }}>Batal</Button>
              <Button onClick={() => void postMutation()} disabled={posting || !canMutate}>{posting ? 'Mengirim…' : 'Konfirmasi & Kirim Mutasi'}</Button>
            </div>
          </div>
        </div>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
