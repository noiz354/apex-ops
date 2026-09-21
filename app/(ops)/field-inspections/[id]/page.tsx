import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  Play,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';

interface AuditDetail {
  id: string;
  name: string;
  assetId: string;
  assetName: string;
  zone: string;
  cadence: string;
  dueAt: string;
  auditor: string;
  auditorRole: string;
  status: 'IN_PROGRESS' | 'OVERDUE' | 'SCHEDULED' | 'COMPLETED';
  progress: number;
  templateId: string;
  templateVersion: string;
  steps: Array<{
    seq: number;
    title: string;
    type: string;
    status: 'PASS' | 'FAIL' | 'PENDING';
    value?: string;
  }>;
}

const AUDIT_DETAILS: Record<string, AuditDetail> = {
  [CANON.inspection]: {
    id: CANON.inspection,
    name: 'Chiller Plant Pre-Shift Safety & Pressure Audit',
    assetId: CANON.assetSeal,
    assetName: 'Trane CVHE-500 Centrifugal Chiller #04',
    zone: 'Basement Mech Room B-204',
    cadence: 'Daily Pre-Shift Walkdown',
    dueAt: 'Today 16:00 (45m remaining)',
    auditor: 'Marcus Kowalski',
    auditorRole: 'HVAC Lead Specialist',
    status: 'IN_PROGRESS',
    progress: CANON.inspectionProgress,
    templateId: 'TMPL-HVAC-CHL-02',
    templateVersion: 'v2.4',
    steps: [
      { seq: 1, title: 'Emergency Stop & LOTO Lock Guard Integrity', type: 'Binary P/F', status: 'PASS' },
      { seq: 2, title: 'Compressor Suction Pressure Reading', type: 'Numeric Bound', status: 'PASS', value: '122.0 PSI' },
      { seq: 3, title: 'Sight Glass Bubble Check & Moisture Indicator', type: 'Mandatory Media', status: 'PENDING' },
      { seq: 4, title: 'Operating Run Hours & Delta-T Reading', type: 'IoT Auto-Populate', status: 'PENDING', value: 'ΔT = 9.8°F' },
    ],
  },
  'INS-2026-0409': {
    id: 'INS-2026-0409',
    name: 'Emergency Generator Fuel & Battery System Run Test',
    assetId: 'AST-GEN-01',
    assetName: 'Cummins QSK60 Emergency Diesel Generator #01',
    zone: 'Sub-Basement Vault #02',
    cadence: 'Weekly Generator Run Test',
    dueAt: 'Overdue (Lapsed 3h ago)',
    auditor: 'T. Chen',
    auditorRole: 'Electrical Apprentice',
    status: 'OVERDUE',
    progress: 0,
    templateId: 'TMPL-GEN-PWR-01',
    templateVersion: 'v1.8',
    steps: [
      { seq: 1, title: 'Fuel Day-Tank Level & Float Switch', type: 'Binary P/F', status: 'PENDING' },
      { seq: 2, title: 'Starter Battery Float Voltage', type: 'Numeric Bound', status: 'PENDING', value: '21.4 VDC' },
      { seq: 3, title: 'Transfer Switch Automatic Trip Test', type: 'Binary P/F', status: 'PENDING' },
    ],
  },
  'INS-2026-0415': {
    id: 'INS-2026-0415',
    name: 'Cleanroom ISO Class 5 HEPA Filter & Diff Pressure',
    assetId: 'AST-ENV-108',
    assetName: 'Camfil CamCleaner Cleanroom AHU #12',
    zone: 'Clean Lab Annex 4',
    cadence: 'Bi-Weekly Cleanroom Certification',
    dueAt: 'Tomorrow 08:30 (Shift 1)',
    auditor: 'Elena Rostova',
    auditorRole: 'Bio-Facility QA',
    status: 'SCHEDULED',
    progress: 0,
    templateId: 'TMPL-BIO-CLN-04',
    templateVersion: 'v3.1',
    steps: [
      { seq: 1, title: 'Airlock Positive Pressure Cascade Verification', type: 'Numeric Bound', status: 'PENDING' },
      { seq: 2, title: 'Stage 2 HEPA Differential Pressure Manometer', type: 'Numeric Bound', status: 'PENDING' },
      { seq: 3, title: 'Airborne Particle Concentration Sampling', type: 'Mandatory Media', status: 'PENDING' },
    ],
  },
  'INS-2026-0420': {
    id: 'INS-2026-0420',
    name: 'Fire Suppression FM-200 Bottle Weight & Actuator Audit',
    assetId: 'ZONE-DC-04',
    assetName: 'Data Center Raised Floor Pod 4',
    zone: 'Raised Floor Data Center',
    cadence: 'Monthly Fire Safety Verification',
    dueAt: 'Feb 18, 09:00',
    auditor: 'R. Davies',
    auditorRole: 'Gov PE Inspector',
    status: 'SCHEDULED',
    progress: 0,
    templateId: 'TMPL-FIRE-SUPP-02',
    templateVersion: 'v2.0',
    steps: [
      { seq: 1, title: 'FM-200 Storage Cylinder Weight Verification', type: 'Numeric Bound', status: 'PENDING' },
      { seq: 2, title: 'Pilot Solenoid Actuator Mechanical Pin Lock', type: 'Binary P/F', status: 'PENDING' },
      { seq: 3, title: 'VESDA Smoke Detector Laser Chamber Aspirator', type: 'Binary P/F', status: 'PENDING' },
    ],
  },
};

