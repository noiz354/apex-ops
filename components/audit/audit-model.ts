import type { AuditRow } from '@/lib/services/audit-service';

export type Sev = 'Critical' | 'Notice' | 'Info';
export type ViewMode = 'diff' | 'raw';


export function severityOf(action: string): Sev {
  if (/FAIL|LOCKED|REJECT|BREACH|CRITICAL|ALERT|SUSPEND/.test(action.toUpperCase())) return 'Critical';
  if (/HOLD|ESCALATE|CANCEL|CLOSE|REVOKE|LOGOUT|POLICY/.test(action.toUpperCase())) return 'Notice';
  return 'Info';
}

export const ENTITY_SCOPE_MAP: Record<string, string> = {
  auth: 'Security & Auth',
  work_order: 'Work Orders',
  service_request: 'Service Requests',
  asset: 'Asset State',
  purchasing: 'Purchasing & POs',
  inventory: 'Inventory',
  other: 'Other',
};

export function entityHref(entityType: string | null, entityId: string | null): string | null {
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

export function fmtTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)} UTC`;
  } catch {
    return iso;
  }
}


export interface ProcessedEvent {
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

export const CANONICAL_FALLBACK_EVENTS: ProcessedEvent[] = [
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

export function processDbRow(r: AuditRow): ProcessedEvent {
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
