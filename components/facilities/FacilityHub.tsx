'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Download, Flame, Layers, MapPin, Plus, Printer, RefreshCw, Thermometer, Wind, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/download';
import { ApiError, apiFetch } from '@/lib/api/client';

interface FacilityRow {
  id: string;
  code: string;
  name: string;
  geojson: string | null;
  mapped: boolean;
  defects: { text: string; at: string; by: string }[];
  transfers: { assetCode: string; toCode: string; at: string; by: string }[];
  createdAt: string;
  updatedAt: string;
}

const FAC_ROUTE = '/api/facilities';
const CANON_ROOM_CODE = 'B2-MECH-204';

interface Room { id: string; name: string; counts: string; seeded: boolean }

const ROOMS: Room[] = [
  { id: '#B-201', name: 'Emer Gen Vault', counts: '3 Ast | 1 WO', seeded: false },
  { id: '#B-204', name: 'Centrifugal Chiller', counts: '8 AST', seeded: true },
  { id: '#B-208', name: 'Primary Pump Bay', counts: '5 Ast', seeded: false },
  { id: '#B-212', name: 'Chemical Dosing', counts: '2 Ast', seeded: false },
];

const NODES: Record<string, { label: string; sub: string; tone: 'nominal' | 'critical' | 'standby' }> = {
  ch3: { label: 'CHILLER #03 · AST-HVAC-003 (450 TR)', sub: 'RUNNING NOMINAL · 96%', tone: 'nominal' },
  ch4: { label: `CHILLER #04 [CRITICAL] · ${CANON.assetSeal}`, sub: `SEAL REFRIG LEAK · ${CANON.workOrderSeal}`, tone: 'critical' },
  p101: { label: 'PUMP #101 · AST-PUMP-101', sub: '75HP · ACTIVE', tone: 'nominal' },
  p102: { label: 'PUMP #102 · AST-PUMP-102', sub: 'STANDBY READY', tone: 'standby' },
  mcc: { label: 'MCC-B2-04 SWITCHGEAR', sub: '480V 3-PHASE · FEED 2B', tone: 'nominal' },
  v42: { label: 'VALV-042 · AST-VALV-042', sub: 'DN300 BFLY · Operational', tone: 'nominal' },
};

const SEL_CAMPUSES = ['HQ Campus (Nusantara)', 'Western Regional Logistics Terminal', 'Bio-Pharma Clean Manufacturing Park'] as const;
const SEL_BUILDINGS = ['Building A - Corporate HQ', 'Building B - Central Utilities Plant (CUP)', 'Building C - High Density Lab', 'Central Parts Warehouse'] as const;
const SEL_FLOORS = ['Roof Deck (Cooling Loop)', 'Level 01 (Switchgear Yard)', 'Basement L2 - Heavy Mech Vault', 'Basement L3 - Fire Pumps'] as const;
const SEL_ROOMS = ['Room #B-201: Generator Vault', 'Room #B-204: Centrifugal Chiller Plant (Active)', 'Room #B-208: Primary Pump Bay', 'Room #B-212: Chemical Dosing'] as const;

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1000;

const download = (filename: string, text: string, type = 'application/geo+json') => downloadText(filename, text, type);

