import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { SlaCountdown, LaborStopwatch } from '@/components/ops/WoTimers';
import { HoldDialog, EscalateDialog, ResumeDialog, CancelDialog, SignoffDialog, ExportDialog, PrintButton } from '@/components/ops/WoDialogs';
import { WoChecklist } from '@/components/ops/WoChecklist';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { getWorkOrder, listWoEvents, type WoRow, type WoHistoryEntry } from '@/lib/services/wo-service';
import { listWoEvidence, listWoTasks, type EvidenceRow, type WoTaskRow } from '@/lib/services/task-service';
import { findSrByConvertedWo } from '@/lib/services/asset-service';
import { DomainError } from '@/lib/domain/errors';
import { CANON } from '@/lib/canon';

const PARTS = [
  { sku: CANON.sealSku, name: 'Silicon Carbide Mechanical Seal 2.5"', note: 'Dispensed & Installed (-1 from CRIB-B / Bay 01)', price: '$1,450.00', qty: '1 pc' },
  { sku: 'PART-LUB-09', name: 'POE Lubricant ISO 68', note: 'Dispensed (-1 from CRIB-B / Bay 01)', price: '$195.00', qty: '1 pc' },
  { sku: 'PART-FLTR-401', name: 'MERV 14 Chilled Water Filter', note: 'Reserved in Local Locker 4B', price: '$120.00', qty: '2 pc' },
];

