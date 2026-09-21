'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, PackagePlus, Printer, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/download';
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

const CATS = ['All Categories', 'HVAC Mechanical', 'Electrical & Switchgear', 'Lubricants & Fluids', 'Filters & Consumables'] as const;
const CAT_COUNT_DEMO: Record<string, string> = { 'All Categories': '4,218', 'HVAC Mechanical': '842', 'Electrical & Switchgear': '612', 'Lubricants & Fluids': '248', 'Filters & Consumables': '1,150' };
const HUBS = ['All Warehouses (Consolidated)', 'Central Crib - Bldg B', 'Substation Locker 4B', 'Cleanroom Cage C-04'] as const;
const LEVELS = ['All Stock Levels', 'Critical Low Stock (< Safety)', 'Below Reorder Point (ROP)', 'Optimal / Adequate'] as const;

type MovKind = 'IN' | 'OUT' | 'ADJ' | 'TRF';
interface Mov { kind: MovKind; delta: string; doc: string; ts: string; part: string; detail: string }

const MOV_SEED: Mov[] = [
  { kind: 'OUT', delta: '−1 ea', doc: CANON.workOrderSeal, ts: 'Today 14:32 UTC', part: `${CANON.sealSku} (Mechanical Shaft Seal)`, detail: `AST-HVAC-004 · ${CANON.sealBin} · dispatched to M. Kowalski (Lead Tech) · auth:mvance` },
  { kind: 'IN', delta: '+2 ea', doc: `${CANON.purchaseOrder} · GRN Rec`, ts: 'Today 11:15 UTC', part: `${CANON.sealSku} (Mechanical Shaft Seal Kit)`, detail: 'Trane Supply Co · dock bay-02 · barcode verified' },
  { kind: 'OUT', delta: '−2 pails', doc: `${CANON.pmPlan} · Quarterly PM`, ts: 'Yest 16:40 UTC', part: 'PART-LUB-09 (Synthetic POE ISO 68)', detail: 'CRIB-CHEM · recipient HVAC Shift Team A · ref:PM-Q1' },
];

const MOV_TABS = ['All', 'Receipts', 'WO Out', 'Adjust', 'Transfers'] as const;

const REASONS = [
  'Transfer to Sub-Warehouse (Field Stage)',
  'Scrap / Damaged Defect Write-Off',
  'Physical Cycle Count Variance Adjustment',
  'Emergency Borrow & Return Allocation',
] as const;