export function FacilityHub() {
  const [room, setRoom] = useState('#B-204');
  const [open, setOpen] = useState<Record<string, boolean>>({ campus: true, bldB: true, l2: true });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [area, setArea] = useState('480');
  const [clearance, setClearance] = useState('5.2');
  const [polyOpen, setPolyOpen] = useState(false);
  const [polyTouched, setPolyTouched] = useState(false);
  const [audits, setAudits] = useState(0);
  const [node, setNode] = useState('ch4');
  const [layers, setLayers] = useState({ hvac: true, elec: true, fire: true });
  const [sel, setSel] = useState({ c: 0, b: 1, f: 2, r: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addTouched, setAddTouched] = useState(false);
  const [extraRooms, setExtraRooms] = useState<string[]>([]);
  const [calibrated, setCalibrated] = useState('14 Sep 2026 06:00 WIB');
  const [defects, setDefects] = useState<string[]>([]);
  const [defOpen, setDefOpen] = useState(false);
  const [defText, setDefText] = useState('');
  const [defTouched, setDefTouched] = useState(false);
  const [reOpen, setReOpen] = useState(false);
  const [reAsset, setReAsset] = useState<string>(CANON.assetSeal);
  const [reDest, setReDest] = useState('#B-208 Primary Pump Bay');
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [facLive, setFacLive] = useState<boolean | null>(null);
  const [, setFacCanManage] = useState(false);
  const [posting, setPosting] = useState(false);

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const errMsg = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing persisted.');

  const loadFacilities = async () => {
    try {
      const res = await apiFetch<{ facilities: FacilityRow[]; can: { manage: boolean } }>(FAC_ROUTE);
      setFacilities(res.facilities);
      setFacCanManage(res.can.manage);
      setFacLive(true);
    } catch {
      setFacLive(false);
    }
  };

  useEffect(() => { void loadFacilities(); }, []);

  const canonFacility = facLive ? facilities.find((f) => f.code === CANON_ROOM_CODE) : undefined;

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const selRoom = ROOMS.find((r) => r.id === room) ?? ROOMS[1];

  const exportGeo = () => {
    if (facLive) {
      const features = facilities.map((f) => {
        let geometry: unknown = null;
        if (f.geojson) {
          try { geometry = JSON.parse(f.geojson); } catch { geometry = null; }
        }
        return {
          type: 'Feature',
          geometry,
          properties: {
            code: f.code, name: f.name, mapped: geometry !== null,
            defects: f.defects.length, transfers: f.transfers.length,
          },
        };
      });
      const mapped = features.filter((f) => Boolean(f.properties.mapped)).length;
      download('facility-room-index.geojson', JSON.stringify({
        type: 'FeatureCollection',
        site: CANON.tenant,
        source: 'server /api/facilities',
        generatedAt: new Date().toISOString(),
        note: `${mapped} mapped, ${features.length - mapped} unmapped (geometry: null).`,
        features,
      }, null, 2));
      push(true, 'Spatial exported', `facility-room-index.geojson · ${features.length} server facilities · ${mapped} mapped, ${features.length - mapped} unmapped.`);
      return;
    }
    const features = ROOMS.map((r) => ({
      type: 'Feature',
      geometry: null,
      properties: {
        node: r.id === '#B-204' ? 'LOC-B2-MECH-204' : 'unseeded',
        room: `${r.id} ${r.name}`,
        counts: r.counts,
        grid: r.id === '#B-204' ? 'CUP-G8-X3' : null,
        zone: 'Nusantara-CUP-B2',
      },
    }));
    download('basement-l2-spatial.geojson', JSON.stringify({ type: 'FeatureCollection', features }, null, 2));
    push(true, 'Spatial exported', 'basement-l2-spatial.geojson · 4 rooms · geometries unseeded (properties + grid refs only) · local staging — not persisted.');
  };

  const savePolygon = () => {
    setPolyTouched(true);
    const a = parseFloat(area);
    const c = parseFloat(clearance);
    if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(c) || c <= 0) return;
    setPolyOpen(false);
    setPolyTouched(false);
    push(true, 'Polygon updated', `Room #B-204 · ${a} m² · clearance ${c}m · local staging — not persisted.`);
  };

  const dispatchAudit = () => {
    const n = audits + 1;
    setAudits(n);
    push(true, 'Room audit logged', `AUD-2026-0${140 + n} (local counter — not persisted) · Room #B-204 · TMPL-HVAC-CHL-02 · crew notify logged (no pager) · local simulation.`);
  };

  const addRoom = async () => {
    setAddTouched(true);
    const name = addName.trim();
    if (!name) return;
    if (facLive) {
      setPosting(true);
      try {
        const f = await apiFetch<FacilityRow>(FAC_ROUTE, { method: 'POST', body: JSON.stringify({ name }) });
        setFacilities((list) => [f, ...list]);
        setAddOpen(false);
        setAddName('');
        setAddTouched(false);
        push(true, 'Facility created — server', `${f.code} · ${f.name} · id ${f.id} · server-persisted (FACILITY_CREATE).`);
      } catch (e) {
        push(false, 'Facility create failed', errMsg(e));
      } finally {
        setPosting(false);
      }
      return;
    }
    setExtraRooms((r) => [...r, name]);
    setAddOpen(false);
    setAddName('');
    setAddTouched(false);
    push(true, 'Sub-location staged', `${name} · pending GIS survey + BIM binding · local staging — not persisted.`);
  };

  const logDefect = async () => {
    setDefTouched(true);
    const text = defText.trim();
    if (text.length < 10) return;
    if (facLive && canonFacility) {
      setPosting(true);
      try {
        const f = await apiFetch<FacilityRow>(`${FAC_ROUTE}/${encodeURIComponent(CANON_ROOM_CODE)}`, {
          method: 'PATCH', body: JSON.stringify({ defect: text }),
        });
        setFacilities((list) => list.map((x) => (x.code === f.code ? f : x)));
        setDefOpen(false);
        setDefText('');
        setDefTouched(false);
        push(true, 'Defect persisted — server', `${f.code} · open server defects: ${f.defects.length} · FACILITY_UPDATE audited.`);
      } catch (e) {
        push(false, 'Log defect failed', errMsg(e));
      } finally {
        setPosting(false);
      }
      return;
    }
    setDefects((d) => [...d, text]);
    setDefOpen(false);
    setDefText('');
    setDefTouched(false);
    push(true, 'Defect staged', `Room #B-204 · queued to triage · local staging — not persisted.`);
  };

  const reassign = async () => {
    if (facLive && canonFacility) {
      setPosting(true);
      try {
        const f = await apiFetch<FacilityRow>(`${FAC_ROUTE}/${encodeURIComponent(CANON_ROOM_CODE)}`, {
          method: 'PATCH', body: JSON.stringify({ transfer: { assetCode: reAsset, toCode: reDest } }),
        });
        setFacilities((list) => list.map((x) => (x.code === f.code ? f : x)));
        setReOpen(false);
        push(true, 'Transfer staged — server', `${f.code} → ${reDest} · ${f.transfers.length} request(s) on record · ledger move not executed.`);
      } catch (e) {
        push(false, 'Reassign failed', errMsg(e));
      } finally {
        setPosting(false);
      }
      return;
    }
    setReOpen(false);
    push(true, 'Transfer staged', `${reAsset} → ${reDest} · pending receiving confirm + ledger move · local staging — not persisted.`);
  };

  const selIsB204 = sel.c === 0 && sel.b === 1 && sel.f === 2 && sel.r === 1;
  const selCounts = sel.r === 1 ? '8 Assets · 2 Open WOs' : sel.r === 0 ? '3 Assets · 1 Open WO' : sel.r === 2 ? '5 Assets · WO queue unseeded' : '2 Assets · WO queue unseeded';

  const nodeTone = (t: string) => (t === 'critical' ? 'fail' : t === 'standby' ? 'warn' : 'pass');

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">HQ Campus (Nusantara Tower)</span>
        <span className="text-muted">/</span>
        <span className="text-muted">Building B (CUP)</span>
        <span className="text-muted">/</span>
        <span className="text-muted">Basement L2</span>
        <span className="text-muted">/</span>
        <span className="font-semibold">Room {room}</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="fac-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Spatial sync: local demo · no broker</p>
            {facLive === null ? (
              <p className="apex-id text-muted">Directory: connecting…</p>
            ) : facLive ? (
              <p className="apex-id text-pass">Directory: live · server-fed · {facilities.length} facilities</p>
            ) : (
              <p className="apex-id text-warn">Directory: demo offline — server unreachable · staging stays local</p>
            )}
            <h1 id="fac-h" className="text-2xl font-semibold tracking-tight">Facility Locations &amp; Spatial Topology Hub</h1>
            <p className="text-[13px] text-muted">Multi-tier geospatial asset hierarchy, BIM node coordination, and live mechanical room occupancy.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={() => { document.getElementById('spatial-index')?.scrollIntoView({ behavior: 'smooth' }); }}>
              <MapPin size={16} /> Quick Selector
            </Button>
            <Button variant="secondary" onClick={exportGeo}><Download size={16} /> Export GeoJSON / BIM</Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button><Plus size={16} /> Add Sub-Location / Room</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="add-h">
                <DialogTitle id="add-h">Add Sub-Location / Room</DialogTitle>
                <DialogDescription>Persists a server facility row when the API is live; otherwise stages locally (toast says which). The tree keeps local entries as STAGED.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="add-name">Room label (required)</label>
                <Input id="add-name" value={addName} onChange={(e) => setAddName(e.target.value)} invalid={addTouched && !addName.trim()} placeholder="e.g. #B-216 RO Water Plant" />
                {addTouched && !addName.trim() && <p className="text-[11px] font-semibold text-fail">A room label is required.</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={() => void addRoom()} disabled={posting}>{posting ? 'Posting…' : facLive ? 'Create (server)' : 'Stage Room'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">Total Managed Area</span>
            <span className="text-xl font-semibold tabular-nums">142,500 m²</span>
            <span className="text-[11px] text-muted">12 Sites · 34 Bldgs · 1,420 Rooms</span>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">Monitored Zones</span>
            <span className="text-xl font-semibold tabular-nums">68 Active</span>
            <span className="text-[11px] text-muted">Nusantara-CUP-B2 in scope · zone tree demo (staged, not synced)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div id="spatial-index" className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 scroll-mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Campus Spatial Index</h2>
              <Badge variant="info">BIM LOD-350</Badge>
            </div>
            <button type="button" onClick={() => toggle('campus')} className="flex items-center gap-1 text-[13px] font-bold" aria-expanded={open.campus}>
              {open.campus ? <ChevronDown size={15} /> : <ChevronRight size={15} />} HQ Campus (Nusantara) <span className="apex-id text-muted font-normal">4 BLDG</span>
            </button>
            {open.campus && (
              <ul className="ml-4 flex flex-col gap-1 text-[13px] border-l border-border-subtle pl-2">
                <li className="flex items-center justify-between gap-2 py-0.5"><span>Building A - Corp HQ (5 Fl)</span><Badge variant="pass">Nominal</Badge></li>
                <li>
                  <button type="button" onClick={() => toggle('bldB')} className="flex items-center gap-1 font-bold" aria-expanded={open.bldB}>
                    {open.bldB ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Building B - Central Plant (CUP) <Badge variant="fail">1 ALERT</Badge>
                  </button>
                  {open.bldB && (
                    <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-border-subtle pl-2">
                      <li className="flex items-center justify-between gap-2 py-0.5"><span>Roof - Chiller Loop &amp; CT</span><span className="apex-id text-muted">4 Assets</span></li>
                      <li className="flex items-center justify-between gap-2 py-0.5"><span>Level 01 - Main Switchyard</span><span className="apex-id text-muted">6 Assets</span></li>
                      <li>
                        <button type="button" onClick={() => toggle('l2')} className="flex items-center gap-1 font-bold" aria-expanded={open.l2}>
                          {open.l2 ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Basement L2 - Heavy Mech <span className="apex-id text-muted font-normal">{4 + extraRooms.length} Rooms</span>
                        </button>
                        {open.l2 && (
                          <ul className="ml-4 mt-1 flex flex-col gap-1 border-l border-border-subtle pl-2">
                            {ROOMS.map((r) => (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  onClick={() => { setRoom(r.id); if (!r.seeded) push(true, 'Structural node', `${r.id} ${r.name} · ${r.counts} · full sensor pack only seeded for #B-204.`); }}
                                  aria-current={room === r.id ? 'true' : undefined}
                                  className={cn('w-full flex items-center justify-between gap-2 py-1 px-2 rounded text-left', room === r.id ? 'bg-cobalt-tint border border-cobalt-deep font-bold' : 'hover:bg-card border border-transparent')}
                                >
                                  <span>{r.id} {r.name}</span>
                                  <span className="apex-id text-muted">{r.counts}</span>
                                </button>
                              </li>
                            ))}
                            {extraRooms.map((r) => (
                              <li key={r} className="flex items-center justify-between gap-2 py-1 px-2 text-muted"><span>{r}</span><Badge variant="hold">STAGED</Badge></li>
                            ))}
                          </ul>
                        )}
                      </li>
                      <li className="flex items-center justify-between gap-2 py-0.5"><span>Basement L3 - Fire Pumps</span><Badge variant="pass">Optimal</Badge></li>
                    </ul>
                  )}
                </li>
                <li className="py-0.5">Building C - Cleanroom Hub</li>
                <li className="py-0.5">Logistics &amp; Central Warehouse</li>
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted">GIS calibrated {calibrated}</p>
              <Button variant="secondary" onClick={() => { setCalibrated('14 Sep 2026 14:05 WIB'); push(true, 'GIS recalibrate — local demo', 'No GIS write · seed counts 12 Sites / 34 Bldgs / 1,420 Rooms are static copy, not measured data.'); }}>
                <RefreshCw size={14} /> Recalibrate GIS
              </Button>
            </div>
            {/* GAP-20/F15: real server-persisted facility directory (flat — no
                fabricated hierarchy claimed here). */}
            <div className="rounded border border-border-subtle bg-card p-3 flex flex-col gap-1.5" aria-labelledby="fac-dir-h">
              <div className="flex items-center justify-between gap-2">
                <h3 id="fac-dir-h" className="text-[13px] font-bold">Server locations</h3>
                {facLive ? <Badge variant="pass">LIVE · SERVER</Badge> : <Badge variant="hold">OFFLINE</Badge>}
              </div>
              {facLive === null && <p className="text-xs text-muted">Loading facilities…</p>}
              {facLive === false && <p className="text-xs text-muted">API unreachable — rows below are absent; staging actions stay local and unlabeled above.</p>}
              {facLive === true && facilities.length === 0 && (
                <p className="text-xs text-muted">No facilities persisted yet — create one via <strong>Add Sub-Location / Room</strong>.</p>
              )}
              {facLive === true && facilities.length > 0 && (
                <ul className="flex flex-col gap-1 text-[13px]">
                  {facilities.map((f) => (
                    <li key={f.code} className="rounded border border-border-subtle bg-surface px-2 py-1.5 flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="apex-id font-bold">{f.code}</span>
                        {f.mapped ? <Badge variant="info">GIS MAPPED</Badge> : <Badge variant="hold">UNMAPPED</Badge>}
                      </div>
                      <span>{f.name}</span>
                      <span className="text-xs text-muted">
                        <span className="apex-id">id {f.id.slice(0, 8)}…</span> · created {new Date(f.createdAt).toISOString().replace('T', ' ').slice(0, 16)} UTC
                        {' · '}defects {f.defects.length} · transfers {f.transfers.length}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="xl:col-span-2 rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{selRoom.id === '#B-204' ? 'Centrifugal Chiller Plant Room #B-204' : `${selRoom.id} ${selRoom.name}`}</h2>
                <p className="apex-id text-xs text-muted">{selRoom.id === '#B-204' ? 'LOC-B2-MECH-204 · Zone: Nusantara-CUP-B2' : `${selRoom.counts} · node ID unseeded`}</p>
                <p className="text-xs text-muted">Building B (Central Utilities Plant) · Level Basement L2 · Grid Coordinates: CUP-G8-X3</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Dialog open={polyOpen} onOpenChange={setPolyOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary"><Layers size={16} /> Edit Polygon</Button>
                  </DialogTrigger>
                  <DialogContent aria-labelledby="poly-h">
                    <DialogTitle id="poly-h">Edit Polygon — Room #B-204</DialogTitle>
                    <DialogDescription>Floor area + headroom clearance drive the BIM overlay.</DialogDescription>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-semibold" htmlFor="poly-area">Floor area (m²)</label>
                        <Input id="poly-area" inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} invalid={polyTouched && !(parseFloat(area) > 0)} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs font-semibold" htmlFor="poly-clear">Clearance (m)</label>
                        <Input id="poly-clear" inputMode="decimal" value={clearance} onChange={(e) => setClearance(e.target.value)} invalid={polyTouched && !(parseFloat(clearance) > 0)} />
                      </div>
                    </div>
                    {polyTouched && (!(parseFloat(area) > 0) || !(parseFloat(clearance) > 0)) && (
                      <p className="text-[11px] font-semibold text-fail">Area + clearance must be positive numbers.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setPolyOpen(false)}>Cancel</Button>
                      <Button onClick={savePolygon}>Save Polygon</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Print Badge QR</Button>
                <Button onClick={dispatchAudit}><ClipboardCheck size={16} /> Dispatch Room Audit{audits > 0 ? ` (${audits})` : ''}</Button>
              </div>
            </div>

            {selRoom.id === '#B-204' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
                  <div className="rounded border border-border-subtle bg-card p-2 flex gap-2 items-start">
                    <Flame size={16} className="text-fail shrink-0 mt-0.5" />
                    <div><p className="apex-label-caps text-muted">Fire Safety Zone</p><p className="font-bold">FZ-09 · FM-200 Active</p></div>
                  </div>
                  <div className="rounded border border-border-subtle bg-card p-2 flex gap-2 items-start">
                    <AlertTriangle size={16} className="text-warn shrink-0 mt-0.5" />
                    <div><p className="apex-label-caps text-muted">OSHA Risk Rating</p><p className="font-bold">Hazard Class 2</p></div>
                  </div>
                  <div className="rounded border border-border-subtle bg-card p-2 flex gap-2 items-start">
                    <Wind size={16} className="text-cobalt shrink-0 mt-0.5" />
                    <div><p className="apex-label-caps text-muted">Noise Exposure</p><p className="font-bold">88 dBA</p></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[13px]">
                  {[
                    { l: 'Floor Area', v: `${area} m²`, s: `Clearance: ${clearance}m` },
                    { l: 'Ambient Temp', v: '22.4 °C', s: '● Setpoint Target' },
                    { l: 'Rel Humidity', v: '48.2 %', s: '● Nominal (35-65%)' },
                    { l: 'Refrigerant (R-134a)', v: '142 PPM', s: '▲ Warning (>100 PPM)' },
                    { l: 'Thermal Delta T', v: '5.8 K', s: 'Primary/Sec Loop' },
                    { l: 'Active Assets', v: '8 units', s: '1 In Service Overhaul' },
                  ].map((k) => (
                    <div key={k.l} className="rounded border border-border-subtle bg-card p-2">
                      <p className="apex-label-caps text-muted">{k.l}</p>
                      <p className={cn('text-lg font-bold tabular-nums', k.l.startsWith('Refrigerant') && 'text-warn')}>{k.v}</p>
                      <p className="text-[11px] text-muted">{k.s}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded border border-border-subtle bg-card p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Thermometer size={15} /> Architectural Spatial Blueprint: Room #B-204</h3>
                    <span className="apex-id text-xs text-muted">Vector Layer: Level -2.000m · Scale: 1:50</span>
                  </div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Blueprint layers">
                    {([['hvac', 'HVAC Ducts'], ['elec', 'Electrical'], ['fire', 'Fire Safety']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}
                        aria-pressed={layers[k]}
                        className={cn('h-8 px-3 rounded text-xs font-semibold border', layers[k] ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}
                      >
                        {label}
                      </button>
                    ))}
                    <span className="apex-id text-xs text-muted font-bold ml-auto self-center">BIM reference (design only — not connected)</span>
                  </div>
                  <svg viewBox="0 0 720 260" role="img" aria-label="Room B-204 equipment plan" className="w-full rounded border border-border-subtle bg-surface">
                    <rect x="8" y="8" width="704" height="244" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
                    {layers.hvac && (
                      <g stroke="#1E40AF" strokeWidth="2" strokeDasharray="8 5" fill="none" opacity="0.75">
                        <path d="M 20 60 H 700" />
                        <path d="M 20 200 H 700" />
                        <text x="24" y="52" fontSize="10" fill="#1E40AF" stroke="none">PRIMARY CHILLED WATER SUPPLY (DN300 / 7.1 BAR)</text>
                        <text x="24" y="222" fontSize="10" fill="#1E40AF" stroke="none">PRIMARY CHILLED WATER RETURN (DN300 / 6.2 BAR)</text>
                        <path d="M 560 60 V 24 H 690" />
                        <text x="566" y="20" fontSize="10" fill="#1E40AF" stroke="none">EXHAUST EXH-09 · 1,200 CFM</text>
                      </g>
                    )}
                    {layers.elec && (
                      <g stroke="#B45309" strokeWidth="2" fill="none" opacity="0.8">
                        <path d="M 620 240 V 120 H 700" />
                        <rect x="606" y="104" width="80" height="34" fill="#FEF3C7" stroke="#B45309" />
                        <text x="612" y="118" fontSize="10" fill="#92400E" stroke="none">MCC-B2-04</text>
                        <text x="612" y="130" fontSize="9" fill="#92400E" stroke="none">480V · FEED 2B</text>
                      </g>
                    )}
                    {layers.fire && (
                      <g fontSize="10" opacity="0.9">
                        <rect x="20" y="226" width="86" height="18" fill="#FEE2E2" stroke="#DC2626" />
                        <text x="26" y="239" fill="#991B1B">FIRE EXIT →</text>
                        <circle cx="660" cy="236" r="9" fill="#DBEAFE" stroke="#1E40AF" />
                        <text x="652" y="240" fill="#1E40AF">EW</text>
                        <rect x="330" y="226" width="120" height="18" fill="#FEF3C7" stroke="#B45309" />
                        <text x="336" y="239" fill="#92400E">LOTO LOCKOUT #4</text>
                      </g>
                    )}
                    <g fontSize="11" fontWeight="bold">
                      <g onClick={() => setNode('ch3')} className="cursor-pointer">
                        <rect x="40" y="80" width="150" height="52" rx="6" fill={node === 'ch3' ? '#DBEAFE' : '#F8FAFC'} stroke="#16A34A" strokeWidth="2" />
                        <text x="50" y="100" fill="#0F172A">CHILLER #03</text>
                        <text x="50" y="116" fontSize="10" fontWeight="normal" fill="#475569">AST-HVAC-003 · 96%</text>
                      </g>
                      <g onClick={() => setNode('ch4')} className="cursor-pointer">
                        <rect x="210" y="80" width="170" height="52" rx="6" fill={node === 'ch4' ? '#FEE2E2' : '#FFF7ED'} stroke="#DC2626" strokeWidth="2.5" />
                        <text x="220" y="100" fill="#991B1B">CHILLER #04 ★</text>
                        <text x="220" y="116" fontSize="10" fontWeight="normal" fill="#991B1B">{CANON.workOrderSeal}</text>
                      </g>
                      <g onClick={() => setNode('p101')} className="cursor-pointer">
                        <circle cx="470" cy="106" r="26" fill={node === 'p101' ? '#DBEAFE' : '#F8FAFC'} stroke="#16A34A" strokeWidth="2" />
                        <text x="444" y="110" fontSize="10" fill="#0F172A">P-101</text>
                      </g>
                      <g onClick={() => setNode('p102')} className="cursor-pointer">
                        <circle cx="540" cy="106" r="26" fill={node === 'p102' ? '#FEF3C7' : '#F8FAFC'} stroke="#B45309" strokeWidth="2" strokeDasharray="5 4" />
                        <text x="514" y="110" fontSize="10" fill="#0F172A">P-102</text>
                      </g>
                      <g onClick={() => setNode('v42')} className="cursor-pointer">
                        <rect x="440" y="150" width="120" height="30" rx="4" fill={node === 'v42' ? '#DBEAFE' : '#F8FAFC'} stroke="#1E40AF" strokeWidth="2" />
                        <text x="450" y="169" fontSize="10" fill="#0F172A">VALV-042 DN300</text>
                      </g>
                      <rect x="40" y="150" width="150" height="26" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeDasharray="4 4" />
                      <text x="50" y="167" fontSize="10" fontWeight="normal" fill="currentColor" opacity="0.7">MAIN ACCESS DOOR</text>
                    </g>
                  </svg>
                  <div className="flex flex-wrap items-center gap-2 text-[13px]" role="status">
                    <Badge variant={nodeTone(NODES[node].tone)}>{NODES[node].tone === 'critical' ? 'Critical Active (1)' : NODES[node].tone === 'standby' ? 'Standby (1)' : 'Nominal (6)'}</Badge>
                    <span className="apex-id font-bold">{NODES[node].label}</span>
                    <span className="text-muted">· {NODES[node].sub}</span>
                    <span className="apex-id text-xs text-muted ml-auto">Heatmap: R-134a 142 PPM</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-dashed border-border-strong bg-card p-6 text-center flex flex-col gap-1 items-center">
                <MapPin size={22} className="text-muted" />
                <p className="text-sm font-semibold">{selRoom.id} {selRoom.name} — structural node</p>
                <p className="text-[13px] text-muted">{selRoom.counts} · sensor pack, blueprint &amp; WO queue only seeded for #B-204.</p>
                <Button variant="secondary" onClick={() => setRoom('#B-204')}>Back to #B-204</Button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Installed Assets in Room <span className="text-xs font-normal text-muted">4 Linked</span></h2>
              <Dialog open={reOpen} onOpenChange={setReOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary">Reassign / Transfer</Button>
                </DialogTrigger>
                <DialogContent aria-labelledby="re-h">
                  <DialogTitle id="re-h">Reassign / Transfer Asset</DialogTitle>
                  <DialogDescription>Stages a room-to-room move — receiving confirm + ledger move follow.</DialogDescription>
                  <label className="text-xs font-semibold" htmlFor="re-asset">Asset</label>
                  <select id="re-asset" value={reAsset} onChange={(e) => setReAsset(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card apex-id">
                    {[CANON.assetSeal, 'AST-HVAC-003', 'AST-PUMP-101', 'AST-PUMP-102', 'AST-VALV-042'].map((a) => <option key={a}>{a}</option>)}
                  </select>
                  <label className="text-xs font-semibold" htmlFor="re-dest">Destination room</label>
                  <select id="re-dest" value={reDest} onChange={(e) => setReDest(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['#B-201 Emer Gen Vault', '#B-208 Primary Pump Bay', '#B-212 Chemical Dosing'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setReOpen(false)}>Cancel</Button>
                    <Button onClick={() => void reassign()} disabled={posting}>{posting ? 'Posting…' : 'Stage Transfer'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-muted border-b border-border-subtle"><th className="py-1 font-semibold">Asset Tag / Name</th><th className="font-semibold">Classification</th><th className="font-semibold">Operational Status</th><th className="text-right font-semibold">Health Score</th></tr></thead>
              <tbody>
                <tr className="border-b border-surface-subtle">
                  <td className="py-1.5"><Link className="apex-id font-bold text-cobalt hover:underline" href={`/assets/${CANON.assetSeal}`}>{CANON.assetSeal}</Link><p className="text-xs text-muted">Centrifugal Water Chiller 450-TR</p></td>
                  <td>Critical Class A</td>
                  <td><Badge variant="fail">P1 Warning</Badge></td>
                  <td className="text-right apex-id font-bold text-fail">{CANON.assetHealth}/100 <span className="text-[10px] font-normal">C5 — donut 88 fixed</span></td>
                </tr>
                <tr className="border-b border-surface-subtle">
                  <td className="py-1.5"><span className="apex-id font-bold">AST-PUMP-101</span><p className="text-xs text-muted">Primary Chilled Water Pump 75HP</p></td>
                  <td>Standard Class B</td>
                  <td><Badge variant="pass">Running Nominal</Badge></td>
                  <td className="text-right apex-id font-bold">96.8%</td>
                </tr>
                <tr className="border-b border-surface-subtle">
                  <td className="py-1.5"><span className="apex-id font-bold">AST-PUMP-102</span><p className="text-xs text-muted">Primary Chilled Water Standby Pump</p></td>
                  <td>Standard Class B</td>
                  <td><Badge variant="warn">Standby / Ready</Badge></td>
                  <td className="text-right apex-id font-bold">99.1%</td>
                </tr>
                <tr className="border-b border-surface-subtle">
                  <td className="py-1.5"><span className="apex-id font-bold">AST-VALV-042</span><p className="text-xs text-muted">Main Header Motorized Butterfly Valve</p></td>
                  <td>Safety Critical</td>
                  <td><Badge variant="pass">Operational</Badge></td>
                  <td className="text-right apex-id font-bold">94.2%</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted">Showing 4 of 8 total mapped assets for Room #B-204 · <Link className="text-cobalt font-semibold hover:underline" href="/assets">View All 8 in Asset Registry →</Link></p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Active Work Orders &amp; Defects <span className="text-xs font-normal text-muted">{2 + defects.length} Open</span></h2>
                <Dialog open={defOpen} onOpenChange={setDefOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary"><Plus size={16} /> Log Defect</Button>
                  </DialogTrigger>
                  <DialogContent aria-labelledby="def-h">
                    <DialogTitle id="def-h">Log Defect — Room #B-204</DialogTitle>
                    <DialogDescription>Queues a room defect to triage (min 10 chars).</DialogDescription>
                    <label className="text-xs font-semibold" htmlFor="def-text">Defect description</label>
                    <textarea id="def-text" rows={3} value={defText} onChange={(e) => setDefText(e.target.value)} className="w-full p-3 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt" placeholder="e.g. Condensate weeping at DN300 return flange…" />
                    {defTouched && defText.trim().length < 10 && <p className="text-[11px] font-semibold text-fail">Min 10 chars — {10 - defText.trim().length} more needed.</p>}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setDefOpen(false)}>Cancel</Button>
                      <Button onClick={() => void logDefect()} disabled={posting}>{posting ? 'Posting…' : 'Queue Defect'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <ul className="flex flex-col gap-2 text-[13px]">
                <li className="rounded border border-fail bg-card p-3 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="fail">P1 CRITICAL</Badge>
                    <span className="apex-id font-bold text-fail">SLA Breach in 42m</span>
                  </div>
                  <p><Link className="apex-id font-bold text-cobalt hover:underline" href={`/work-orders/${CANON.workOrderSeal}`}>{CANON.workOrderSeal}</Link> <span className="apex-id text-muted">· {CANON.assetSeal}</span></p>
                  <p className="font-semibold">Chiller #04 Shaft Seal Refrigerant Leak</p>
                  <p className="text-muted text-xs">M. Kowalski (HVAC Lead) · <span className="font-bold text-cobalt">In Progress</span></p>
                </li>
                <li className="rounded border border-border-subtle bg-card p-3 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">P3 ROUTINE</Badge>
                    <span className="apex-id text-muted">Due Tomorrow 18:00 WIB</span>
                  </div>
                  <p><span className="apex-id font-bold">WO-2026-0881</span> <span className="apex-id text-muted">· AST-VALV-042</span></p>
                  <p className="font-semibold">Semi-Annual Calibration of Pressure Relief Valve</p>
                  <p className="text-muted text-xs">Assigned: Shift Delta Team · Scheduled</p>
                </li>
                {facLive && canonFacility && canonFacility.defects.map((d, i) => (
                  <li key={`srv-${i}`} className="rounded border border-cobalt-deep bg-card p-3 text-[13px]">
                    <Badge variant="info">SERVER</Badge> <span className="font-medium">{d.text}</span>
                    <span className="apex-id text-muted text-xs"> · {d.by} · {d.at.replace('T', ' ').slice(0, 16)} UTC</span>
                  </li>
                ))}
                {defects.map((d, i) => (
                  <li key={i} className="rounded border border-warn bg-card p-3 text-[13px]">
                    <Badge variant="warn">LOGGED — LOCAL STAGING</Badge> <span className="font-medium">{d}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-muted">Audit <span className="apex-id font-bold text-cobalt">{CANON.template}</span> · Completed today at 09:15 UTC · 3/4 passed · <span className="font-bold text-warn">1 Defect</span></p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <h2 className="text-base font-semibold">Universal Cascading Location Selector</h2>
              <p className="text-[13px] text-muted -mt-1">Global spatial switch for dispatchers, technicians, and telemetry views.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[13px]">
                {([['c', 'Level 1: Campus / Site', SEL_CAMPUSES], ['b', 'Level 2: Building / Complex', SEL_BUILDINGS], ['f', 'Level 3: Floor / Spatial Level', SEL_FLOORS], ['r', 'Level 4: Room / Equipment Bay', SEL_ROOMS]] as const).map(([k, label, opts]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor={`sel-${k}`}>{label}</label>
                    <select id={`sel-${k}`} value={sel[k]} onChange={(e) => setSel((s) => ({ ...s, [k]: Number(e.target.value) }))} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {opts.map((o, i) => <option key={o} value={i}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-[13px]" role="status">
                Selected: <strong>{selCounts}</strong> · Node: <strong className="apex-id">{selIsB204 ? 'LOC-B2-MECH-204' : 'unseeded'}</strong>
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setSel({ c: 0, b: 1, f: 2, r: 1 })}>Cancel</Button>
                <Button onClick={() => push(true, 'Spatial filter applied', `${SEL_ROOMS[sel.r]} · ${selCounts} · dashboard views scoped.`)}>Apply Filter Across Dashboard</Button>
              </div>
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
