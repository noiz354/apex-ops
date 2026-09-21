import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building,
  ClipboardList,
  Radio,
  Radar,
  Thermometer,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';

interface RoomDetail {
  id: string;
  name: string;
  building: string;
  floor: string;
  sqm: number;
  criticality: 'TIER_1_CRITICAL' | 'TIER_2_OPERATIONAL' | 'TIER_3_GENERAL';
  metrics: {
    temp: string;
    humidity: string;
    pressure: string;
    power: string;
  };
  assets: Array<{
    code: string;
    name: string;
    status: string;
    health: number;
  }>;
  activeWo?: {
    id: string;
    title: string;
    status: string;
  };
}

const ROOMS: Record<string, RoomDetail> = {
  'B-204': {
    id: 'B-204',
    name: 'Basement Mechanical Plant Room B-204',
    building: 'HQ Campus - East Wing (Nusantara Tower)',
    floor: 'Sub-Basement Level 2',
    sqm: 480,
    criticality: 'TIER_1_CRITICAL',
    metrics: {
      temp: '19.4°C (Nominal)',
      humidity: '45% RH',
      pressure: '+12 Pa (Positive)',
      power: '240 kW Load',
    },
    assets: [
      { code: CANON.assetSeal, name: 'Trane CVHE-500 Centrifugal Chiller #04', status: 'CRITICAL_DEFECT', health: 68 },
      { code: 'AST-PUMP-02', name: 'Primary Chilled Water Loop Pump #02', status: 'NOMINAL', health: 94 },
      { code: 'AST-VFD-04', name: 'Danfoss VLT 500kW Drive Inverter', status: 'NOMINAL', health: 91 },
    ],
    activeWo: {
      id: CANON.workOrderSeal,
      title: 'Emergency Chiller Shaft Seal Replacement & Overhaul',
      status: 'DISPATCHED',
    },
  },
  'ZONE-DC-04': {
    id: 'ZONE-DC-04',
    name: 'Raised Floor Data Center Pod 04',
    building: 'Nusantara Tech Center',
    floor: 'Floor 3',
    sqm: 320,
    criticality: 'TIER_1_CRITICAL',
    metrics: {
      temp: '21.0°C (Controlled)',
      humidity: '48% RH',
      pressure: '+25 Pa (Static)',
      power: '180 kW IT Load',
    },
    assets: [
      { code: 'AST-CRAC-01', name: 'Liebert Downflow CRAC Unit #01', status: 'NOMINAL', health: 98 },
      { code: 'AST-UPS-03', name: 'Eaton 93PM 200kVA Modular UPS', status: 'NOMINAL', health: 96 },
    ],
  },
};

export default async function FacilityRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const room = ROOMS[id] || {
    id,
    name: `Facility Room ${id}`,
    building: 'East Wing Campus',
    floor: 'Floor 1',
    sqm: 250,
    criticality: 'TIER_2_OPERATIONAL' as const,
    metrics: {
      temp: '22.1°C',
      humidity: '50% RH',
      pressure: '+5 Pa',
      power: '45 kW',
    },
    assets: [
      { code: CANON.assetSeal, name: 'Central Plant Equipment', status: 'NOMINAL', health: 85 },
    ],
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/facilities">
          Facility Locations
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">Room {room.id}</span>
      </nav>

      {/* Header */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <Building size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-cobalt">{room.id}</span>
                <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">{room.name}</h1>
                <Badge variant={room.criticality === 'TIER_1_CRITICAL' ? 'fail' : 'info'}>
                  {room.criticality}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {room.building} · {room.floor} · {room.sqm} m² Area
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/field-inspections/new?location=${encodeURIComponent(room.name)}&asset=${room.assets[0]?.code || ''}`}>
              <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                <ClipboardList size={14} /> Dispatch Room Audit
              </Button>
            </Link>
            <Link href="/field/findings/new">
              <Button variant="destructive" className="h-9 gap-1.5 text-xs">
                <AlertTriangle size={14} /> + Log Defect
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Telemetry Bento Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4" aria-label="Room telemetry">
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Ambient Temp</span>
            <span className="text-xl font-bold font-display text-ink tabular-nums">{room.metrics.temp}</span>
            <span className="text-[11px] text-pass-ink font-semibold block mt-0.5">SCADA Loop Active</span>
          </div>
          <Thermometer size={22} className="text-cobalt" />
        </div>

        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Relative Humidity</span>
            <span className="text-xl font-bold font-display text-ink tabular-nums">{room.metrics.humidity}</span>
            <span className="text-[11px] text-muted block mt-0.5">Condensation Safe</span>
          </div>
          <Activity size={22} className="text-pass" />
        </div>

        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Static Pressure</span>
            <span className="text-xl font-bold font-display text-ink tabular-nums">{room.metrics.pressure}</span>
            <span className="text-[11px] text-pass-ink font-semibold block mt-0.5">Barrier Maintained</span>
          </div>
          <Radar size={22} className="text-cobalt-deep" />
        </div>

        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Electrical Draw</span>
            <span className="text-xl font-bold font-display text-ink tabular-nums">{room.metrics.power}</span>
            <span className="text-[11px] text-muted block mt-0.5">Feeder SUB-01</span>
          </div>
          <Radio size={22} className="text-warn" />
        </div>
      </section>

      {/* Linked Assets Table */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Installed Assets ({room.assets.length})</h2>
          <Link href={`/assets?location=${encodeURIComponent(room.id)}`} className="text-xs font-semibold text-cobalt hover:underline">
            View in Asset Registry →
          </Link>
        </div>

        <div className="divide-y divide-border-subtle">
          {room.assets.map((ast) => (
            <div key={ast.code} className="py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-surface border border-border-subtle flex items-center justify-center font-mono text-xs font-bold text-muted">
                  AST
                </div>
                <div>
                  <Link href={`/assets/${ast.code}`} className="font-mono text-xs font-bold text-cobalt hover:underline">
                    {ast.code}
                  </Link>
                  <span className="text-xs font-semibold text-body block">{ast.name}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[11px] text-muted block">Health Score</span>
                  <span className="font-mono font-bold text-xs text-body">{ast.health}/100</span>
                </div>
                <Badge variant={ast.status === 'CRITICAL_DEFECT' ? 'fail' : 'pass'}>
                  {ast.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Active Work Order in Room */}
      {room.activeWo && (
        <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[10px] font-bold text-fail uppercase tracking-wider block">
              Active Emergency Work Order
            </span>
            <Link href={`/work-orders/${room.activeWo.id}`} className="font-mono font-bold text-sm text-cobalt hover:underline">
              {room.activeWo.id} — {room.activeWo.title}
            </Link>
            <span className="text-xs text-muted block mt-0.5">Technician crew on-site</span>
          </div>
          <Link href={`/work-orders/${room.activeWo.id}`}>
            <Button variant="secondary" className="text-xs gap-1">
              Open Work Order <ArrowRight size={13} />
            </Button>
          </Link>
        </section>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/facilities">
          <Button variant="secondary" className="text-xs gap-1">
            <ArrowLeft size={14} /> Back to Facility Hierarchy
          </Button>
        </Link>
      </div>
    </div>
  );
}