const DESTS = ['Substation Locker 4B (Bldg B - L1)', 'Mobile Van 03 - Field Service', 'Quarantine Holding Bay'] as const;

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 900;

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
  const [cat, setCat] = useState<string>('All Categories');
  const [hub, setHub] = useState<string>('All Warehouses (Consolidated)');
  const [level, setLevel] = useState<string>('All Stock Levels');
  const [mtab, setMtab] = useState<string>('All');
  const [toasts, setToasts] = useState<Toast[]>([]);
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

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const errMsg = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing was posted.');

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

  const catalogedIds = display.filter((r) => r.cataloged).map((r) => r.id);

  const filtered = display.filter((r) => {
    if (cat !== 'All Categories' && r.cat !== cat) return false;
    if (hub !== 'All Warehouses (Consolidated)' && r.hub !== hub) return false;
    if (level === 'Critical Low Stock (< Safety)' && r.level !== 'critical') return false;
    if (level === 'Below Reorder Point (ROP)' && r.level !== 'rop') return false;
    if (level === 'Optimal / Adequate' && r.level !== 'optimal') return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.id} ${r.name} ${r.spec} ${r.bin}`.toLowerCase().includes(needle);
  });

  const feed: Mov[] = movLive ? movServer : MOV_SEED;
  const movFiltered = feed.filter((m) =>
    mtab === 'All' || (mtab === 'Receipts' && m.kind === 'IN') || (mtab === 'WO Out' && m.kind === 'OUT') ||
    (mtab === 'Adjust' && m.kind === 'ADJ') || (mtab === 'Transfers' && m.kind === 'TRF')
  );
  const tabCount = (t: string) => t === 'All'
    ? feed.length
    : feed.filter((m) => (t === 'Receipts' && m.kind === 'IN') || (t === 'WO Out' && m.kind === 'OUT') ||
      (t === 'Adjust' && m.kind === 'ADJ') || (t === 'Transfers' && m.kind === 'TRF')).length;

  const movWin = useWindow(movFiltered, { rowHeight: 76, threshold: 60, initialHeight: 480 });

  const kpis = live === true ? (() => {
    const vals = Object.values(liveQty);
    const valuation = vals.reduce((s, p) => s + (p.onHand * p.unitPriceCents) / 100, 0);
    const low = vals.filter((p) => p.available < p.minStock).length;
    return [
      { l: 'Catalog Valuation (loaded)', v: `$${valuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, s: `FIFO · ${vals.length} SKUs loaded from server` },
      { l: 'Stock Availability Health', v: low === 0 ? '100%' : `${(((vals.length - low) / Math.max(vals.length, 1)) * 100).toFixed(1)}%`, s: `${low} SKUs below minimum (loaded page)` },
      { l: 'Low Stock & Reorder Triggers', v: `${low} SKUs`, s: 'Below minimum on loaded page' },
      { l: 'Monthly Stock Movement', v: `${feed.length}`, s: 'Server audit feed (last 50 events)' },
    ];
  })() : [
    { l: 'Catalog Valuation', v: '$1,428,650.00', s: 'FIFO · 4,218 SKUs · +4.8% this quarter (demo)' },
    { l: 'Stock Availability Health', v: '94.2%', s: 'Operational · 38 critical WO-reserved (demo)' },
    { l: 'Low Stock & Reorder Triggers', v: '7 PO drafts', s: 'Auto-queued · 2 expedited in-transit (demo)' },
    { l: 'Monthly Stock Movement', v: '1,840', s: '+1,240 in · −560 out · 40 trf · 3.8x velocity (demo)' },
  ];

  const catCount = (c: string) => {
    if (live !== true) return CAT_COUNT_DEMO[c];
    if (c === 'All Categories') return String(display.length);
    return String(display.filter((r) => r.cat === c).length);
  };

  const exportCsv = () => {
    const head = 'sku,category,name,bin,hub,on_hand,reserved,available,min_rop,status';
    const body = filtered.map((r) =>
      [r.id, `"${r.cat}"`, `"${r.name}"`, `"${r.bin}"`, `"${r.hub}"`, r.on, r.reserved ?? '', r.avail ?? '', r.min, `"${r.status}"`].join(',')
    );
    downloadText('spare-parts-ledger.csv', [head, ...body].join('\n'));
    push(true, 'Ledger exported', `${filtered.length} loaded rows → spare-parts-ledger.csv${live === true ? ' (live server data)' : ' (demo data — server unreachable)'}.`);
  };

  const reorder = (id: string, kind: 'PR' | 'PO') => {
    const ref = kind === 'PR' ? 'PR-2026-0316' : 'PO-2026-0316';
    setNote((n) => ({ ...n, [id]: `${ref} drafted` }));
    push(true, kind === 'PR' ? 'PR drafted' : 'Quick PO drafted', `${ref} · ${id} → purchasing queue.`);
  };

  const postStock = (body: Record<string, unknown>) =>
    apiFetch<PartLive>('/api/parts/movements', { method: 'POST', body });

  const receive = async () => {
    setRecvTouched(true);
    if (live !== true) {
      push(false, 'Receipt unavailable', 'Server unreachable — receipts are disabled in demo mode.');
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
      push(true, 'Stock received', `${recvSku} +${n} · ${recvPo.trim()} · server on-hand now ${updated.onHand}.`);
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
      push(true, 'Mutation posted', `${focus} −${qn} · ${String(body.refNumber ?? focus)} · server on-hand now ${updated.onHand}.`);
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
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Inventory &amp; Spare Parts Ledger</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="inv-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Spare Parts &amp; Consumables Ledger · SKU-REG v4.2 · Hub: Central Crib (Bldg B)</p>
            <h1 id="inv-h" className="text-2xl font-semibold tracking-tight">Inventory &amp; Spare Parts Ledger</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            {live === null ? (
              <Badge variant="warn">Connecting…</Badge>
            ) : live ? (
              <Badge variant="pass">Live · server-fed</Badge>
            ) : (
              <Badge variant="fail">Demo offline — server unreachable</Badge>
            )}
            <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Export CSV (loaded rows)</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Print QR / Barcode</Button>
            <Dialog open={recvOpen} onOpenChange={setRecvOpen}>
              <DialogTrigger asChild>
                <Button><PackagePlus size={16} /> Direct Receive (no GRN)</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="recv-h">
                <DialogTitle id="recv-h">Receive Stock</DialogTitle>
                <DialogDescription>Posts a direct RECEIVE movement + increments on-hand. No goods-receipt (GRN) row is created — for PO-backed receipts with a GRN ledger entry, receive via Purchasing → GRN. Dock Bay 02 · requires approver code.</DialogDescription>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="recv-po">PO ref (PO-YYYY-NNNN)</label>
                    <Input id="recv-po" value={recvPo} onChange={(e) => setRecvPo(e.target.value.toUpperCase())} invalid={recvTouched && !/^PO-\d{4}-\d{4}$/.test(recvPo.trim())} className="apex-id" placeholder="PO-2026-0298" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="recv-qty">Qty</label>
                    <Input id="recv-qty" inputMode="numeric" value={recvQty} onChange={(e) => setRecvQty(e.target.value)} invalid={recvTouched && !(parseInt(recvQty, 10) >= 1)} />
                  </div>
                </div>
                <label className="text-xs font-semibold" htmlFor="recv-sku">SKU</label>
                <select id="recv-sku" value={recvSku} onChange={(e) => setRecvSku(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                  {catalogedIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="recv-code">Approver code (authenticator app, 6 digits)</label>
                  <Input id="recv-code" type="password" inputMode="numeric" autoComplete="off" value={recvCode} onChange={(e) => setRecvCode(e.target.value)} invalid={recvTouched && !CODE_RE.test(recvCode.trim())} placeholder="••••••" />
                </div>
                {recvTouched && (!/^PO-\d{4}-\d{4}$/.test(recvPo.trim()) || !(parseInt(recvQty, 10) >= 1) || !CODE_RE.test(recvCode.trim())) && (
                  <p className="text-[11px] font-semibold text-fail">Valid PO ref + qty ≥ 1 + 6-digit approver code are required.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setRecvOpen(false)}>Cancel</Button>
                  <Button onClick={() => void receive()} disabled={posting}>{posting ? 'Posting…' : 'Post Receipt'}</Button>
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
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by SKU, name, bin… (Ctrl+/)" aria-label="Filter SKUs" />
          </div>
          <select value={hub} onChange={(e) => setHub(e.target.value)} aria-label="Warehouse hub" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {HUBS.map((h) => <option key={h}>{h}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Inventory threshold" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Part categories">
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
                <th className="p-2 font-semibold">SKU &amp; Part Specification</th>
                <th className="font-semibold">Bin / Hub</th>
                <th className="font-semibold">On Hand</th>
                <th className="font-semibold">Reserved</th>
                <th className="font-semibold">Available</th>
                <th className="font-semibold">Min / ROP</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <p><span className="apex-id font-bold text-cobalt">{r.id}</span> <span className="text-[10px] font-bold text-muted">{r.cat.split(' ')[0].toUpperCase()}</span></p>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{r.spec}</p>
                    {!r.cataloged && <p className="text-[11px] font-semibold text-warn">Not in system catalog — demo row, mutations disabled.</p>}
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
                        <button type="button" className="text-cobalt font-semibold hover:underline text-xs text-left" onClick={() => void issue(r.id)}>Issue to WO</button>
                        {issuing === r.id && (
                          <span className="flex items-center gap-1">
                            <Input aria-label={`Approver code to issue ${r.id}`} type="password" inputMode="numeric" autoComplete="off" value={issueCode} onChange={(e) => setIssueCode(e.target.value)} placeholder="••••••" className="h-7 w-20 text-xs" />
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => void issue(r.id)} disabled={posting}>Confirm</button>
                          </span>
                        )}
                      </span>
                    ) : r.id === CANON.sealSku || r.level === 'critical' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PR')}>+ PR Request</button>
                    ) : r.level === 'rop' && r.id === 'PART-LUB-09' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PO')}>+ Quick PO</button>
                    ) : r.level === 'rop' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => reorder(r.id, 'PR')}>+ PR Request</button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">No SKUs in this view — clear filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">Showing {filtered.length} of {display.length} SKUs{live === true ? ' (live server quantities)' : ' (demo quantities — server unreachable)'}.</p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Movement Ledger <span className="text-xs font-normal text-muted">{movLive ? 'Server audit feed · UTC' : 'Demo feed · UTC'}</span></h2>
              {movLive ? <Badge variant="pass">Live · server-fed</Badge> : <Badge variant="warn">Demo offline</Badge>}
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
              {movFiltered.length === 0 && <li className="text-sm text-muted p-2">No movements in this bucket yet.</li>}
            </ol>
          </div>

          <div className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-semibold">Transfer &amp; Mutation Desk</h2>
            {live !== true && <p className="text-[13px] font-semibold text-warn" role="status">Server unreachable — mutations are disabled in demo mode.</p>}
            {live === true && !canMutate && <p className="text-[13px] font-semibold text-warn" role="status">Your role cannot approve stock mutations.</p>}
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-sku">Active Focus SKU</label>
                <select id="mut-sku" value={focus} onChange={(e) => setFocus(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                  {catalogedIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-reason">Mutation Reason / Directive</label>
                <select id="mut-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                  {REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-dest">Destination Hub / Tech</label>
                <select id="mut-dest" value={dest} onChange={(e) => setDest(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                  {DESTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-qty">Transfer Quantity</label>
                <Input id="mut-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} invalid={mutTouched && !(Number.isFinite(qn) && qn >= 1 && (focusRow.avail ?? 0) >= qn)} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-wo">Associated WO / X-Ref{reason === REASONS[3] ? ' (required)' : ''}</label>
                <Input id="mut-wo" value={woRef} onChange={(e) => setWoRef(e.target.value.toUpperCase())} invalid={mutTouched && reason === REASONS[3] && !/^WO-2026-\d{4}$/.test(woRef.trim())} className="apex-id" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-semibold" htmlFor="mut-pin">Approver code (authenticator app, 6 digits)</label>
                <Input id="mut-pin" type="password" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} invalid={mutTouched && !CODE_RE.test(code.trim())} placeholder="••••••" />
              </div>
            </div>
            <p className="text-[13px]" role="status">
              Avail. Central: <strong className="apex-id">{focusRow.avail ?? '—'}</strong>
              {' '}→ Balance post-transfer: <strong className={cn('apex-id', Number.isFinite(qn) && (focusRow.avail ?? 0) - qn < 0 ? 'text-fail' : 'text-pass')}>
                {focusRow.avail === null ? '—' : Number.isFinite(qn) ? `${(focusRow.avail ?? 0) - qn} available in Central` : '—'}
              </strong>
            </p>
            {mutTouched && !mutOk && (
              <p className="text-[11px] font-semibold text-fail">Qty ≤ available, a 6-digit approver code{reason === REASONS[3] ? ', and a WO-2026-NNNN ref' : ''} are required{live !== true ? ' (and a live server connection)' : ''}.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setQty('1'); setCode(''); setMutTouched(false); }}>Cancel</Button>
              <Button onClick={() => void postMutation()} disabled={posting || !canMutate}>{posting ? 'Posting…' : 'Confirm & Post Mutation'}</Button>
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
