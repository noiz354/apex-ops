'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANON, wibNow } from '@/lib/canon';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

type Layer = 'mech' | 'elec' | 'tele';
interface NodeInfo { sub: string; value: string; status: string; x: number; y: number; tone: 'alarm' | 'warn' | 'ok'; tagX: number; tagY: number }

const NODES: Record<string, NodeInfo> = {
  'TT-04A': { sub: 'Seal cavity temperature', value: '84.1°C', status: 'ALARM — above 80°C trip watch', x: 140, y: 180, tone: 'alarm', tagX: 156, tagY: 184 },
  'VT-04B': { sub: 'Bearing vibration', value: '7.8 mm/s', status: 'ALARM — at safety trip', x: 230, y: 180, tone: 'alarm', tagX: 246, tagY: 184 },
  'GS-04C': { sub: 'Refrigerant sniff R-134a', value: '18.4 ppm', status: 'WARNING — exceeds 5 ppm limit', x: 320, y: 250, tone: 'warn', tagX: 336, tagY: 254 },
  'PT-03A': { sub: 'Discharge pressure', value: '118 PSI', status: 'NOMINAL — envelope 110–130', x: 460, y: 180, tone: 'ok', tagX: 476, tagY: 184 },
  'EL-DP02': { sub: 'Panel DP-02 voltage', value: '0.0V', status: 'NOMINAL — LOTO verified #4092', x: 680, y: 180, tone: 'ok', tagX: 640, tagY: 210 },
};

const DOT = { alarm: '#DC2626', warn: '#D97706', ok: '#059669' } as const;
const TAG = { alarm: '#FCA5A5', warn: '#FCD34D', ok: '#6EE7B7' } as const;
const short = (id: string) => `${id} ${NODES[id].value.replace(' ', '')}`;

