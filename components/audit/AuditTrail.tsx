'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileDown,
  FileText,
  Flag,
  History,
  KeyRound,
  Lock,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
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
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';
import { downloadText } from '@/lib/download';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useWindow } from '@/lib/ui/useWindow';
import type { AuditRow, HashChainVerificationResult } from '@/lib/services/audit-service';


type Sev = 'Critical' | 'Notice' | 'Info';
type ViewMode = 'diff' | 'raw';


function severityOf(action: string): Sev {
  if (/FAIL|LOCKED|REJECT|BREACH|CRITICAL|ALERT|SUSPEND/.test(action.toUpperCase())) return 'Critical';
  if (/HOLD|ESCALATE|CANCEL|CLOSE|REVOKE|LOGOUT|POLICY/.test(action.toUpperCase())) return 'Notice';
  return 'Info';
}

const ENTITY_SCOPE_MAP: Record<string, string> = {
  auth: 'Security & Auth',
  work_order: 'Work Orders',
  service_request: 'Service Requests',
  asset: 'Asset State',
  purchasing: 'Purchasing & POs',
  inventory: 'Inventory',
  other: 'Other',
};

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType?.toLowerCase()) {
    case 'work_order':
    case 'work orders':
      return `/work-orders/${entityId}`;
    case 'service_request':
    case 'service requests':
      return `/service-requests/${entityId}`;
    case 'asset':
    case 'asset state':
    case 'asset registry':
      return `/assets/${entityId}`;
    case 'purchasing':
    case 'purchasing & pos':
      return `/purchasing/${entityId}`;
    case 'inventory':
      return `/inventory?sku=${entityId}`;
    default:
      return null;
  }
}

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)} UTC`;
  } catch {
    return iso;
  }
}


interface ProcessedEvent {
  id: number;
  ts: string;
  actorName: string;
  actorRole: string;
  actorInitials: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  ip: string | null;
  terminal: string | null;
  hash: string;
  before: unknown;
  after: unknown;
  requestId: string | null;
  demo: boolean;
  diffs: Array<{ field: string; tag: string; oldVal: string; newVal: string }>;
  session: {
    badge: string | null;
    ip: string | null;
    env: string | null;
    location: string | null;
    mfa: string | null;
  };
}

const CANONICAL_FALLBACK_EVENTS: ProcessedEvent[] = [
  {
    id: 94812,
    ts: '2026-05-24T14:35:18.421Z',
    actorName: 'David Chen',
    actorRole: 'Facilities Eng Mgr',
    actorInitials: 'DC',
    action: 'APPROVE',
    entityType: 'Purchasing & POs',
    entityId: 'PR-2026-0314',
    description: 'Approved CapEx emergency procurement for Chiller mechanical shaft seal ($2,900.00)',
    ip: '10.14.8.42',
    terminal: 'HVC-ENG-02',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: {
      approval_stage: 'PENDING_DEPT_MGR',
      authorized_by: null,
      budget_envelope_allocated: 0.0,
      next_signoff_tier: 'David Chen (Level 2)',
    },
    after: {
      approval_stage: 'ENDORSED_CAPEX_AUTHORIZED',
      authorized_by: { user_id: 'USR-0042', name: 'David Chen', role: 'Eng Lead / Mgr' },
      budget_envelope_allocated: 2900.0,
      next_signoff_tier: 'Marcus Vance (VP Operations - Level 3)',
    },
    requestId: 'req_procure_pr0314_endorse_88120',
    diffs: [
      { field: 'approval_stage', tag: 'Status Mutation', oldVal: '"PENDING_DEPT_MGR"', newVal: '"ENDORSED_CAPEX_AUTHORIZED"' },
      { field: 'authorized_by', tag: 'Signoff Signer', oldVal: 'null', newVal: '{"user_id": "USR-0042", "name": "David Chen", "role": "Eng Lead / Mgr"}' },
      { field: 'budget_envelope_allocated', tag: 'Fiscal Ledger', oldVal: '$0.00', newVal: '$2,900.00 [CUP Maintenance Capex]' },
      { field: 'next_signoff_tier', tag: 'Approval Chain', oldVal: '"David Chen (Level 2)"', newVal: '"Marcus Vance (VP Operations - Level 3)"' },
    ],
    session: {
      badge: 'RFID-4180',
      ip: '10.14.8.42 (Internal VPN East)',
      env: 'Chrome 125.0 Enterprise / macOS',
      location: 'Bldg A Floor 4 (Eng Dept)',
      mfa: 'Okta SCIM MFA Verified (FIDO2 WebAuthn Key)',
    },
  },
  {
    id: 94811,
    ts: '2026-05-24T14:22:04.118Z',
    actorName: 'Marcus Kowalski',
    actorRole: 'HVAC Lead Specialist',
    actorInitials: 'MK',
    action: 'STATE_CHANGE',
    entityType: 'Work Orders',
    entityId: 'WO-2026-0894',
    description: 'Work order status shifted from CREATED to DISPATCHED; technician assigned',
    ip: '10.14.12.88',
    terminal: 'HVC-TAB-04 (Mobile)',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: { status: 'CREATED', assignee: null },
    after: { status: 'DISPATCHED', assignee: 'Marcus Kowalski' },
    requestId: 'req_wo_dispatch_0894_94811',
    diffs: [
      { field: 'status', tag: 'State Machine', oldVal: '"CREATED"', newVal: '"DISPATCHED"' },
      { field: 'assigned_technician', tag: 'Resource Alloc', oldVal: 'null', newVal: '"Marcus Kowalski (HVAC Lead)"' },
    ],
    session: {
      badge: 'TECH-1084',
      ip: '10.14.12.88 (Facility WiFi Mesh)',
      env: 'Field PWA / Android 14 Ruggedized',
      location: 'Basement Mech Room B-204',
      mfa: 'PIN + Biometric FIDO2 Verified',
    },
  },
  {
    id: 94810,
    ts: '2026-05-24T14:18:52.004Z',
    actorName: 'System Telemetry Daemon',
    actorRole: 'SCADA Auto-Bot',
    actorInitials: 'ST',
    action: 'CREATE / ALERT',
    entityType: 'Asset State',
    entityId: 'AST-HVAC-004',
    description: 'Chiller #4 ultrasonic probe triggered critical defect flag (refrigerant leak 18.4 ppm threshold breach)',
    ip: '10.14.0.x (demo row — VLAN placeholder)',
    terminal: 'Broker: SCADA-BROKER-01',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: { condition: 'NOMINAL', ppm: 4.2 },
    after: { condition: 'CRITICAL_DEFECT', ppm: 18.4, auto_flag: true },
    requestId: 'req_telemetry_threshold_ast004',
    diffs: [
      { field: 'condition', tag: 'Health State', oldVal: '"NOMINAL"', newVal: '"CRITICAL_DEFECT"' },
      { field: 'refrigerant_leak_ppm', tag: 'Sensor Value', oldVal: '4.2 ppm', newVal: '18.4 ppm [BREACH > 10.0]' },
    ],
    session: {
      badge: 'SVC-SCADA-DAEMON',
      ip: '10.14.0.x (demo row — VLAN placeholder)',
      env: 'Modbus Daemon v4.18 / Alpine Linux',
      location: 'Central Utility Plant Gateway',
      mfa: 'mTLS Hardware Certificate Validated',
    },
  },
  {
    id: 94809,
    ts: '2026-05-24T11:15:30.892Z',
    actorName: 'Sarah Al-Mansoor',
    actorRole: 'Inventory Crib Lead',
    actorInitials: 'SA',
    action: 'MUTATION',
    entityType: 'Inventory',
    entityId: 'PART-FLTR-401',
    description: 'GRN received: +100 pcs added to CRIB-B / Bay 01 via PO-2026-0298 dock barcode scan',
    ip: '10.14.22.15',
    terminal: 'DCK-SCN-02',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: { on_hand_qty: 45 },
    after: { on_hand_qty: 145, last_po: 'PO-2026-0298' },
    requestId: 'req_grn_dock_scan_0298',
    diffs: [
      { field: 'on_hand_qty', tag: 'Stock Balance', oldVal: '45 pcs', newVal: '145 pcs (+100 received)' },
      { field: 'location', tag: 'Bin Transfer', oldVal: '"Receiving Dock"', newVal: '"CRIB-B / Bay 01"' },
    ],
    session: {
      badge: 'CRIB-9912',
      ip: '10.14.22.15 (Logistics Subnet)',
      env: 'Zebra TC52 Scanner / Android',
      location: 'Loading Dock B-02',
      mfa: 'Badge Tap + PIN Verified',
    },
  },
  {
    id: 94808,
    ts: '2026-05-24T09:40:12.771Z',
    actorName: 'Marcus Vance',
    actorRole: 'VP Operations & Facilities',
    actorInitials: 'MV',
    action: 'POLICY_UPDATE',
    entityType: 'Security & Auth',
    entityId: 'RBAC: Sr. Field Tech',
    description: 'Updated spend limit policy: elevated parts procurement cap from $250.00 to $500.00',
    ip: '10.14.1.2',
    terminal: 'ADM-NUSA-01',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: { max_parts_cap: 250.0 },
    after: { max_parts_cap: 500.0 },
    requestId: 'req_rbac_policy_cap_update',
    diffs: [
      { field: 'max_parts_cap', tag: 'Permission Rule', oldVal: '$250.00', newVal: '$500.00 per work order' },
    ],
    session: {
      badge: 'EXEC-001',
      ip: '10.14.1.2 (Executive LAN)',
      env: 'Safari 17.4 / macOS Enterprise',
      location: 'Executive Suite Floor 12',
      mfa: 'Hardware YubiKey FIDO2 Verified',
    },
  },
  {
    id: 94807,
    ts: '2026-05-24T08:02:44.310Z',
    actorName: 'Elena Voronova',
    actorRole: 'Instrumentation Tech',
    actorInitials: 'EV',
    action: 'CALIBRATION',
    entityType: 'Asset State',
    entityId: 'AST-ELEC-012',
    description: 'Substation thermal bus-bar meter zero-point calibrated (Tolerance 0.05°C Verified)',
    ip: '10.14.18.55',
    terminal: 'SUB-STN-01',
    hash: '',
    demo: true, // TASK-20: tidak ada hash nyata — event fallback/demonstrasi, bukan ledger asli
    before: { status: 'DUE_CALIBRATION', drift: 0.18 },
    after: { status: 'CALIBRATED_NOMINAL', drift: 0.02 },
    requestId: 'req_calib_sub_elec012',
    diffs: [
      { field: 'calibration_status', tag: 'Metrology Gate', oldVal: '"DUE_CALIBRATION"', newVal: '"CALIBRATED_NOMINAL"' },
      { field: 'drift_variance', tag: 'Offset Check', oldVal: '+0.18°C', newVal: '+0.02°C [PASS]' },
    ],
    session: {
      badge: 'TECH-2091',
      ip: '10.14.18.55 (Substation WiFi)',
      env: 'Fluke Connect App / iOS 17',
      location: 'Substation #01 East',
      mfa: 'Biometric FaceID Verified',
    },
  },
];

function processDbRow(r: AuditRow): ProcessedEvent {
  const hash = r.entryHash ?? '';
  const initials = r.actorName
    ? r.actorName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SYS';

  const diffs: Array<{ field: string; tag: string; oldVal: string; newVal: string }> = [];
  const b = r.before as Record<string, unknown> | null;
  const a = r.after as Record<string, unknown> | null;

  if (b && typeof b === 'object' && a && typeof a === 'object') {
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    for (const k of keys) {
      const bV = b[k];
      const aV = a[k];
      if (JSON.stringify(bV) !== JSON.stringify(aV)) {
        diffs.push({
          field: k,
          tag: 'Field Mutation',
          oldVal: bV !== undefined ? JSON.stringify(bV) : 'null',
          newVal: aV !== undefined ? JSON.stringify(aV) : 'null',
        });
      }
    }
  } else if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) {
      diffs.push({
        field: k,
        tag: 'Initial State',
        oldVal: 'null',
        newVal: typeof v === 'object' ? JSON.stringify(v) : String(v),
      });
    }
  }

  if (diffs.length === 0) {
    diffs.push({
      field: 'transition',
      tag: 'State Mutation',
      oldVal: b ? JSON.stringify(b) : '—',
      newVal: a ? JSON.stringify(a) : `Action: ${r.action}`,
    });
  }

  return {
    id: r.id,
    ts: r.ts,
    actorName: r.actorName || 'System',
    actorRole: '—',
    actorInitials: initials,
    action: r.action,
    entityType: ENTITY_SCOPE_MAP[r.entityType ?? 'other'] ?? (r.entityType || 'General'),
    entityId: r.entityId || `EVT-${r.id}`,
    description: `Action ${r.action} executed on ${r.entityType || 'entity'} ${r.entityId || ''}`.trim(),
    ip: null,
    terminal: null,
    hash,
    before: r.before,
    after: r.after,
    requestId: r.requestId,
    demo: false,
    diffs,
    session: {
      badge: null,
      ip: null,
      env: null,
      location: null,
      mfa: null,
    },
  };
}

export function AuditTrail({
  rows,
  total,
  truncated,
  orgId,
}: {
  rows: AuditRow[];
  total: number;
  truncated: boolean;
  orgId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('All Entities');
  const [action, setAction] = useState('All Actions');
  const [principal, setPrincipal] = useState('All Principals');
  const [scope, setScope] = useState('All Logs');
  const [sev, setSev] = useState('All Levels');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('diff');
  const [refetching, setRefetching] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const [expOpen, setExpOpen] = useState(false);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [verifyRootOpen, setVerifyRootOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<HashChainVerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const runVerifyChain = async (open: boolean) => {
    setVerifyRootOpen(open);
    if (!open) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await apiFetch<HashChainVerificationResult>('/api/audit-trail/verify-chain', { method: 'POST' });
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult(null);
      setVerifyError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Verification request failed.');
    } finally {
      setVerifying(false);
    }
  };
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('Suspicious Privilege Escalation');
  const [flagNotes, setFlagNotes] = useState('');

  const { toasts, push, dismiss, defer } = useToasts(6000);
  const searchRef = useRef<HTMLInputElement>(null);

  const allEvents: ProcessedEvent[] = useMemo(() => {
    const fromDb = rows.map(processDbRow);
    const seenIds = new Set(fromDb.map((e) => e.entityId));
    const combined = [...fromDb];
    for (const c of CANONICAL_FALLBACK_EVENTS) {
      if (!seenIds.has(c.entityId)) {
        combined.push(c);
      }
    }
    return combined;
  }, [rows]);

  const [selId, setSelId] = useState<number | null>(allEvents[0]?.id ?? 94812);

  useEffect(() => {
    const hot = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', hot);
    return () => document.removeEventListener('keydown', hot);
  }, []);

  
  const entities = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.entityId).filter(Boolean))),
    [allEvents]
  );
  const actions = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.action))).sort(),
    [allEvents]
  );
  const principals = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.actorName))).sort(),
    [allEvents]
  );

  const filtered = useMemo(() => {
    const inWindow = (iso: string) => {
      if (dateFilter === 'All Time') return true;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return true;
      if (dateFilter === 'Today') {
        const d = new Date();
        return t >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }
      const days = dateFilter === 'Last 7 Days' ? 7 : 30;
      return Date.now() - t <= days * 86400000;
    };
    return allEvents.filter((e) => {
      if (!inWindow(e.ts)) return false;
      if (entity !== 'All Entities' && e.entityId !== entity) return false;
      if (action !== 'All Actions' && e.action !== action) return false;
      if (principal !== 'All Principals' && e.actorName !== principal) return false;
      if (sev !== 'All Levels' && severityOf(e.action) !== sev) return false;
      if (scope !== 'All Logs' && e.entityType !== scope) return false;
      const needle = q.trim().toLowerCase();
      if (
        needle &&
        !`${e.id} ${e.action} ${e.entityId} ${e.actorName} ${e.requestId ?? ''} ${e.description} ${e.hash}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [allEvents, entity, action, principal, sev, scope, q, dateFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const sel = allEvents.find((r) => r.id === selId) ?? shown[0] ?? allEvents[0];

  const feedWin = useWindow(shown, { rowHeight: 150, threshold: 60, initialHeight: 620 });

  const reset = () => {
    setQ('');
    setEntity('All Entities');
    setAction('All Actions');
    setPrincipal('All Principals');
    setScope('All Logs');
    setSev('All Levels');
    setDateFilter('All Time');
    setPage(0);
  };

  const copyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    push(true, 'Hash Entri Disalin', 'Hash chain tercatat-server disalin ke clipboard.');
    defer(() => setCopiedHash(false), 2000);
  };

  const triggerRefetch = () => {
    setRefetching(true);
    router.refresh();
    defer(() => {
      setRefetching(false);
      push(true, 'Feed Dimuat Ulang', 'Baris ledger server terbaru dimuat ke tampilan ini.');
    }, 650);
  };

  const [busyExport, setBusyExport] = useState(false);
  const exportLog = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      if (format === 'csv') {
        const { exportTableCsv } = await import('@/lib/csv-export');
        const table: (string | number)[][] = [
          ['id', 'utc', 'action', 'entity_type', 'entity_id', 'actor', 'severity', 'hash', 'request_id'],
          ...filtered.map((e) => [e.id, fmtTs(e.ts), e.action, e.entityType, e.entityId, e.actorName, severityOf(e.action), e.hash ?? '', e.requestId ?? '']),
        ];
        await exportTableCsv('audit-ledger.csv', table);
      } else {
        downloadFile('audit-ledger.json', JSON.stringify(filtered, null, 2), 'application/json');
      }
      setExpOpen(false);
      push(true, 'Ledger Diekspor', `${filtered.length} event diekspor ke audit-ledger.${format}.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const downloadEvidence = (e: ProcessedEvent) => {
    const proofDoc = {
      manifest: 'APEX_OPS_EVENT_EVIDENCE_V1',
      tenant_id: orgId,
      event_id: e.id,
      timestamp_utc: fmtTs(e.ts),
      action: e.action,
      entity: {
        type: e.entityType,
        key: e.entityId,
      },
      server_entry_hash: e.hash || null,
      chain_root_digest: verifyResult?.rootHash ?? null,
      chain_verified_at: verifyResult?.verificationTimestamp ?? null,
      chain_status: verifyResult ? (verifyResult.valid ? 'VALID' : `TAMPERED@event#${verifyResult.tamperedEventId}`) : 'NOT_VERIFIED_THIS_SESSION',
      actor_envelope: e.session,
      verification_status: e.hash ? 'HASH_RECORDED' : 'NO_CHAIN_HASH (fallback/demo row)',
      verification_note: 'Unsigned JSON. Verify the full chain server-side via POST /api/audit-trail/verify-chain.',
    };
    downloadFile(
      `audit-evidence-${e.entityId || e.id}.json`,
      JSON.stringify(proofDoc, null, 2),
      'application/json'
    );
    push(true, 'Bukti Event Diunduh', `Bukti JSON unsigned untuk ${e.entityId} disimpan. Verify via Verify Cryptographic Root.`);
  };

  const submitFlag = () => {
    setFlagOpen(false);
    push(false, 'Flag Tidak Dieskalasi', `Event #${sel.id} (${sel.entityId}) hanya dicatat lokal — tidak ada endpoint server untuk eskalasi.`);
  };

  const criticalCount = allEvents.filter((e) => severityOf(e.action) === 'Critical').length;
  const demoCount = allEvents.filter((e) => e.demo).length;
  const scopeCount = (label: string) =>
    label === 'All Logs' ? allEvents.length : allEvents.filter((e) => e.entityType === label).length;
  const scopes = [
    { n: 'All Logs', c: scopeCount('All Logs') },
    { n: 'Work Orders', c: scopeCount('Work Orders') },
    { n: 'Purchasing & POs', c: scopeCount('Purchasing & POs') },
    { n: 'Asset State', c: scopeCount('Asset State') },
    { n: 'Security & Auth', c: scopeCount('Security & Auth') },
    { n: 'Inventory', c: scopeCount('Inventory') },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* 1. Top Governance & Breadcrumbs Bar */}
      <section className="flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Home
          </Link>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Governance &amp; System</span>
          <span>/</span>
          <span className="font-semibold text-body">Audit Trail &amp; System Logs</span>
        </nav>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cobalt-deep flex items-center justify-center text-white shadow-card">
              <ShieldCheck size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display">
                  System Audit Trail &amp; Immutable Event Ledger
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-pass-bg text-pass-ink text-[11px] font-mono font-semibold flex items-center gap-1 shadow-xs border border-pass/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass" />
                  AUDIT LEDGER • APPEND-ONLY
                </span>
              </div>
              <div className="flex items-center gap-3 text-muted text-xs font-mono mt-0.5 flex-wrap">
                <span className="flex items-center gap-1">
                  Tenant ID: <span className="text-body font-bold">{orgId || 'APX-NUSA-01'}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Chain: <span className="text-body font-bold">SHA-256 hash chain (server)</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Tip:{' '}
                  <span
                    className="text-body font-bold"
                    title={verifyResult ? `Root hash: ${verifyResult.rootHash}` : 'Run Verify Cryptographic Root to compute the chain tip'}
                  >
                    {verifyResult ? `${verifyResult.rootHash.slice(0, 12)}…` : 'unverified'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Modal */}
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                  <Download size={14} /> Ekspor Log CSV / JSON
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Ekspor Ledger Audit</DialogTitle>
                <DialogDescription>
                  Download {filtered.length} filtered events as raw forensic records.
                </DialogDescription>
                <div className="flex gap-2 my-2">
                  {(['csv', 'json'] as const).map((f) => (
                    <Button
                      key={f}
                      variant={format === f ? 'primary' : 'secondary'}
                      onClick={() => setFormat(f)}
                      className="flex-1"
                    >
                      {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setExpOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={exportLog} disabled={busyExport}>Unduh {format.toUpperCase()}</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Compliance PDF Dialog */}
            <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                  <FileText size={14} /> Compliance PDF Report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Generate ISO / SOC-2 Compliance Dossier</DialogTitle>
                <DialogDescription>
                  Compiles verified hash-chain events, RBAC approvals, and sign-offs for auditor review.
                </DialogDescription>
                <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-1.5 my-2">
                  <div className="flex justify-between">
                    <span className="text-muted">Standard:</span>
                    <span className="font-semibold">SOC-2 Type II / ISO 55001 Asset Mgmt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Scope Window:</span>
                    <span className="font-semibold">{dateFilter}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Server Rows Loaded:</span>
                    <span className="font-mono font-bold text-pass-ink">{total.toLocaleString('en-US')} events</span>
                  </div>
                </div>
                <p className="rounded border border-warn/40 bg-warn-bg px-2.5 py-1.5 text-[11px] text-warn-ink my-2">
                  Ekspor PDF belum tersedia — gunakan Ekspor Log CSV / JSON untuk data nyata.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setPdfOpen(false)}>
                    Close
                  </Button>
                  <Button disabled title="PDF export is not implemented">
                    Generate &amp; Download PDF
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Verify Cryptographic Root Dialog */}
            <Dialog open={verifyRootOpen} onOpenChange={runVerifyChain}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                  <CheckCircle2 size={14} className="text-pass" /> Verify Cryptographic Root
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogTitle className="flex items-center gap-2">
                  {verifyResult?.valid ? (
                    <ShieldCheck className="text-pass" size={20} />
                  ) : (
                    <ShieldAlert className={verifyResult && !verifyResult.valid ? 'text-fail' : 'text-warn'} size={20} />
                  )}{' '}
                  Hash-Chain Verification (server)
                </DialogTitle>
                <DialogDescription>
                  Full SHA-256 chain recomputed over all {orgId}-scoped ledger events — on request, no client-side claims.
                </DialogDescription>
                {verifying && (
                  <p className="text-xs font-mono text-muted py-6 text-center" role="status">
                    Recomputing chain server-side…
                  </p>
                )}
                {verifyError && (
                  <div className="p-2.5 rounded bg-fail-bg border border-fail text-xs font-mono text-fail-ink my-2" role="alert">
                    {verifyError}
                  </div>
                )}
                {!verifying && verifyResult && (
                  <div className="space-y-2 text-xs font-mono my-2">
                    <div className="p-2.5 rounded bg-surface border border-border-subtle flex flex-col gap-1">
                      <span className="text-muted">Root Hash (SHA-256 chain tip):</span>
                      <span className="text-cobalt-deep font-bold break-all">{verifyResult.rootHash}</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface border border-border-subtle flex flex-col gap-1">
                      <span className="text-muted">Genesis Hash (org-scoped):</span>
                      <span className="text-body break-all">{verifyResult.genesisHash}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded bg-surface border border-border-subtle">
                        <span className="text-muted block">Events Verified:</span>
                        <span className="font-bold text-body">{verifyResult.verifiedCount.toLocaleString('en-US')}</span>
                      </div>
                      <div className="p-2.5 rounded bg-surface border border-border-subtle">
                        <span className="text-muted block">Chain Status:</span>
                        <span className={cn('font-bold', verifyResult.valid ? 'text-pass-ink' : 'text-fail')}>
                          {verifyResult.valid ? 'VALID — no mismatch' : `TAMPERED @ event #${verifyResult.tamperedEventId}`}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-surface border border-border-subtle col-span-2">
                        <span className="text-muted block">Verified At (server clock):</span>
                        <span className="font-bold text-body">{new Date(verifyResult.verificationTimestamp).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => runVerifyChain(true)} disabled={verifying}>
                    Re-run
                  </Button>
                  <Button onClick={() => setVerifyRootOpen(false)}>Done</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {/* 2. 4 Executive Governance & Telemetry KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Governance KPIs">
        {/* KPI 1 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Total Ledger Events (server)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-ink tabular-nums">
                  {total.toLocaleString('en-US')}
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-cobalt">
              <History size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-pass-ink font-semibold flex items-center gap-1">
              <Activity size={12} /> {truncated ? 'Window truncated — more on server' : `${allEvents.length} loaded in view`}
            </span>
            <span className="text-muted font-mono">{orgId}</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Critical Events (in view)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-fail tabular-nums">{criticalCount}</span>
                <span className="text-xs font-semibold text-fail-ink">Flagged</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-fail-bg flex items-center justify-center text-fail">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-fail-ink font-medium truncate">Severity derived from action code</span>
            <span className="text-muted">{allEvents.length} loaded</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Tamper-Proof Integrity
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={cn('text-2xl font-bold font-display tabular-nums', verifyResult?.valid === false ? 'text-fail' : 'text-pass-ink')}>
                  {verifyResult ? (verifyResult.valid ? '100%' : 'FAIL') : '—'}
                </span>
                <span className="text-xs font-medium text-muted">{verifyResult ? (verifyResult.valid ? 'Verified clean' : 'Mismatch found') : 'Not verified'}</span>
              </div>
            </div>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', verifyResult?.valid === false ? 'bg-fail-bg text-fail' : 'bg-pass-bg text-pass')}>
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-pass-ink font-semibold font-mono flex items-center gap-1">
              <Check size={12} /> {verifyResult ? `${verifyResult.verifiedCount.toLocaleString('en-US')} events checked` : 'Run Verify Cryptographic Root'}
            </span>
            <span className="text-muted font-mono">{verifyResult ? (verifyResult.valid ? '0 Hash Mismatch' : `tamper@#${verifyResult.tamperedEventId}`) : 'on demand'}</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Fallback Demo Rows
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-ink tabular-nums">{demoCount}</span>
                <span className="text-xs font-medium text-muted">Badged DEMO</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cobalt-tint flex items-center justify-center text-cobalt">
              <Flag size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-muted flex items-center gap-1">
              Shown only while the server ledger is sparse
            </span>
            <span className="text-pass-ink font-semibold">{demoCount === 0 ? 'Pure ledger' : 'Mixed view'}</span>
          </div>
        </div>
      </section>

      {/* 3. Advanced Search & Audit Filter Toolbar */}
      <section className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col gap-3">
        {/* Top Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Filter berdasarkan ID Entitas, Hash, User, Aksi... (⌘/)"
              aria-label="Cari event audit"
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Rentang tanggal"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              <option>Today</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>All Time</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(0);
              }}
              aria-label="Filter entitas"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Entities', ...entities].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(0);
              }}
              aria-label="Filter aksi"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Actions', ...actions].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={principal}
              onChange={(e) => {
                setPrincipal(e.target.value);
                setPage(0);
              }}
              aria-label="Filter prinsipal"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Principals', ...principals].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom Filter Pills & Quick Segments */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider mr-1">
              Quick Scope:
            </span>
            {scopes.map((s) => (
              <button
                key={s.n}
                type="button"
                onClick={() => {
                  setScope(s.n);
                  setPage(0);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
                  scope === s.n
                    ? 'bg-cobalt text-white font-semibold'
                    : 'bg-surface hover:bg-surface-subtle text-body border border-border-subtle'
                )}
              >
                <span>{s.n}</span>
                <span
                  className={cn(
                    'text-[10px] font-mono px-1 rounded',
                    scope === s.n ? 'bg-white/20 text-white' : 'text-muted'
                  )}
                >
                  {s.c >= 1000 ? `${(s.c / 1000).toFixed(1)}k` : s.c}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sev}
              onChange={(e) => {
                setSev(e.target.value);
                setPage(0);
              }}
              aria-label="Filter severitas"
              className="h-8 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Levels', 'Critical', 'Notice', 'Info'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <Button variant="ghost" onClick={reset} className="h-8 px-2 text-xs text-muted hover:text-fail">
              <RotateCcw size={12} className="mr-1" /> Reset
            </Button>
          </div>
        </div>
      </section>

      {/* 4. Tri-Pane Split Area (7/12 Master Feed / 5/12 State Inspector) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANE: Master Activity Feed (7 of 12 cols = 58.3%) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="bg-card rounded-xl border border-border-subtle shadow-card overflow-hidden">
            {/* Feed Top Controls */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted hidden sm:inline">
                  Server snapshot at page load — refresh re-fetches
                </span>
                <h2 className="text-sm font-semibold text-ink">Activity Stream</h2>
                <span className="text-xs font-mono text-muted">
                  ({shown.length} events in view)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={triggerRefetch}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border-subtle bg-card hover:bg-surface text-body transition-colors"
                  title="Paksa Muat Ulang"
                >
                  <RefreshCw size={13} className={cn(refetching && 'animate-spin')} />
                </button>
              </div>
            </div>

            {/* Event List — windowed saat besar (TASK-21) */}
            <div
              ref={feedWin.containerRef as React.RefObject<HTMLDivElement>}
              onScroll={feedWin.onScroll}
              className="divide-y divide-border-subtle flex flex-col overflow-y-auto max-h-[640px]"
              role="feed"
              aria-label="Feed audit"
            >
              {feedWin.topPad > 0 && <div style={{ height: feedWin.topPad }} aria-hidden="true" />}
              {feedWin.items.map((e) => {
                const isSel = sel.id === e.id;
                const s = severityOf(e.action);
                const href = entityHref(e.entityType, e.entityId);

                return (
                  <div
                    key={e.id}
                    onClick={() => setSelId(e.id)}
                    className={cn(
                      'p-3.5 cursor-pointer transition-colors relative flex flex-col gap-1.5',
                      isSel ? 'bg-[#EFF6FF]' : 'hover:bg-surface'
                    )}
                  >
                    {isSel && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cobalt" />
                    )}

                    {/* Meta Line */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-muted tabular-nums">
                          {fmtTs(e.ts)}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold',
                            s === 'Critical'
                              ? 'bg-fail-bg text-fail-ink border border-fail/30'
                              : s === 'Notice'
                              ? 'bg-warn-bg text-warn-ink border border-warn/30'
                              : 'bg-cobalt-tint text-cobalt-deep border border-cobalt/30'
                          )}
                        >
                          {e.action}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            onClick={(ev) => ev.stopPropagation()}
                            className="font-mono text-xs font-bold text-cobalt hover:underline flex items-center gap-0.5"
                          >
                            {e.entityId} <ArrowRight size={10} />
                          </Link>
                        ) : (
                          <span className="font-mono text-xs font-bold text-ink">
                            {e.entityId}
                          </span>
                        )}
                        <span className="px-1.5 py-0.2 rounded bg-surface border border-border-subtle text-muted text-[10px] font-semibold uppercase">
                          {e.entityType}
                        </span>
                        {e.demo && (
                          <span
                            className="px-1.5 py-0.2 rounded bg-warn-bg border border-warn/40 text-warn-ink text-[10px] font-mono font-bold uppercase"
                            title="Baris demonstrasi — bukan bagian ledger server"
                          >
                            Demo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 font-mono text-[11px] text-muted">
                        {e.hash ? (
                          <>
                            <ShieldCheck size={12} className="text-pass" />
                            <span className="truncate max-w-[120px]" title={e.hash}>
                              {e.hash.slice(0, 15)}…
                            </span>
                          </>
                        ) : (
                          <span className="text-muted" title="Event ini tidak punya chain-hash tersimpan (data fallback/demo)">— no hash</span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="text-xs text-body font-medium leading-snug">
                      {e.description}
                    </div>

                    {/* Actor, Terminal & Network Info */}
                    <div className="flex items-center justify-between text-muted text-[11px] pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-cobalt text-white flex items-center justify-center text-[10px] font-bold">
                          {e.actorInitials}
                        </div>
                        <span className="font-semibold text-body">{e.actorName}</span>
                        <span>•</span>
                        <span>{e.actorRole}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                        <span className="flex items-center gap-1" title={e.ip ? undefined : 'Server does not record source IP for this event'}>
                          <Network size={11} /> {e.ip ?? '—'}
                        </span>
                        <span>•</span>
                        <span title={e.terminal ? undefined : 'Server does not record terminal for this event'}>{e.terminal ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {feedWin.bottomPad > 0 && <div style={{ height: feedWin.bottomPad }} aria-hidden="true" />}

              {shown.length === 0 && (
                <div className="p-8 text-center text-muted flex flex-col items-center gap-2">
                  <History size={32} className="text-muted/50" />
                  <p className="font-semibold text-sm">No audit events match your filters</p>
                  <p className="text-xs">Reset the filters to inspect the full immutable ledger stream.</p>
                  <Button variant="secondary" onClick={reset} className="mt-2 text-xs">
                    Reset Filter
                  </Button>
                </div>
              )}
            </div>

            {/* Pagination Bar */}
            <div className="p-3 bg-surface border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                Showing {shown.length} of {filtered.length} filtered ({total} total in ledger)
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                  aria-label="Ukuran halaman"
                  className="h-8 px-2 border border-border-strong rounded bg-card text-body text-xs"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 px-2 text-xs"
                >
                  Prev
                </Button>
                <span className="font-mono">
                  {page + 1}/{pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: State Transition Audit & Diff Inspector (5 of 12 cols = 41.7%) */}
        <div className="lg:col-span-5 flex flex-col gap-4 sticky top-12">
          {sel ? (
            <div className="bg-card rounded-xl border border-border-subtle shadow-card overflow-hidden flex flex-col">
              {/* Context Header */}
              <div className="p-4 bg-surface border-b border-border-subtle flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Shield className="text-cobalt" size={16} />
                    <h3 className="text-sm font-bold text-ink">
                      State Transition &amp; Diff Inspector
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink text-[10px] font-mono font-bold flex items-center gap-1 border border-pass/30">
                    <Lock size={10} /> APPEND-ONLY
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-muted uppercase">Entity:</span>
                    <span className="font-mono text-xs font-bold text-cobalt">
                      {sel.entityId}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-surface border border-border-subtle text-muted text-[10px] font-semibold">
                      {sel.entityType}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted flex items-center gap-1.5">
                    <span>Event #{sel.id}</span>
                    {sel.demo && (
                      <span
                        className="px-1.5 py-0.2 rounded bg-warn-bg border border-warn/40 text-warn-ink text-[10px] font-bold uppercase"
                        title="Demonstration row — not part of the server ledger"
                      >
                        Demo
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cryptographic Proof Bar */}
              <div className="px-4 py-2.5 bg-cobalt-tint/40 border-b border-border-subtle flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted uppercase">
                    Cryptographic Event Hash (server):
                  </span>
                  {sel.hash ? (
                    <button
                      type="button"
                      onClick={() => copyHash(sel.hash)}
                      className="text-[11px] font-mono text-cobalt hover:underline flex items-center gap-1"
                    >
                      {copiedHash ? <Check size={12} className="text-pass" /> : <Copy size={12} />}
                      {copiedHash ? 'Copied' : 'Copy Full Hash'}
                    </button>
                  ) : null}
                </div>
                {sel.hash ? (
                  <div className="font-mono text-[11px] text-body bg-card border border-border-subtle px-2 py-1 rounded truncate select-all">
                    {sel.hash}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted bg-card border border-dashed border-border-subtle px-2 py-1 rounded">
                    No chain-hash recorded for this event (fallback/demo entry). Open <strong>Verify Cryptographic Root</strong> to run the server-side chain check over all real ledger rows.
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted font-mono pt-0.5">
                  <span className="flex items-center gap-1">
                    <Terminal size={11} className="text-cobalt" />
                    <span>POST /api/audit-trail/verify-chain</span>
                  </span>
                  <span className="text-muted flex items-center gap-1">
                    <ShieldCheck size={11} className="text-cobalt" /> Chain verified on request — not continuous
                  </span>
                </div>
              </div>

              {/* Diff View Mode Selector */}
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center p-0.5 bg-surface border border-border-subtle rounded-lg">
                    <button
                      type="button"
                      onClick={() => setViewMode('diff')}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
                        viewMode === 'diff'
                          ? 'bg-card text-body shadow-xs'
                          : 'text-muted hover:text-body'
                      )}
                    >
                      Formatted Diff (Field-by-Field)
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
                        viewMode === 'raw'
                          ? 'bg-card text-body shadow-xs'
                          : 'text-muted hover:text-body'
                      )}
                    >
                      Raw JSON Payload
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-muted">
                    {sel.diffs.length} Fields Mutated
                  </span>
                </div>

                {/* Formatted Diff Table */}
                {viewMode === 'diff' ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-surface border border-border-subtle p-2">
                    {sel.diffs.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-card border border-border-subtle rounded flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-body">
                            field: {d.field}
                          </span>
                          <span className="text-[10px] font-bold text-muted uppercase">
                            {d.tag}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <div className="p-2 rounded bg-fail-bg/70 border border-fail/20 text-fail-ink line-through break-all">
                            - {d.oldVal}
                          </div>
                          <div className="p-2 rounded bg-pass-bg/70 border border-pass/20 text-pass-ink font-semibold break-all">
                            + {d.newVal}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate900 p-3 overflow-x-auto text-white">
                    <pre className="font-mono text-[11px] leading-relaxed">
                      <code>
                        {JSON.stringify(
                          {
                            event_id: `EVT-${sel.id}`,
                            action: sel.action,
                            entity: {
                              type: sel.entityType,
                              id: sel.entityId,
                            },
                            actor: {
                              name: sel.actorName,
                              role: sel.actorRole,
                            },
                            before: sel.before,
                            after: sel.after,
                            hash: sel.hash,
                            request_id: sel.requestId,
                            session: sel.session,
                          },
                          null,
                          2
                        )}
                      </code>
                    </pre>
                  </div>
                )}
              </div>

              {/* Actor & Session Metadata Sub-Card */}
              <div className="p-4 bg-surface border-t border-b border-border-subtle flex flex-col gap-2 text-xs">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Authentication &amp; Session Envelope
                </span>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Verified Identity</span>
                    <span className="font-semibold text-body">
                      {sel.actorName}
                      {sel.session.badge ? ` (${sel.session.badge})` : ''}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">IP &amp; Subnet</span>
                    <span className="font-mono text-body text-[11px]" title={sel.session.ip ? undefined : 'Not recorded by the server'}>
                      {sel.session.ip ?? '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Client Environment</span>
                    <span className="text-body font-mono text-[11px] truncate" title={sel.session.env ?? 'Not recorded by the server'}>
                      {sel.session.env ?? '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Physical Station</span>
                    <span className="text-body" title={sel.session.location ? undefined : 'Not recorded by the server'}>
                      {sel.session.location ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="mt-1 pt-1.5 flex items-center justify-between bg-card border border-border-subtle px-2.5 py-1.5 rounded">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <KeyRound size={12} className="text-pass" /> Two-Factor Auth:
                  </span>
                  <span
                    className="font-mono text-[11px] text-pass-ink font-bold"
                    title={sel.session.mfa ? undefined : 'Not recorded by the server'}
                  >
                    {sel.session.mfa ?? '—'}
                  </span>
                </div>
              </div>

              {/* Forensic Action Buttons */}
              <div className="p-3 bg-card flex items-center justify-between gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  onClick={() => downloadEvidence(sel)}
                  className="h-8 px-2.5 text-xs gap-1"
                  title="Unsigned JSON snapshot of this event plus chain status"
                >
                  <FileDown size={13} /> Download Event Evidence (JSON)
                </Button>

                <div className="flex items-center gap-1.5">
                  {/* Rollback Simulation Dialog */}
                  <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" className="h-8 px-2.5 text-xs gap-1">
                        <History size={13} /> Rollback Simulation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="text-warn" size={18} /> Rollback Dry-Run Simulation
                      </DialogTitle>
                      <DialogDescription>
                        Evaluate compensating transaction impact for Event #{sel.id} ({sel.entityId}).
                      </DialogDescription>
                      <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-2 my-2">
                        <div className="flex justify-between">
                          <span className="text-muted">Target Entity:</span>
                          <span className="font-mono font-bold text-cobalt">{sel.entityId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Target Action:</span>
                          <span className="font-mono font-bold">{sel.action}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Ledger Guard:</span>
                          <span className="font-semibold text-pass-ink">APPEND-ONLY (no update API)</span>
                        </div>
                        <p className="text-[11px] text-muted pt-2 border-t border-border-subtle">
                          <strong>Note:</strong> this is a dry-run simulation — it writes nothing to the ledger. A real reversal would issue a new compensating audit block with <span className="font-mono">action: REVERT_{sel.action}</span> and cross-reference block #{sel.id}.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setRollbackOpen(false)}>
                          Batal
                        </Button>
                        <Button
                          onClick={() => {
                            setRollbackOpen(false);
                            push(true, 'Dry-Run Rollback Selesai', 'Hanya simulasi — tidak ada tulis ke ledger.');
                          }}
                        >
                          Acknowledge Dry-Run
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Flag Review Dialog */}
                  <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="h-8 px-2.5 text-xs gap-1">
                        <Flag size={13} /> Flag Review
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="flex items-center gap-2">
                        <Flag className="text-fail" size={18} /> Flag Event for Compliance Review
                      </DialogTitle>
                      <DialogDescription>
                        Escalates Event #{sel.id} ({sel.entityId}) to the Security &amp; Audit Committee.
                      </DialogDescription>
                      <p className="rounded border border-warn/40 bg-warn-bg px-2.5 py-1.5 text-[11px] text-warn-ink my-2">
                        Server-side escalation is not implemented — confirming records nothing on the server.
                      </p>
                      <div className="space-y-3 my-2 text-xs">
                        <div>
                          <label className="font-semibold block mb-1">Flag Category</label>
                          <select
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            className="w-full h-8 px-2 border border-border-strong rounded text-xs bg-card"
                          >
                            <option>Suspicious Privilege Escalation</option>
                            <option>Off-hours Threshold Breach</option>
                            <option>Unusual Asset State Modification</option>
                            <option>Fiscal Cap Deviation</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Investigation Notes (Optional)</label>
                          <textarea
                            value={flagNotes}
                            onChange={(e) => setFlagNotes(e.target.value)}
                            placeholder="Jelaskan alasan eskalasi keamanan..."
                            rows={3}
                            className="w-full p-2 border border-border-strong rounded text-xs bg-card"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setFlagOpen(false)}>
                          Batal
                        </Button>
                        <Button variant="destructive" onClick={submitFlag}>
                          Konfirmasi Eskalasi Flag
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border-subtle p-8 text-center text-muted">
              Select an event from the activity stream to inspect its cryptographic state transition.
            </div>
          )}

          {/* Cryptographic Ledger Health Widget — honest: state hanya dari verify-chain nyata */}
          <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Network className="text-pass" size={16} />
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Ledger Integrity
                </h4>
              </div>
              <span className={cn(
                'font-mono text-[10px] font-bold px-2 py-0.5 rounded border',
                verifyResult
                  ? verifyResult.valid
                    ? 'text-pass-ink bg-pass-bg border-pass/30'
                    : 'text-fail bg-fail-bg border-fail/30'
                  : 'text-muted bg-surface border-border-subtle',
              )}>
                {verifyResult ? (verifyResult.valid ? 'VALID' : 'MISMATCH') : 'UNVERIFIED'}
              </span>
            </div>

            {verifyResult ? (
              <div className="grid grid-cols-3 gap-2 text-center pt-1 text-xs">
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Events
                  </span>
                  <span className="font-mono font-bold text-body">{verifyResult.verifiedCount.toLocaleString('en-US')}</span>
                </div>
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Root Hash
                  </span>
                  <span className="font-mono font-bold text-body" title={verifyResult.rootHash}>{verifyResult.rootHash.slice(0, 8)}…</span>
                </div>
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Checked At
                  </span>
                  <span className="font-mono font-bold text-pass-ink">
                    {new Date(verifyResult.verificationTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted leading-snug">
                Integrity is computed on demand by the server — this panel shows no claim until <strong>Verify Cryptographic Root</strong> is run.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Floating Toast Notification Container */}
            <ToastStack toasts={toasts} onDismiss={dismiss} className="pointer-events-none [&>div]:pointer-events-auto" />
    </div>
  );
}

const downloadFile = (filename: string, text: string, type: string) => downloadText(filename, text, type);