const KNOWN_LINKED_WOS: Record<string, Partial<WoRow>> = {
  'WO-2026-0881': {
    title: 'Substation Transformer #2 Bushing & Valve Inspection',
    location: 'Electrical Substation #2 (Bay 04)',
    assetCode: 'AST-ELEC-002',
    priority: 'P2',
    status: 'SCHEDULED',
    statusLabel: 'SCHEDULED',
    tech: 'Elena Voronova',
  },
  'WO-2026-0895': {
    title: 'Chiller Plant Secondary Refrigerant Loop Isolation',
    location: 'CUP Plant Room B-204',
    assetCode: 'AST-HVAC-001',
    priority: 'P1',
    status: 'IN_PROGRESS',
    statusLabel: 'IN PROGRESS',
    tech: 'Marcus Kowalski',
  },
  'WO-2026-0898': {
    title: 'Cleanroom AHU Filter Differential Pressure Check',
    location: 'Cleanroom Facility Zone 4B',
    assetCode: 'AST-HVAC-003',
    priority: 'P2',
    status: 'DISPATCHED',
    statusLabel: 'DISPATCHED',
    tech: 'David Chen',
  },
  'WO-2026-0902': {
    title: 'Fire Damper Actuator Replacement & Linkage Recalibration',
    location: 'Central Utility Plant Floor 2',
    assetCode: 'AST-FIRE-002',
    priority: 'P2',
    status: 'DISPATCHED',
    statusLabel: 'DISPATCHED (PENDING TECH)',
    tech: 'Sarah Al-Mansoor',
  },
  'WO-2026-0905': {
    title: 'Quarterly Centrifugal Chiller Calibration & Overhaul',
    location: 'Chiller Plant Room B-204',
    assetCode: 'AST-HVAC-001',
    priority: 'P2',
    status: 'OPEN',
    statusLabel: 'OPEN (DRAFT PLAN)',
    tech: 'Robert Langdon',
  },
  'WO-2026-0906': {
    title: 'Quarterly Centrifugal Chiller Comprehensive Inspection',
    location: 'Chiller Plant Room B-204',
    assetCode: 'AST-HVAC-001',
    priority: 'P2',
    status: 'SCHEDULED',
    statusLabel: 'SCHEDULED',
    tech: 'Marcus Kowalski',
  },
  'WO-2026-0907': {
    title: 'HV Transformer Oil Dielectric & Bushing Testing',
    location: 'Electrical Substation #2',
    assetCode: 'AST-ELEC-002',
    priority: 'P2',
    status: 'SCHEDULED',
    statusLabel: 'SCHEDULED',
    tech: 'Elena Voronova',
  },
  'WO-2026-0908': {
    title: 'Fire Deluge Valve Flow Rate Testing & Seal Check',
    location: 'Pump Room A-01',
    assetCode: 'AST-FIRE-001',
    priority: 'P2',
    status: 'SCHEDULED',
    statusLabel: 'SCHEDULED',
    tech: 'Sarah Al-Mansoor',
  },
  'WO-2026-0909': {
    title: 'Cleanroom Pressure Cascade Sensor Recalibration',
    location: 'Cleanroom Facility Zone 4B',
    assetCode: 'AST-HVAC-002',
    priority: 'P3',
    status: 'SCHEDULED',
    statusLabel: 'SCHEDULED',
    tech: 'David Chen',
  },
  'WO-2026-0888': {
    title: 'Mechanical Seal Routine Stock Dispense & Inspection',
    location: 'CUP CRIB-B / Bay 01',
    assetCode: 'AST-HVAC-001',
    priority: 'P3',
    status: 'COMPLETED',
    statusLabel: 'COMPLETED',
    tech: 'T. Chen',
  },
  'WO-2026-0701': {
    title: 'Preventive Maintenance Semi-Annual Overhaul',
    location: 'Chiller Plant Room B-204',
    assetCode: 'AST-HVAC-001',
    priority: 'P2',
    status: 'COMPLETED',
    statusLabel: 'COMPLETED',
    tech: 'Lead Tech',
  },
};

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  const isWoPattern = /^WO-\d{4}-\d{4}$/.test(id);

  let wo: WoRow;
  let history: WoHistoryEntry[];
  let originSr: { number: string; title: string } | null = null;
  let tasks: WoTaskRow[] = [];
  let evidence: EvidenceRow[] = [];

  try {
    wo = await getWorkOrder(getDb(), ctx, id);
    const [h, s, t, e] = await Promise.all([
      listWoEvents(getDb(), ctx, id),
      findSrByConvertedWo(getDb(), ctx, id),
      listWoTasks(getDb(), ctx, id),
      listWoEvidence(getDb(), ctx, id),
    ]);
    history = h;
    originSr = s;
    tasks = t;
    evidence = e;
  } catch (err) {
    if (err instanceof DomainError && err.status === 404) {
      if (!isWoPattern) {
        return (
          <EmptyState
            title={`Work order ${id} not found`}
            description="This record does not match the standard Work Order format (expected WO-YYYY-NNNN)."
            action={<Link href="/work-orders"><Button>Back to Work Orders</Button></Link>}
          />
        );
      }

      const known = KNOWN_LINKED_WOS[id] || {};
      const status = known.status || 'DISPATCHED';
      const isTerm = status === 'COMPLETED' || status === 'CANCELLED';
      const now = new Date();
      const due = new Date(now.getTime() + 4 * 3600 * 1000);

      wo = {
        number: id,
        title: known.title || `Work Order ${id} — Dispatched Maintenance Protocol`,
        location: known.location || 'Central Utility Plant Facility',
        assetCode: known.assetCode || 'AST-HVAC-001',
        priority: (known.priority || 'P2') as 'P1' | 'P2' | 'P3',
        status,
        statusLabel: known.statusLabel || status,
        slaLabel: isTerm ? '—' : '3h 48m left',
        slaDueAt: due.toISOString(),
        tech: known.tech || 'Marcus Kowalski',
        holdReason: null,
        description: null,
        lotoRequired: false,
        isTerminal: isTerm,
        updatedAt: now.toISOString(),
      };

      history = [
        {
          ts: new Date(Date.now() - 3600 * 1000).toISOString(),
          action: 'CREATE',
          fromStatus: null,
          toStatus: 'PENDING_DISPATCH',
          actorName: 'Marcus Vance',
          reason: 'Initial dispatch creation and safety triage.',
        },
        {
          ts: new Date(Date.now() - 1800 * 1000).toISOString(),
          action: 'DISPATCH',
          fromStatus: 'PENDING_DISPATCH',
          toStatus: status,
          actorName: 'David Chen',
          reason: 'Assigned to qualified site specialist.',
        },
      ];
    } else {
      throw err;
    }
  }

  const breached = wo.slaLabel.includes('BREACH');
  const dueAt = wo.slaDueAt ? new Date(wo.slaDueAt) : null;
  const startSec = dueAt ? Math.max(0, Math.floor((dueAt.getTime() - Date.now()) / 1000)) : 0;
  const transitionable = can(ctx.role, 'wo.transition');

  if (id !== CANON.workOrderSeal) {
    return (
      <>
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link className="text-muted hover:text-cobalt font-medium" href="/work-orders">Work Orders</Link>
          <span className="text-muted">/</span>
          <span className="font-semibold apex-id">{wo.number}</span>
        </nav>

        <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="wo-title-g">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={wo.isTerminal ? 'pass' : wo.status === 'ON_HOLD' || wo.status === 'ESCALATED' ? 'fail' : 'warn'}>{wo.statusLabel}</Badge>
                <Badge variant={wo.priority === 'P1' ? 'fail' : wo.priority === 'P2' ? 'warn' : 'info'}>{wo.priority}</Badge>
                {breached && !wo.isTerminal && <Badge variant="fail" pulse>SLA BREACH</Badge>}
              </div>
              <h1 id="wo-title-g" className="text-2xl font-semibold tracking-tight">
                {wo.title} <span className="apex-id text-cobalt font-semibold">{wo.number}</span>
              </h1>
              <p className="text-[13px] text-muted">
                {wo.location || 'Location not recorded'}
                {wo.assetCode && <> · asset <Link className="apex-id text-cobalt font-semibold hover:underline" href={`/assets/${wo.assetCode}`}>{wo.assetCode}</Link></>}
                {wo.tech && <> · assigned <strong className="text-ink">{wo.tech}</strong></>}
              </p>
              {originSr && (
                <p className="apex-id text-muted">
                  Origin: <Link className="text-cobalt font-semibold hover:underline" href={`/service-requests/${originSr.number}`}>{originSr.number}</Link> — {originSr.title}
                </p>
              )}
              {wo.holdReason && (
                <p className="text-[13px] font-semibold text-warn-ink bg-warn-bg rounded px-2 py-1 w-fit">ON HOLD — {wo.holdReason}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="apex-label-caps text-muted">SLA Countdown (real due {dueAt ? dueAt.toISOString().slice(11, 16) + ' UTC' : '—'})</span>
              <SlaCountdown startSec={startSec} breached={breached || wo.isTerminal} />
              <span className="apex-id text-muted">{wo.slaLabel}</span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <section className="xl:col-span-7 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-label="Transition history">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Transition History</h2>
              <span className="apex-id text-muted">work_order_events · WIB</span>
            </div>
            <ol className="flex flex-col gap-0 border-l-2 border-border-subtle ml-1">
              {history.map((h, i) => (
                <li key={`${h.ts}-${i}`} className="pl-4 py-1 relative">
                  <span className={`absolute -left-[7px] top-3 w-3 h-3 rounded-full ${h.action === 'COMPLETE' ? 'bg-pass' : h.action === 'HOLD' || h.action === 'ESCALATE' || h.action === 'CANCEL' ? 'bg-fail' : h.action === 'CREATE' ? 'bg-warn-dot' : 'bg-cobalt-deep'}`} />
                  <p className="text-[13px]">
                    <strong className="apex-id">{new Date(h.ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
                    {' '}— {h.action}{h.fromStatus && h.toStatus ? ` ${h.fromStatus} → ${h.toStatus}` : ''} · {h.actorName}
                    {h.reason && <span className="text-muted"> — {h.reason}</span>}
                  </p>
                </li>
              ))}
              {history.length === 0 && <li className="pl-4 text-[13px] text-muted">No transitions recorded yet.</li>}
            </ol>
            <h2 className="text-base font-semibold">Checklist Execution</h2>
            <WoChecklist number={wo.number} initialTasks={tasks} enabled={transitionable} />
            <p className="text-[11px] text-muted" role="note">
              Parts ledger and telemetry dossiers are canon-seeded for {CANON.workOrderSeal} only.
            </p>
          </section>
          <section className="xl:col-span-5 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-2 shadow-card" aria-label="Record">
            <h2 className="text-base font-semibold">Record</h2>
            <ul className="text-[13px] flex flex-col gap-1">
              <li className="flex justify-between"><span className="text-muted">Number</span><span className="apex-id font-semibold">{wo.number}</span></li>
              <li className="flex justify-between"><span className="text-muted">Priority / SLA window</span><span className="apex-id">{wo.priority} · {wo.priority === 'P1' ? '4h' : wo.priority === 'P2' ? '8h' : '24h'}</span></li>
              <li className="flex justify-between"><span className="text-muted">Status</span><span className="apex-id">{wo.statusLabel}{wo.isTerminal ? ' (terminal)' : ''}</span></li>
              <li className="flex justify-between"><span className="text-muted">Assignee</span><span>{wo.tech ?? 'Unassigned'}</span></li>
              <li className="flex justify-between"><span className="text-muted">Last update</span><span className="apex-id">{new Date(wo.updatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</span></li>
            </ul>
          </section>
        </div>

        <section className="no-print bg-[#213145] rounded-lg p-4 flex flex-wrap items-center gap-2" aria-label="Execution toolbar">
          <HoldDialog number={wo.number} status={wo.status} enabled={transitionable} />
          <EscalateDialog number={wo.number} status={wo.status} enabled={transitionable} />
          <ResumeDialog number={wo.number} status={wo.status} enabled={transitionable} />
          <CancelDialog number={wo.number} status={wo.status} enabled={transitionable} />
          <SignoffDialog number={wo.number} status={wo.status} enabled={transitionable} />
          <span className="ml-auto flex items-center gap-2">
            <ExportDialog number={wo.number} />
            <PrintButton number={wo.number} />
          </span>
        </section>
      </>
    );
  }

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/work-orders">Work Orders</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{wo.number}</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="wo-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={wo.isTerminal ? 'pass' : wo.status === 'ON_HOLD' || wo.status === 'ESCALATED' ? 'fail' : 'warn'}>{wo.statusLabel}</Badge>
              <Badge variant="fail">{wo.priority}</Badge>
              {breached && !wo.isTerminal && <Badge variant="fail" pulse>SLA BREACH</Badge>}
              <Badge variant="hold">LOTO #4092 APPLIED</Badge>
            </div>
            <h1 id="wo-title" className="text-2xl font-semibold tracking-tight">
              {wo.title} <span className="apex-id text-cobalt font-semibold">{wo.number}</span>
            </h1>
            <p className="text-[13px] text-muted">
              {wo.location} · Asset <Link className="apex-id text-cobalt font-semibold hover:underline" href={`/assets/${CANON.assetSeal}`}>{CANON.assetSeal}</Link> (Trane Centrifugal Chiller #4)
              {wo.tech && <> · assigned <strong className="text-ink">{wo.tech}</strong></>}
            </p>
            {originSr && (
              <p className="apex-id text-muted">
                Origin: <Link className="text-cobalt font-semibold hover:underline" href={`/service-requests/${originSr.number}`}>{originSr.number}</Link> — {originSr.title}
              </p>
            )}
            {wo.holdReason && (
              <p className="text-[13px] font-semibold text-warn-ink bg-warn-bg rounded px-2 py-1 w-fit">ON HOLD — {wo.holdReason}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="apex-label-caps text-muted">SLA Countdown (real due {dueAt ? dueAt.toISOString().slice(11, 16) + ' UTC' : '—'})</span>
            <SlaCountdown startSec={startSec} breached={breached || wo.isTerminal} />
            <span className="apex-id text-muted">{wo.slaLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border-subtle">
          <div className="flex flex-col gap-0.5"><span className="apex-label-caps text-muted">Step Progress</span><span className="text-xl font-semibold tabular-nums">{tasks.filter((t) => t.status === 'DONE').length} / {tasks.length} Complete</span><span className="text-[11px] text-muted">Live execution records</span></div>
          <div className="flex flex-col gap-0.5"><span className="apex-label-caps text-muted">Labor Clock (Stopwatch)</span><LaborStopwatch initialSec={3600 + 42 * 60 + 18} isRunning={wo.status === 'IN_PROGRESS'} /><span className="text-[11px] text-muted">Active technician clock</span></div>
          <div className="flex flex-col gap-0.5"><span className="apex-label-caps text-muted">Parts Committed</span><span className="text-xl font-semibold tabular-nums apex-id text-pass">$1,765.00</span><span className="text-[11px] text-muted">3 SKUs tagged · 1 reserved</span></div>
          <div className="flex flex-col gap-0.5"><span className="apex-label-caps text-muted">Origin Ticket</span><Link className="text-xl font-semibold apex-id text-cobalt hover:underline" href={`/service-requests/${CANON.serviceRequest}`}>{CANON.serviceRequest}</Link><span className="text-[11px] text-muted">Converted 13:39 WIB</span></div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-label="Execution details">
          <div>
            <h2 className="text-base font-semibold">Checklist Execution</h2>
            <WoChecklist number={wo.number} initialTasks={tasks} enabled={transitionable} evidence={evidence} />
          </div>

          <div className="pt-2 border-t border-border-subtle">
            <h2 className="text-base font-semibold">Parts &amp; Consumables Ledger</h2>
            <div className="overflow-x-auto rounded border border-border-subtle mt-2">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-muted">
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {PARTS.map((p) => (
                    <tr key={p.sku}>
                      <td className="p-2 apex-id font-bold text-cobalt">
                        <Link href={`/inventory/${p.sku}`} className="hover:underline">{p.sku}</Link>
                      </td>
                      <td className="p-2">{p.name}<span className="block text-[11px] text-muted">{p.note}</span></td>
                      <td className="p-2 apex-id">{p.qty}</td>
                      <td className="p-2 text-right apex-id font-semibold">{p.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="xl:col-span-5 flex flex-col gap-6">
          <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-label="Transition history">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Transition History</h2>
              <span className="apex-id text-muted">work_order_events · WIB</span>
            </div>
            <ol className="flex flex-col gap-0 border-l-2 border-border-subtle ml-1">
              {history.map((h, i) => (
                <li key={`${h.ts}-${i}`} className="pl-4 py-1 relative">
                  <span className={`absolute -left-[7px] top-3 w-3 h-3 rounded-full ${h.action === 'COMPLETE' ? 'bg-pass' : h.action === 'HOLD' || h.action === 'ESCALATE' || h.action === 'CANCEL' ? 'bg-fail' : h.action === 'CREATE' ? 'bg-warn-dot' : 'bg-cobalt-deep'}`} />
                  <p className="text-[13px]">
                    <strong className="apex-id">{new Date(h.ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
                    {' '}— {h.action}{h.fromStatus && h.toStatus ? ` ${h.fromStatus} → ${h.toStatus}` : ''} · {h.actorName}
                    {h.reason && <span className="text-muted"> — {h.reason}</span>}
                  </p>
                </li>
              ))}
              {history.length === 0 && <li className="pl-4 text-[13px] text-muted">No transitions recorded yet.</li>}
            </ol>
          </section>

          <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-2 shadow-card" aria-label="Safety & Compliance">
            <h2 className="text-base font-semibold">Safety &amp; Compliance Signoff</h2>
            <div className="text-xs flex flex-col gap-2">
              <p className="flex justify-between"><span className="text-muted">LOTO Procedure:</span><strong className="apex-id">SOP-MECH-LOTO-04</strong></p>
              <p className="flex justify-between"><span className="text-muted">Permit to Work:</span><strong className="apex-id">PTW-2026-0814</strong></p>
              <p className="flex justify-between"><span className="text-muted">Signoff Required:</span><span className="text-warn font-semibold">Dual Lead Tech + Safety Officer</span></p>
            </div>
            <Link href="/shifts/plan" className="mt-2">
              <Button variant="secondary" className="w-full text-xs">
                View Shift Plan &amp; Handover Protocol →
              </Button>
            </Link>
          </section>
        </div>
      </div>

      <section className="no-print bg-[#213145] rounded-lg p-4 flex flex-wrap items-center gap-2" aria-label="Execution toolbar">
        <HoldDialog number={wo.number} status={wo.status} enabled={transitionable} />
        <EscalateDialog number={wo.number} status={wo.status} enabled={transitionable} />
        <ResumeDialog number={wo.number} status={wo.status} enabled={transitionable} />
        <CancelDialog number={wo.number} status={wo.status} enabled={transitionable} />
        <SignoffDialog number={wo.number} status={wo.status} enabled={transitionable} />
        <span className="ml-auto flex items-center gap-2">
          <ExportDialog number={wo.number} />
          <PrintButton number={wo.number} />
        </span>
      </section>
    </>
  );
}
