'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bolt,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudCog,
  Download,
  Eye,
  GripVertical,
  Layers,
  MoreVertical,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Radar,
  Smartphone,
  TrendingUp,
  Upload,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CANON } from '@/lib/canon';
import { ApiError, apiFetch } from '@/lib/api/client';


type QueueTab = 'all' | 'today' | 'overdue' | 'completed' | 'templates';

interface AuditItem {
  id: string;
  name: string;
  assetId: string;
  zone: string;
  dueText: string;
  dueSub: string;
  assignee: string;
  assigneeRole: string;
  assigneeInitials: string;
  status: 'IN_PROGRESS' | 'OVERDUE' | 'SCHEDULED' | 'FINDINGS' | 'READY' | 'COMPLETED';
  progress?: number;
  findingsCount?: number;
}

interface ServerInspection {
  number: string;
  title: string;
  auditorName: string;
  progressPct: number;
  status: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function toHubRow(r: ServerInspection): AuditItem {
  const st = r.status.toUpperCase();
  const status: AuditItem['status'] =
    st === 'IN_PROGRESS' ? 'IN_PROGRESS'
    : st === 'OVERDUE' ? 'OVERDUE'
    : st === 'COMPLETED' ? 'COMPLETED'
    : 'SCHEDULED';
  return {
    id: r.number,
    name: r.title,
    assetId: '—',
    zone: 'Server record',
    dueText: status === 'COMPLETED' ? 'Completed' : status === 'OVERDUE' ? 'Overdue' : status === 'IN_PROGRESS' ? 'Today' : 'Scheduled',
    dueSub: `progress ${r.progressPct}%`,
    assignee: r.auditorName,
    assigneeRole: 'Field Tech',
    assigneeInitials: initialsOf(r.auditorName),
    status,
    progress: r.progressPct,
  };
}

const INITIAL_AUDITS: AuditItem[] = [
  {
    id: CANON.inspection,
    name: 'Chiller Plant Pre-Shift Safety & Pressure Audit',
    assetId: CANON.assetSeal,
    zone: 'Basement Mech Room B-204',
    dueText: 'Today 16:00',
    dueSub: 'Due in 45m',
    assignee: 'M. Kowalski',
    assigneeRole: 'Lead Tech',
    assigneeInitials: 'MK',
    status: 'IN_PROGRESS',
    progress: CANON.inspectionProgress,
  },
  {
    id: 'INS-2026-0409',
    name: 'Emergency Generator Fuel & Battery System Run Test',
    assetId: 'AST-GEN-01',
    zone: 'Sub-Basement Vault',
    dueText: 'Overdue',
    dueSub: 'Lapsed 3h ago',
    assignee: 'T. Chen',
    assigneeRole: 'Apprentice',
    assigneeInitials: 'TC',
    status: 'OVERDUE',
  },
  {
    id: 'INS-2026-0415',
    name: 'Cleanroom ISO Class 5 HEPA Filter & Diff Pressure',
    assetId: 'AST-ENV-108',
    zone: 'Clean Lab Annex 4',
    dueText: 'Tomorrow 08:30',
    dueSub: 'Shift 1 Standard',
    assignee: 'E. Rostova',
    assigneeRole: 'Bio-Facility',
    assigneeInitials: 'ER',
    status: 'SCHEDULED',
  },
  {
    id: 'INS-2026-0398',
    name: 'Substation HV Switchgear Infrared Thermography',
    assetId: 'AST-ELEC-01',
    zone: 'Grid Substation Yard',
    dueText: 'Completed',
    dueSub: 'Today 10:15 UTC',
    assignee: 'M. Kowalski',
    assigneeRole: 'PE Inspector',
    assigneeInitials: 'MK',
    status: 'FINDINGS',
    findingsCount: 2,
  },
  {
    id: 'INS-2026-0420',
    name: 'Fire Suppression FM-200 Bottle Weight & Actuator Audit',
    assetId: 'ZONE-DC-04',
    zone: 'Raised Floor Data Center',
    dueText: 'Scheduled',
    dueSub: 'Feb 18, 09:00',
    assignee: 'R. Davies',
    assigneeRole: 'Gov PE',
    assigneeInitials: 'RD',
    status: 'READY',
  },
];

interface ChecklistStep {
  seq: number;
  title: string;
  type: 'Binary P/F' | 'Numeric Bound' | 'Mandatory Media' | 'IoT Auto-Populate';
  description: string;
  logic: string;
  val?: string;
  min?: number;
  max?: number;
  unit?: string;
  shotReq?: number;
  iotChannel?: string;
}

const INITIAL_STEPS: ChecklistStep[] = [
  {
    seq: 1,
    title: 'Emergency Stop & LOTO Lock Guard Integrity',
    type: 'Binary P/F',
    description: 'Verify mechanical trip switch, padlocks, and hazardous energy lock-out tag-out labels are intact.',
    logic: 'If FAIL: Auto-Flag Critical & Force Hazard Photo',
  },
  {
    seq: 2,
    title: 'Compressor Suction Pressure Reading',
    type: 'Numeric Bound',
    description: 'Manifold gauge suction pressure reading while running at 100% stage modulation.',
    logic: 'Out-of-bounds trigger automatic WO Creation',
    min: 110,
    max: 130,
    unit: 'PSI',
    val: '122.0',
  },
  {
    seq: 3,
    title: 'Sight Glass Bubble Check & Moisture Indicator',
    type: 'Mandatory Media',
    description: 'Inspect liquid line sight glass. Verify pure liquid state (no bubbles) and dry indicator color.',
    logic: 'Technician GPS Geotag & Time Stamp Watermarked',
    shotReq: 1,
  },
  {
    seq: 4,
    title: 'Operating Run Hours & Delta-T Reading',
    type: 'IoT Auto-Populate',
    description: 'Asset AST-HVAC-004 Telemetry Live Poll',
    logic: 'Auto-Attached via Gateway Link',
    iotChannel: 'Modbus Channel 40112 (Chilled Water Delta-T)',
    val: 'ΔT = 9.8°F',
  },
];

interface Toast {
  id: number;
  ok: boolean;
  title: string;
  msg: string;
}

let toastIdSeq = 3000;

export function FieldInspectionsHub() {
  const [tab, setTab] = useState<QueueTab>('all');
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('All Facilities');
  const [discipline, setDiscipline] = useState('All');
  const [audits, setAudits] = useState<AuditItem[]>(INITIAL_AUDITS);
  const [live, setLive] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>(INITIAL_STEPS);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepType, setNewStepType] = useState<ChecklistStep['type']>('Binary P/F');
  const [previewAudit, setPreviewAudit] = useState<AuditItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let alive = true;
    void apiFetch<{ rows: ServerInspection[]; total: number }>('/api/inspections')
      .then((res) => {
        if (!alive) return;
        if (res.rows.length > 0) setAudits(res.rows.map(toHubRow));
        setLive(true);
      })
      .catch(() => {
        if (!alive) return;
        setLive(false);
        pushToast(false, 'Offline', 'Inspection queue served from demo fallback.');
      });
    return () => { alive = false; };
  }, []);

  const pushToast = (ok: boolean, title: string, msg: string) => {
    const id = toastIdSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };

  const handleForceDispatch = async (auditId: string) => {
    if (dispatching) return;
    setDispatching(auditId);
    try {
      const data = await apiFetch<{ number: string; status: string; progressPct: number }>(
        `/api/inspections/${auditId}/force-dispatch`,
        { method: 'POST', body: {} },
      );
      setAudits((prev) =>
        prev.map((a) =>
          a.id === auditId
            ? { ...a, status: 'IN_PROGRESS', progress: data.progressPct, dueText: 'Today 17:00', dueSub: 'dispatched by server' }
            : a
        )
      );
      pushToast(true, 'Force Dispatch Executed', `Audit ${data.number} escalated to IN_PROGRESS (server-confirmed).`);
    } catch (err) {
      pushToast(false, 'Force Dispatch Failed', err instanceof ApiError ? `${err.message} (${err.code})` : 'Unknown dispatch failure.');
    } finally {
      setDispatching(null);
    }
  };

  const handleSaveDraft = () => {
    pushToast(true, 'Template Draft Saved', 'Protocol TMPL-HVAC-CHL-02 v2.4 saved to local draft storage.');
  };

  const handlePublishTemplate = () => {
    pushToast(true, 'Protocol Published', 'Template TMPL-HVAC-CHL-02 v2.4 is now LIVE for all mobile technicians.');
  };

  const handleAddStep = () => {
    if (!newStepTitle.trim()) return;
    const nextSeq = steps.length + 1;
    const newStep: ChecklistStep = {
      seq: nextSeq,
      title: newStepTitle,
      type: newStepType,
      description: 'Mandatory verification step configured by lead engineer.',
      logic: newStepType === 'Binary P/F' ? 'If FAIL: Auto-Flag Critical' : 'Strict threshold validation enforced',
    };
    setSteps([...steps, newStep]);
    setNewStepTitle('');
    setAddStepOpen(false);
    pushToast(true, 'Step Added', `Step 0${nextSeq} added to protocol draft.`);
  };

  const filteredAudits = audits.filter((a) => {
    if (tab === 'today' && !a.dueText.toLowerCase().includes('today') && !a.dueSub.toLowerCase().includes('45m')) return false;
    if (tab === 'overdue' && a.status !== 'OVERDUE') return false;
    if (tab === 'completed' && a.status !== 'FINDINGS' && a.status !== 'COMPLETED') return false;
    if (zone !== 'All Facilities' && !a.zone.includes(zone)) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${a.id} ${a.name} ${a.assetId} ${a.assignee} ${a.zone}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* 1. Top Sub-header Context Bar */}
      <section className="flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Home
          </Link>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Core Operations</span>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Field Inspections</span>
          <span>/</span>
          <span className="font-semibold text-body">Audit Queue &amp; Template Builder</span>
        </nav>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pt-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display">
                Inspection &amp; Audit Engine
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border-subtle text-muted text-[11px] font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass animate-ping" />
                  Live Poll: 15s
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink text-[11px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass" />
                  Audit Compliance: 98.2%
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink text-[11px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-fail" />
                  Pending Field Audits: 7 Queued
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-cobalt-tint text-cobalt-deep text-[11px] font-mono font-semibold">
                  Engine: v4.8 Active
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => pushToast(true, 'Audit Log Exported', 'CSV manifest of 18 scheduled audits downloaded.')}
              className="h-9 gap-1.5 text-xs"
            >
              <Download size={14} /> Export Audit Log
            </Button>

            <Link href="/shifts/plan">
              <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                <RefreshCw size={14} /> Shift Handover
              </Button>
            </Link>

            {/* Create Template Dialog */}
            <Dialog open={createTemplateOpen} onOpenChange={setCreateTemplateOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                  <PlusCircle size={14} /> + Create Inspection Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Create Inspection Protocol Template</DialogTitle>
                <DialogDescription>
                  Define a new standardized checklist protocol for technician tablet execution.
                </DialogDescription>
                <div className="space-y-3 my-2 text-xs">
                  <div>
                    <label className="font-semibold block mb-1">Protocol Title</label>
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="e.g. Chiller Condenser Tube Annual Inspection"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Asset Category</label>
                    <select className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card">
                      <option>Industrial Water Chillers &amp; Central Plant</option>
                      <option>Emergency Diesel Generators &amp; ATS</option>
                      <option>High Voltage Substation &amp; Transformers</option>
                      <option>Fire &amp; Life Safety Sprinkler Systems</option>
                      <option>Cleanroom HVAC &amp; Bio-Env</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setCreateTemplateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setCreateTemplateOpen(false);
                      pushToast(true, 'Template Initialized', `Draft protocol [${newTemplateName || 'New Protocol'}] created.`);
                    }}
                  >
                    Create Draft
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {/* 2. Top KPI Metric Cards (4 Bento Tiles) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Inspection KPIs">
        {/* KPI 1 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Inspection Protocols</span>
            <ClipboardCheck size={18} className="text-cobalt" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-ink tabular-nums">24</span>
            <span className="text-xs text-muted font-medium">Protocols</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span className="flex items-center gap-1 text-body">
              <span className="w-1.5 h-1.5 rounded-full bg-cobalt" />
              100% Mapped
            </span>
            <span className="text-pass-ink font-semibold">+2 New (M-T-D)</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Inspection Compliance SLA</span>
            <CheckCircle2 size={18} className="text-pass" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-pass-ink tabular-nums">98.2%</span>
            <span className="text-xs font-semibold text-pass-ink">PASS</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>Target: <strong className="text-body font-mono">95.0%</strong></span>
            <span className="text-pass-ink font-semibold flex items-center gap-0.5">
              <TrendingUp size={12} /> On Track (+3.2%)
            </span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Defects / Failed Checks (7d)</span>
            <AlertOctagon size={18} className="text-fail" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-fail tabular-nums">08</span>
            <span className="text-xs font-medium text-fail-ink">Critical Findings</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>6 Auto-Converted</span>
            <span className="px-1.5 py-0.5 rounded-full bg-fail-bg text-fail-ink font-semibold">2 Pending Triage</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Mobile Submissions Today</span>
            <Smartphone size={18} className="text-cobalt-deep" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-ink tabular-nums">14</span>
            <span className="text-xs text-muted font-medium">Completed Runs</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>Shift A: <strong className="text-body font-mono">9</strong> | B: <strong className="text-body font-mono">5</strong></span>
            <span className="text-pass-ink font-semibold flex items-center gap-1">
              <CloudCog size={12} /> Sync: demo KPI (not connected)
            </span>
          </div>
        </div>
      </section>

      {/* 3. Two-Column Workspace Layout (Split Grid 7 cols / 5 cols) */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Scheduled Inspections & Audit Queue */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          <div className="rounded-xl bg-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
            {/* Tab Bar & Filter Header */}
            <div className="p-4 bg-card flex flex-col gap-3 border-b border-border-subtle">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="text-cobalt-deep" size={18} />
                  <h2 className="text-sm font-bold text-ink">Scheduled Inspections &amp; Audit Queue</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle font-semibold">
                    Shift A: 07:00 - 15:30 WIB
                  </span>
                  <button
                    type="button"
                    onClick={() => pushToast(true, 'Queue Refreshed', 'Refreshed 18 scheduled inspection runs.')}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border-subtle hover:bg-surface text-muted hover:text-body"
                    title="Refresh Queue"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              {/* Queue Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    { id: 'all', label: 'All Audits (18)' },
                    { id: 'today', label: 'Today / Imminent (6)' },
                    { id: 'overdue', label: 'Overdue / SLA Risk (2)', alert: true },
                    { id: 'completed', label: 'Completed (10)' },
                    { id: 'templates', label: 'Templates & Forms' },
                  ] as Array<{ id: QueueTab; label: string; alert?: boolean }>
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5',
                      tab === t.id
                        ? t.alert
                          ? 'bg-fail text-white shadow-xs'
                          : 'bg-cobalt text-white shadow-xs'
                        : t.alert
                        ? 'bg-fail-bg text-fail-ink border border-fail/30'
                        : 'bg-surface hover:bg-surface-subtle text-body border border-border-subtle'
                    )}
                  >
                    {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Search & Filter Controls */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 pt-1">
                <div className="md:col-span-6 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search Audits, Assets, or Techs... (Ctrl+/)"
                    className="pl-8 pr-14 h-9 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-muted">
                    Ctrl + /
                  </span>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border-strong text-body text-xs rounded"
                  >
                    <option>Zone: All Facilities</option>
                    <option>Basement Mech Room B-204</option>
                    <option>Sub-Basement Vault</option>
                    <option>Clean Lab Annex 4</option>
                    <option>Grid Substation Yard</option>
                    <option>Raised Floor Data Center</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border-strong text-body text-xs rounded"
                  >
                    <option>Discipline: All</option>
                    <option>HVAC &amp; Chilled Water</option>
                    <option>Electrical &amp; Switchgear</option>
                    <option>Fire &amp; Life Safety</option>
                    <option>Cleanroom &amp; Bio-Env</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Data-Dense Audit Queue Table */}
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead>
                  <tr className="bg-surface text-muted text-[10px] font-bold uppercase tracking-wider border-b border-border-subtle">
                    <th className="py-2.5 px-3">Audit ID &amp; Name</th>
                    <th className="py-2.5 px-3">Target Asset / Zone</th>
                    <th className="py-2.5 px-3">Cadence / Due</th>
                    <th className="py-2.5 px-3">Auditor Assigned</th>
                    <th className="py-2.5 px-3">Status / Criticality</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredAudits.map((a) => (
                    <tr
                      key={a.id}
                      className={cn(
                        'transition-colors hover:bg-surface',
                        a.status === 'OVERDUE' && 'bg-fail-bg/30'
                      )}
                    >
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'font-mono text-xs font-bold',
                              a.status === 'OVERDUE' ? 'text-fail' : 'text-cobalt'
                            )}
                          >
                            {a.id}
                          </span>
                          <span className="font-semibold text-body truncate max-w-[200px]" title={a.name}>
                            {a.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <Link
                            href={`/assets/${a.assetId}`}
                            className="font-mono text-xs font-bold text-ink hover:underline"
                          >
                            {a.assetId}
                          </Link>
                          <span className="text-[11px] text-muted truncate max-w-[150px]">{a.zone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className={cn('font-semibold', a.status === 'OVERDUE' && 'text-fail')}>
                            {a.dueText}
                          </span>
                          <span className={cn('text-[10px] font-mono', a.status === 'OVERDUE' ? 'text-fail' : 'text-muted')}>
                            {a.dueSub}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-cobalt-deep text-white flex items-center justify-center text-[10px] font-bold">
                            {a.assigneeInitials}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-body">{a.assignee}</span>
                            <span className="text-[10px] text-muted">{a.assigneeRole}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {a.status === 'IN_PROGRESS' && (
                          <div className="flex flex-col gap-1 w-24">
                            <div className="flex items-center justify-between text-[10px] font-bold text-cobalt">
                              <span>IN PROGRESS</span>
                              <span>{a.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-subtle border border-border-subtle overflow-hidden">
                              <div className="h-full bg-cobalt rounded-full" style={{ width: `${a.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {a.status === 'OVERDUE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink font-mono text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-fail animate-pulse" /> OVERDUE
                          </span>
                        )}
                        {a.status === 'SCHEDULED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface border border-border-subtle text-muted font-mono text-[10px] font-semibold">
                            SCHEDULED
                          </span>
                        )}
                        {a.status === 'FINDINGS' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink font-mono text-[10px] font-bold">
                            <AlertTriangle size={11} /> {a.findingsCount} FINDINGS
                          </span>
                        )}
                        {a.status === 'READY' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink font-mono text-[10px] font-bold">
                            READY
                          </span>
                        )}
                        {a.status === 'COMPLETED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink font-mono text-[10px] font-bold">
                            <Check size={11} /> COMPLETED
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {a.status === 'IN_PROGRESS' && (
                          <Link href={`/field/audits/${a.id}/run`}>
                            <Button className="h-7 px-2.5 text-xs gap-1 bg-cobalt-deep hover:bg-cobalt text-white">
                              Open Run <Play size={11} />
                            </Button>
                          </Link>
                        )}
                        {a.status === 'OVERDUE' && (
                          <Button
                            variant="destructive"
                            onClick={() => void handleForceDispatch(a.id)}
                            disabled={dispatching === a.id}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            {dispatching === a.id ? 'Dispatching…' : 'Force Dispatch'} <Bolt size={11} />
                          </Button>
                        )}
                        {a.status === 'SCHEDULED' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Preview <Eye size={11} />
                          </Button>
                        )}
                        {a.status === 'FINDINGS' && (
                          <Link href="/field/findings/FND-2026-0188">
                            <Button variant="secondary" className="h-7 px-2.5 text-xs gap-1 text-fail hover:bg-fail-bg border-fail/30">
                              Review Findings <ArrowRight size={11} />
                            </Button>
                          </Link>
                        )}
                        {a.status === 'READY' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Details <ChevronRight size={11} />
                          </Button>
                        )}
                        {a.status === 'COMPLETED' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Review <Eye size={11} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination */}
            <div className="p-3 bg-surface border-t border-border-subtle flex items-center justify-between text-xs text-muted">
              <span>Showing {filteredAudits.length} of {audits.length} audits {live ? '(live server list)' : '(demo offline)'}</span>
              <div className="flex items-center gap-1 font-mono">
                <Button variant="secondary" className="h-7 px-2 text-xs" disabled>
                  Prev
                </Button>
                <span className="px-2 font-semibold text-body">Page 1 / 4</span>
                <Button variant="secondary" className="h-7 px-2 text-xs">
                  Next
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Telemetry & Field Sensor Livefeed Widget */}
          <div className="rounded-xl bg-card border border-border-subtle p-4 shadow-card flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cobalt-tint flex items-center justify-center text-cobalt">
                <Radar size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-ink">Substation IoT Gateway Link</span>
                <span className="text-[11px] font-mono text-muted">
                  Modbus TCP/IP (demo — not connected) · reference AST-ELEC-01 Bus Bar Temp (42.4°C Nom)
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-border-subtle border border-border-strong text-muted font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted" /> DEMO — NOT STREAMING
            </span>
          </div>
        </div>

        {/* Right Column (5 cols): Inspection Template Builder & Criteria Designer */}
        <div className="xl:col-span-5 flex flex-col gap-4">
          <div className="rounded-xl bg-card border border-border-subtle p-4 shadow-card flex flex-col">
            {/* Template Header / Meta */}
            <div className="pb-3 mb-3 border-b border-border-subtle flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cobalt-deep text-white font-mono text-[10px] font-bold">
                    TMPL-HVAC-CHL-02
                  </span>
                  <span className="font-mono text-[11px] text-muted">v2.4 Draft</span>
                </div>
                <h3 className="text-sm font-bold text-ink mt-1 font-display">
                  Central Chiller Safety &amp; Diagnostic Protocol
                </h3>
                <span className="text-[11px] text-muted">
                  Target Asset Category: Industrial Water Chillers &amp; Central Plant
                </span>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded border border-border-subtle flex items-center justify-center text-muted hover:text-body"
              >
                <MoreVertical size={16} />
              </button>
            </div>

            {/* Designer Instruction Bar */}
            <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-border-subtle mb-3 text-xs">
              <span className="text-muted flex items-center gap-1.5">
                <Layers size={14} className="text-cobalt" />
                <span>Technician Flow: <strong>{steps.length} Mandated Steps</strong></span>
              </span>
              <span className="text-pass-ink font-semibold font-mono text-[10px]">
                Logic Guardrails Active
              </span>
            </div>

            {/* Checklist Item Steps */}
            <div className="flex flex-col gap-3">
              {steps.map((st) => (
                <div
                  key={st.seq}
                  className="rounded-lg bg-surface border border-border-subtle p-3 flex flex-col gap-2 hover:border-cobalt/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <GripVertical size={14} className="text-muted cursor-grab" />
                      <span className="font-mono text-[11px] font-bold text-cobalt">
                        STEP 0{st.seq}
                      </span>
                      <span className="text-xs font-bold text-ink">{st.title}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-surface-subtle border border-border-subtle text-muted">
                      {st.type}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted ml-5">{st.description}</p>

                  {/* Step Interactive Specifics */}
                  {st.type === 'Binary P/F' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink font-bold text-[10px]">
                          PASS
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface text-muted font-medium text-[10px]">
                          FAIL
                        </span>
                      </div>
                      <span className="text-[10px] text-fail font-medium flex items-center gap-1">
                        <AlertTriangle size={11} /> {st.logic}
                      </span>
                    </div>
                  )}

                  {st.type === 'Numeric Bound' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-muted text-[11px]">
                          Guardrail: Min {st.min} {st.unit} — Max {st.max} {st.unit}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            disabled
                            value={st.val}
                            className="w-16 h-6 text-center font-mono text-xs font-bold bg-surface border border-border-subtle rounded"
                          />
                          <span className="text-muted text-[11px] font-mono">{st.unit}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-fail">{st.logic}</span>
                    </div>
                  )}

                  {st.type === 'Mandatory Media' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between text-xs">
                      <span className="text-muted text-[11px]">{st.logic}</span>
                      <span className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10px] font-semibold">
                        {st.shotReq} Shot Required
                      </span>
                    </div>
                  )}

                  {st.type === 'IoT Auto-Populate' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between text-xs font-mono">
                      <span className="text-muted text-[11px]">{st.iotChannel}</span>
                      <span className="text-pass-ink font-bold text-xs">{st.val}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Builder Control Actions */}
            <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-2 flex-wrap">
              {/* Add Step Dialog */}
              <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="h-8 px-2.5 text-xs gap-1">
                    <Plus size={13} /> + Add Checklist Step
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Add Verification Step</DialogTitle>
                  <DialogDescription>
                    Append a new verification checkpoint to the active protocol draft.
                  </DialogDescription>
                  <div className="space-y-3 my-2 text-xs">
                    <div>
                      <label className="font-semibold block mb-1">Step Title</label>
                      <Input
                        value={newStepTitle}
                        onChange={(e) => setNewStepTitle(e.target.value)}
                        placeholder="e.g. Check Oil Level & Color"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Step Type</label>
                      <select
                        value={newStepType}
                        onChange={(e) => setNewStepType(e.target.value as ChecklistStep['type'])}
                        className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card"
                      >
                        <option>Binary P/F</option>
                        <option>Numeric Bound</option>
                        <option>Mandatory Media</option>
                        <option>IoT Auto-Populate</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setAddStepOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddStep}>Add Step</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={handleSaveDraft} className="h-8 px-3 text-xs">
                  Save Draft
                </Button>
                <Button
                  onClick={handlePublishTemplate}
                  className="h-8 px-3 text-xs bg-cobalt-deep hover:bg-cobalt text-white gap-1"
                >
                  <Upload size={12} /> Publish Template (v2.4)
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Bottom Visual Anchor: Fast Links to Sub-desks */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Field Desks Fast Navigation">
        {/* Fast Link 1: Mobile Tablet Execution Desk */}
        <Link
          href="/field/audits"
          className="rounded-xl bg-card border border-border-subtle p-4 shadow-card hover:shadow-pop transition-all group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <Smartphone size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink group-hover:text-cobalt transition-colors font-display">
                  Mobile Tablet Execution View
                </h4>
                <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink font-mono text-[10px] font-bold">
                  Offline PWA Ready
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Open ruggedized technician inspection interface with barcode scanning &amp; photo logging.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted group-hover:text-cobalt group-hover:translate-x-1 transition-all" />
        </Link>

        {/* Fast Link 2: Auto-WO Conversion Desk */}
        <Link
          href="/field/findings/FND-2026-0188"
          className="rounded-xl bg-card border border-border-subtle p-4 shadow-card hover:shadow-pop transition-all group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-fail-bg text-fail flex items-center justify-center shrink-0">
              <Workflow size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink group-hover:text-fail transition-colors font-display">
                  Findings &amp; Auto-WO Conversion Desk
                </h4>
                <span className="px-2 py-0.5 rounded bg-fail text-white font-mono text-[10px] font-bold">
                  2 Action Required
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Triage failed inspection steps directly into prioritized Work Orders with assigned maintenance crews.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted group-hover:text-fail group-hover:translate-x-1 transition-all" />
        </Link>
      </section>

      {/* Preview Audit Dialog */}
      {previewAudit && (
        <Dialog open={!!previewAudit} onOpenChange={(open) => !open && setPreviewAudit(null)}>
          <DialogContent>
            <DialogTitle>Audit Protocol Preview</DialogTitle>
            <DialogDescription>
              {previewAudit.id} — {previewAudit.name}
            </DialogDescription>
            <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-2 my-2">
              <div className="flex justify-between">
                <span className="text-muted">Target Asset:</span>
                <span className="font-mono font-bold">{previewAudit.assetId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Zone:</span>
                <span>{previewAudit.zone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Assigned Auditor:</span>
                <span className="font-semibold">{previewAudit.assignee} ({previewAudit.assigneeRole})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Status:</span>
                <span className="font-mono font-bold text-cobalt">{previewAudit.status}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setPreviewAudit(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Floating Toasts */}
      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.ok ? 'status' : 'alert'}
            className={cn(
              'pointer-events-auto rounded-lg shadow-modal p-3 flex gap-3 items-start border',
              t.ok ? 'bg-pass-bg border-pass text-pass-ink' : 'bg-fail-bg border-fail text-fail-ink'
            )}
          >
            {t.ok ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            ) : (
              <XCircle size={16} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold leading-tight">{t.title}</p>
              <p className="text-[11px] leading-snug mt-0.5 opacity-90">{t.msg}</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="opacity-70 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