export default async function FieldInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = AUDIT_DETAILS[id] || {
    id,
    name: `Field Inspection ${id}`,
    assetId: CANON.assetSeal,
    assetName: 'Central Plant Equipment',
    zone: 'Main Facility',
    cadence: 'Standard Operational Audit',
    dueAt: 'Today',
    auditor: 'Field Inspector',
    auditorRole: 'Technician',
    status: 'IN_PROGRESS' as const,
    progress: 50,
    templateId: 'TMPL-GEN-01',
    templateVersion: 'v1.0',
    steps: [
      { seq: 1, title: 'General Visual Inspection & Safety Guard Check', type: 'Binary P/F', status: 'PASS' as const },
      { seq: 2, title: 'Operating Temperature & Vibration Check', type: 'Numeric Bound', status: 'PENDING' as const },
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
        <Link className="hover:text-cobalt transition-colors" href="/field-inspections">
          Field Inspections
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">{audit.id}</span>
      </nav>

      {/* Header */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <Layers size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-cobalt">{audit.id}</span>
                <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">{audit.name}</h1>
                <Badge
                  variant={
                    audit.status === 'OVERDUE'
                      ? 'fail'
                      : audit.status === 'IN_PROGRESS'
                      ? 'info'
                      : 'hold'
                  }
                >
                  {audit.status}
                </Badge>
              </div>
              <p className="text-xs text-muted font-mono mt-0.5">
                Template: {audit.templateId} {audit.templateVersion} · Cadence: {audit.cadence}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href={`/field/audits/${audit.id}/run`}>
              <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                <Play size={14} /> Open Mobile Execution Run
              </Button>
            </Link>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border-subtle text-xs">
          <div>
            <span className="text-muted text-[10px] uppercase font-bold block">Target Asset</span>
            <Link href={`/assets/${audit.assetId}`} className="font-mono font-bold text-sm text-cobalt hover:underline flex items-center gap-1">
              {audit.assetId} <ArrowRight size={12} />
            </Link>
            <span className="text-muted truncate block">{audit.assetName}</span>
          </div>

          <div>
            <span className="text-muted text-[10px] uppercase font-bold block">Zone / Location</span>
            <span className="font-semibold text-body text-sm">{audit.zone}</span>
          </div>

          <div>
            <span className="text-muted text-[10px] uppercase font-bold block">Assigned Auditor</span>
            <span className="font-semibold text-body text-sm">{audit.auditor}</span>
            <span className="text-muted text-[11px] block">{audit.auditorRole}</span>
          </div>

          <div>
            <span className="text-muted text-[10px] uppercase font-bold block">Timing / Due</span>
            <span className="font-semibold text-body text-sm">{audit.dueAt}</span>
            <span className="text-muted text-[11px] block">Progress: {audit.progress}%</span>
          </div>
        </div>
      </section>

      {/* Checklist Protocol Steps */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Checklist Verification Steps ({audit.steps.length})</h2>
          <span className="text-xs text-muted font-mono">Protocol ID: {audit.templateId}</span>
        </div>

        <div className="divide-y divide-border-subtle">
          {audit.steps.map((st) => (
            <div key={st.seq} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-surface border border-border-subtle font-mono text-xs font-bold flex items-center justify-center text-muted">
                  0{st.seq}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-ink">{st.title}</span>
                  <span className="text-[11px] text-muted font-mono">{st.type}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {st.value && (
                  <span className="font-mono text-xs font-bold text-body bg-surface px-2 py-0.5 rounded border border-border-subtle">
                    {st.value}
                  </span>
                )}
                <Badge variant={st.status === 'PASS' ? 'pass' : st.status === 'FAIL' ? 'fail' : 'hold'}>
                  {st.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/field-inspections">
          <Button variant="secondary" className="text-xs gap-1">
            <ArrowLeft size={14} /> Back to Scheduled Queue
          </Button>
        </Link>
        <Link href="/field/findings/FND-2026-0188">
          <Button variant="secondary" className="text-xs gap-1 text-fail border-fail/30">
            View Linked Findings <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </div>
  );
}