export function AssetBim({ assetId }: { assetId: string }) {
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ mech: true, elec: true, tele: true });
  const [node, setNode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updated, setUpdated] = useState('never — press Refresh Reading');
  const [liveCount, setLiveCount] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, { value: string; status: string; at: string }>>({});

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setNode(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);

  const toggle = (l: Layer) => setLayers((s) => ({ ...s, [l]: !s[l] }));

  const SENSOR_TO_NODE: Record<string, string> = {
    TEMPERATURE: 'TT-04A',
    VIBRATION: 'VT-04B',
    REFRIGERANT_PPM: 'GS-04C',
    PRESSURE_PSI: 'PT-03A',
    VOLTAGE_KV: 'EL-DP02',
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setLiveError(null);
    try {
      const readings = await apiFetch<Array<{ sensorType: string; value: string; unit: string; status: string; recordedAt: string }>>(
        `/api/telemetry/ingest?assetCode=${encodeURIComponent(assetId)}&limit=20`,
      );
      const mapped: Record<string, { value: string; status: string; at: string }> = {};
      for (const r of readings) {
        const nodeId = SENSOR_TO_NODE[r.sensorType];
        if (nodeId && !mapped[nodeId]) {
          mapped[nodeId] = { value: `${r.value} ${r.unit}`, status: r.status, at: r.recordedAt };
        }
      }
      setLiveValues(mapped);
      setLiveCount(Object.keys(mapped).length);
      const n = Object.keys(mapped).length;
      setUpdated(n > 0 ? `${wibNow()} WIB · ${n} live reading${n === 1 ? '' : 's'}` : 'no live readings — showing design reference values');
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : 'Refresh failed — showing design reference values.');
    } finally {
      setRefreshing(false);
    }
  };

  const pick = (id: string) => {
    setNode(id);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex items-center gap-2 text-sm min-w-0" aria-label="Breadcrumb">
          <Link
            href={`/assets/${assetId}`}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded bg-cobalt-tint"
            aria-label="Back to asset detail"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">BIM · <span className="apex-id text-cobalt-deep">{assetId}</span></h1>
            <p className="text-xs text-muted truncate">{CANON.assetOem} · CUP BASEMENT L2 · SECTOR WEST · schematic reference · {liveCount} live node{liveCount === 1 ? '' : 's'} via Refresh</p>
          </div>
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/work-orders/${CANON.workOrderSeal}`}
            className="hidden sm:inline-flex h-9 px-3 rounded bg-cobalt-tint text-sm font-semibold items-center gap-1"
          >
            <ClipboardList size={16} /> {CANON.workOrderSeal}
          </Link>
          <Link href="/assets">
            <Button>Registry</Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        <main className="flex-1 flex flex-col gap-3 min-w-0" aria-label="BIM viewport">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Layers">
            {([['mech', 'Mechanical'], ['elec', 'Electrical'], ['tele', 'Telemetry']] as [Layer, string][]).map(([l, label]) => (
              <button
                key={l}
                type="button"
                onClick={() => toggle(l)}
                aria-pressed={layers[l]}
                className={cn(
                  'h-9 px-3 rounded text-sm font-semibold',
                  layers[l] ? 'bg-cobalt-deep text-white' : 'bg-cobalt-tint text-ink'
                )}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-muted ml-auto">Click a node → detail drawer · ESC closes</span>
          </div>

          <div className="flex-1 min-h-[420px] bg-[#0B1C30] rounded-lg border border-[#0B1C30] overflow-hidden relative">
            <svg viewBox="0 0 800 460" className="w-full h-full" role="img" aria-label="Schematic plan of CUP basement L2 sector west">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="#1E293B" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="800" height="460" fill="#0B1C30" />
              <rect width="800" height="460" fill="url(#grid)" />
              <text x="24" y="34" fontFamily="JetBrains Mono" fontSize="12" fill="#93C5FD" letterSpacing="2">
                CUP BASEMENT L2 · SECTOR WEST · PLAN +2.40m
              </text>
              {layers.mech && (
                <g id="layer-mech">
                  <rect x="60" y="70" width="280" height="150" rx="6" fill="#13294B" stroke="#3B82F6" strokeWidth="2" />
                  <text x="80" y="100" fontFamily="Inter" fontSize="14" fontWeight="700" fill="#EAF1FF">CHILLER #04 [CRITICAL]</text>
                  <text x="80" y="120" fontFamily="JetBrains Mono" fontSize="11" fill="#93C5FD">{assetId} · {CANON.assetOem}</text>
                  <text x="80" y="140" fontFamily="JetBrains Mono" fontSize="11" fill="#F87171">SEAL REFRIG LEAK · {CANON.workOrderSeal}</text>
                  <rect x="380" y="70" width="200" height="150" rx="6" fill="#13294B" stroke="#334155" strokeWidth="2" />
                  <text x="400" y="100" fontFamily="Inter" fontSize="14" fontWeight="700" fill="#EAF1FF">CHILLER #03</text>
                  <text x="400" y="120" fontFamily="JetBrains Mono" fontSize="11" fill="#93C5FD">NOMINAL · 96.4% HX eff</text>
                  <line x1="90" y1="250" x2="550" y2="250" stroke="#1E40AF" strokeWidth="10" strokeLinecap="round" />
                  <line x1="90" y1="280" x2="550" y2="280" stroke="#00563A" strokeWidth="10" strokeLinecap="round" />
                  <text x="90" y="245" fontFamily="JetBrains Mono" fontSize="10" fill="#93C5FD">PRIMARY CHILLED WATER RETURN (DN300 / 6.2 BAR)</text>
                  <text x="90" y="305" fontFamily="JetBrains Mono" fontSize="10" fill="#5BCF9E">PRIMARY CHILLED WATER SUPPLY (DN300 / 7.1 BAR)</text>
                </g>
              )}
              {layers.elec && (
                <g id="layer-elec">
                  <rect x="620" y="70" width="120" height="150" rx="6" fill="#13294B" stroke="#F59E0B" strokeWidth="2" />
                  <text x="634" y="100" fontFamily="Inter" fontSize="13" fontWeight="700" fill="#EAF1FF">PANEL DP-02</text>
                  <text x="634" y="120" fontFamily="JetBrains Mono" fontSize="11" fill="#FCD34D">M-44 · #4092</text>
                  <text x="634" y="140" fontFamily="JetBrains Mono" fontSize="11" fill="#FCD34D">0.0V · LOTO</text>
                  <line x1="620" y1="145" x2="580" y2="145" stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 4" />
                </g>
              )}
              {layers.tele && (
                <g id="layer-tele" fontFamily="JetBrains Mono" fontSize="10">
                  {Object.entries(NODES).map(([id, n]) => (
                    <g
                      key={id}
                      className="cursor-pointer focus:outline-none focus-visible:[outline:2px_solid_#2563EB]"
                      tabIndex={0}
                      role="button"
                      aria-label={`Node ${id} ${n.sub}`}
                      onClick={() => pick(id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } }}
                    >
                      <circle cx={n.x} cy={n.y} r="10" fill={DOT[n.tone]} stroke="#fff" strokeWidth="2" />
                      <text x={n.tagX} y={n.tagY} fill={TAG[n.tone]}>{liveValues[id] ? `${id} ${liveValues[id].value.replace(' ', '')}` : short(id)}</text>
                    </g>
                  ))}
                </g>
              )}
              <text x="24" y="440" fontFamily="JetBrains Mono" fontSize="10" fill="#64748B">
                schematic reference · showing 5 reference nodes · live values via Refresh Reading
              </text>
            </svg>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-fail-bg text-fail-ink font-semibold"><span className="w-2 h-2 rounded-full bg-fail" />ALARM (2)</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-warn-bg text-warn-ink font-semibold"><span className="w-2 h-2 rounded-full bg-warn" />WARNING (1)</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-pass-bg text-pass-ink font-semibold"><span className="w-2 h-2 rounded-full bg-pass" />NOMINAL (35)</span>
            <span className="text-[11px] text-muted">reference distribution — live status per node after Refresh</span>
          </div>
        </main>

        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-border-subtle bg-card rounded-lg lg:rounded-none p-4 flex flex-col gap-3" aria-label="Node detail">
          {node === null ? (
            <div>
              <h2 className="text-base font-semibold">Node Detail</h2>
              <p className="text-sm text-muted">Select a telemetry node on the plan. Detail opens here (drawer pattern).</p>
              <Link className="text-sm font-semibold text-cobalt-deep hover:underline" href={`/assets/${assetId}`}>Open full asset ledger</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold apex-id">{node}</h2>
                  <p className="text-xs text-muted">{NODES[node].sub}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNode(null)}
                  className="w-9 h-9 flex items-center justify-center rounded bg-cobalt-tint"
                  aria-label="Close detail"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-3xl font-bold tabular-nums" role="status">{refreshing ? '…' : (liveValues[node]?.value ?? NODES[node].value)}</p>
              <p className="text-[11px] text-muted">{liveValues[node] ? `Live reading · ${liveValues[node].at}` : 'Design reference value — no live reading for this node yet'}</p>
              <ul className="text-sm flex flex-col gap-1">
                <li className="flex justify-between gap-2"><span className="text-muted">Status</span><strong>{liveValues[node]?.status ?? NODES[node].status}</strong></li>
                <li className="flex justify-between gap-2"><span className="text-muted">Asset</span><span className="apex-id">{assetId}</span></li>
                <li className="flex justify-between gap-2">
                  <span className="text-muted">Work order</span>
                  <Link className="apex-id text-cobalt-deep font-semibold hover:underline" href={`/work-orders/${CANON.workOrderSeal}`}>{CANON.workOrderSeal}</Link>
                </li>
                <li className="flex justify-between gap-2"><span className="text-muted">Updated</span><span>{updated}</span></li>
              </ul>
              <Button onClick={() => void refresh()} disabled={refreshing} className="h-10">
                {refreshing && <LoaderCircle size={16} className="animate-spin" />}
                Refresh Reading
              </Button>
              {liveError && <p className="text-[11px] font-semibold text-fail" role="alert">{liveError}</p>}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
