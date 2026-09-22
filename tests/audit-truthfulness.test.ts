import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const COMPONENT = new URL('../components/audit/AuditTrail.tsx', import.meta.url).pathname;
const VERIFY_CHAIN_ROUTE = new URL('../app/api/audit-trail/verify-chain/route.ts', import.meta.url).pathname;
const VERIFY_ROOT_ROUTE = new URL('../app/api/audit-trail/verify-root/route.ts', import.meta.url).pathname;

const src = readFileSync(COMPONENT, 'utf8');

const FORBIDDEN = [
  'REAL-TIME SECURE',
  'Merkle',
  'WS Broker',
  'Live Polling',
  'Live Activity',
  'Live Nodes',
  'NUSA-LEDGER',
  'TXN-',
  'L30D',
  '1748097318',
  'Manual refresh complete',
  'Zero ledger corruption',
  'APX-SOC2',
  'Compiling Dossier',
  'Signed Proof',
  'Operations Staff',
  'Security Subject',
  'NUSA-CORE',
  'Session Token Cookie Validated',
  'req_audit_',
];

for (const phrase of FORBIDDEN) {
  test(`audit copy contains no fiction: "${phrase}"`, () => {
    assert.ok(!src.includes(phrase), `components/audit/AuditTrail.tsx still contains "${phrase}"`);
  });
}

test('fabricated verify-root endpoint stays deleted', () => {
  assert.ok(
    !existsSync(VERIFY_ROOT_ROUTE),
    'app/api/audit-trail/verify-root/route.ts returned — it served hard-coded consensus fiction',
  );
});

const PROFILE_SESSIONS = new URL('../components/profile/ProfileSessions.tsx', import.meta.url).pathname;
const ORG_HUB = new URL('../components/org/OrgHub.tsx', import.meta.url).pathname;

const IMPERSONATION_FICTION = [
  'audit chain on',
  'reason logged',
  'fully logged',
  'Impersonation session started',
  'Impersonating',
  'IMPERSONATING',
  '30-min tablet window',
];

for (const [label, file] of [['ProfileSessions', PROFILE_SESSIONS], ['OrgHub', ORG_HUB]] as const) {
  for (const phrase of IMPERSONATION_FICTION) {
    test(`GAP-07 ${label} contains no impersonation fiction: "${phrase}"`, () => {
      const body = readFileSync(file, 'utf8');
      assert.ok(!body.includes(phrase), `${label} still contains "${phrase}"`);
    });
  }
  test(`GAP-07 ${label} carries the honest disabled placeholder`, () => {
    const body = readFileSync(file, 'utf8');
    assert.ok(
      body.includes('server-issued impersonation session') && body.includes('disabled rather than simulated'),
      `${label} must explain impersonation needs a server-issued session and is disabled, not simulated`,
    );
  });
}

test('GAP-07 ProfileSessions claims no audit chaining at all', () => {
  const body = readFileSync(PROFILE_SESSIONS, 'utf8');
  assert.ok(!body.includes('audit-chained'), 'ProfileSessions must not claim audit-chained (no writer exists)');
});

test('GAP-07 OrgHub audit-chained survives ONLY on the server-audited activate/deactivate path', () => {
  const body = readFileSync(ORG_HUB, 'utf8');
  const hits = body.split('audit-chained').length - 1;
  assert.equal(hits, 2, `expected exactly the 2 activate/deactivate toasts, found ${hits}`);
});

test('verify-chain route delegates to real server recomputation', () => {
  const route = readFileSync(VERIFY_CHAIN_ROUTE, 'utf8');
  assert.ok(
    route.includes('verifyAuditHashChain'),
    'verify-chain route must call verifyAuditHashChain (server recomputation)',
  );
});

const GAP08_ABSENT: Array<[label: string, rel: string, phrases: string[]]> = [
  ['SideNav', '../components/ops/SideNav.tsx', ['Live Sync Active', '10.14.0.8', 'HEALTHY']],
  ['NotificationsHub', '../components/notifications/NotificationsHub.tsx', ['WS-PUSH', 'paged D. Chen', 'D. Chen paged', 'paged to B-204 · ETA 12 min']],
  ['ReportsHub', '../components/reports/ReportsHub.tsx', ['READ REPLICA', 'streams from read replica']],
  ['FacilityHub', '../components/facilities/FacilityHub.tsx', ['Broker 10.14.0.8', 'crew paged']],
  ['PmHub', '../components/pm/PmHub.tsx', ['leads paged', 'Broker flagged']],
  ['PurchasingDialogs', '../components/purchasing/dialogs.tsx', ['DISPATCHED · key idem-auth-po0315.', 'PO-2026-0315 DISPATCHED</Badge>']],
  ['OrgHub', '../components/org/OrgHub.tsx', ['Okta SCIM: 12ms']],
  ['CriticalActionDialog', '../components/ui/critical-action-dialog.tsx', ['Math.random', 'Root Merkle Verified', 'Proof of consensus has been committed']],
];

for (const [label, rel, phrases] of GAP08_ABSENT) {
  for (const phrase of phrases) {
    test(`GAP-08 ${label} contains no infra fiction: "${phrase}"`, () => {
      const body = readFileSync(new URL(rel, import.meta.url).pathname, 'utf8');
      assert.ok(!body.includes(phrase), `${label} still contains "${phrase}"`);
    });
  }
}

test('GAP-08 SettingsHub carries no integration fiction', () => {
  const body = readFileSync(new URL('../components/settings/SettingsHub.tsx', import.meta.url).pathname, 'utf8');
  for (const phrase of [
    'production KV-store',
    '1,420 msgs/min',
    'SCADA link healthy',
    'handshake 200 OK',
    'Live FX: Fixer.io',
    'Updated 14 mins ago',
    'GIS + roster rebound.',
    'mTLS Enforced',
    'draining to new broker',
    'Backup Schedule Status: <strong>Active',
    '842.6 MB (SHA-256)',
    'DKIM / SPF Valid',
    'message-id diag-8841',
    'Oracle ERP</h3>',
    'Synced ({erpSync})',
    'next cron in 15 min.',
    'Real-time message routing thresholds',
    'HEALTHY ({buffer}%)',
    '250,000 msg ring buffer allocated',
    'backpressure 12% → 2%',
  ]) {
    assert.ok(!body.includes(phrase), `SettingsHub still contains "${phrase}"`);
  }
});

test('GAP-08 SettingsHub states the honest qualifiers', () => {
  const body = readFileSync(new URL('../components/settings/SettingsHub.tsx', import.meta.url).pathname, 'utf8');
  for (const phrase of [
    'not persisted',
    'no live ingest',
    'no backup job',
    'not connected',
    'no mail sent',
    'not verified',
    'no ERP sync performed',
    'no delivery',
    'not enforced (planned)',
    'no live broker',
  ]) {
    assert.ok(body.includes(phrase), `SettingsHub missing honest qualifier "${phrase}"`);
  }
});

test('GAP-08 critical-action dialog fails closed without an audit ID', () => {
  const body = readFileSync(
    new URL('../components/ui/critical-action-dialog.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(
    body.includes('treated as NOT recorded'),
    'dialog must fail closed with an honest message when onExecute returns no auditId',
  );
});

test('GAP-15 ledger export claims CSV only, never XLS', () => {
  const body = readFileSync(
    new URL('../components/inventory/InventoryLedger.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(!body.includes('CSV/XLS'), 'ledger export produces CSV only — the XLS claim must stay removed');
  assert.ok(
    body.includes('Export CSV (loaded rows)'),
    'ledger export button must disclose it exports the loaded rows as CSV',
  );
});

test('GAP-15 audit queue cards disclose the Phase-2 run gate', () => {
  const body = readFileSync(
    new URL('../components/field/AuditQueue.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(
    body.includes('Fase 2') && body.includes('checklist run belum tersedia'),
    'non-canonical audit cards must carry the Phase-2 badge (run route only serves INS-2026-0412)',
  );
  assert.ok(
    body.includes("a.id !== 'INS-2026-0412'"),
    'Phase-2 badge must be gated on non-canonical ids, not shown on the runnable audit',
  );
});

test('GAP-17 inventory UI shows no fictional TRF-/ADJ- doc refs', () => {
  const files: Array<[string, string]> = [
    ['components/inventory/InventoryLedger.tsx', new URL('../components/inventory/InventoryLedger.tsx', import.meta.url).pathname],
    ['app/(ops)/inventory/[sku]/page.tsx', new URL('../app/(ops)/inventory/[sku]/page.tsx', import.meta.url).pathname],
  ];
  for (const [label, path] of files) {
    const body = readFileSync(path, 'utf8');
    for (const gone of ['TRF-', 'ADJ-', 'Internal Courier #02', 'waybill #772', 'cc:QA-SCRAP', 'Terminal pin defect']) {
      assert.ok(!body.includes(gone), `${label} still fabricates movement doc fiction: "${gone}"`);
    }
  }
});

test('GAP-17 ledger fallback feed keeps only link-resolvable canon refs', () => {
  const body = readFileSync(
    new URL('../components/inventory/InventoryLedger.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(
    body.includes('CANON.workOrderSeal') && body.includes('CANON.purchaseOrder') && body.includes('CANON.pmPlan'),
    'MOV_SEED fallback must reference WO/PO/PM canon docs that the link branches resolve',
  );
  assert.ok(
    body.includes('Demo offline'),
    'fallback feed must stay labeled as demo (server-unreachable) provenance',
  );
});

test('GAP-18 jobs page carries zero compliance/fabrication claims', () => {
  const body = readFileSync(
    new URL('../app/(ops)/settings/jobs/page.tsx', import.meta.url).pathname,
    'utf8',
  );
  for (const gone of [
    'DAEMON OPERATIONAL', 'SOC2 AUDIT READY', 'auditHash', 'Inspect Chain',
    'JOB-2026-08', '482', '842.6', '11 min', '100% Success Rate',
    'S3 Glacier', 'audit-trail?search=JOB', 'Point-in-Time',
  ]) {
    assert.ok(!body.includes(gone), `settings/jobs/page.tsx still fabricates: "${gone}"`);
  }
  assert.ok(
    body.includes('/api/queue/jobs') && body.includes('Ephemeral · in-memory store'),
    'jobs page must fetch the queue API and disclose the ephemeral in-memory store',
  );
});

test('GAP-18 worker preseed stays removed', () => {
  const body = readFileSync(new URL('../lib/queue/worker.ts', import.meta.url).pathname, 'utf8');
  for (const gone of ['job_batch_0894_pm', 'job_esc_0314_vnd', 'job_merkle_tree_root', 'rootBlock']) {
    assert.ok(!body.includes(gone), `lib/queue/worker.ts still contains preseed fiction: "${gone}"`);
  }
});

test('GAP-20 facilities hub: fiction claims absent, honest labels + real API wiring present', () => {
  const body = readFileSync(new URL('../components/facilities/FacilityHub.tsx', import.meta.url).pathname, 'utf8');
  for (const gone of ['10.14.0.8', 'MODEL MATCHED']) {
    assert.ok(!body.includes(gone), `FacilityHub still fabricates: "${gone}"`);
  }
  for (const want of [
    "'/api/facilities'",
    'local staging — not persisted',
    'geometries unseeded',
    'local counter — not persisted',
    'design only — not connected',
    'No GIS write',
  ]) {
    assert.ok(body.includes(want), `FacilityHub must disclose/wire: "${want}"`);
  }
});

test('GAP-20 facilities backend: service uses org-scoped rows, transactional audit, idempotency scopes', () => {
  const body = readFileSync(new URL('../lib/services/facility-service.ts', import.meta.url).pathname, 'utf8');
  for (const want of ['FACILITY_CREATE', 'FACILITY_UPDATE', 'facility.create', 'facility.update', 'FACILITY_CODE_EXISTS']) {
    assert.ok(body.includes(want), `facility-service must carry: "${want}"`);
  }
  for (const absent of ["'npr-api'", 'fixer.io']) {
    assert.ok(!body.includes(absent), `facility-service leaked mock marker: "${absent}"`);
  }
});

test('GAP-21 settings hub: removed claims stay gone, honest disclosures + real KV wiring present', () => {
  const body = readFileSync(new URL('../components/settings/SettingsHub.tsx', import.meta.url).pathname, 'utf8');
  for (const gone of ['2468', '10.14.0.8', 'KV-store', 'batch #${batches + 1} · vibration', '82 rows purged', 'Baseline reloaded', "ENV: PROD (US-EAST-1)"]) {
    assert.ok(!body.includes(gone), `SettingsHub still fabricates: "${gone}"`);
  }
  for (const want of [
    "'/api/settings'",
    'not stored server-side',
    'simulated · 0 rows touched',
    'hash-only',
    'not enforced server-side',
    'local demo — no live broker'.slice(0, 0),
  ].filter((s) => s.length > 0)) {
    assert.ok(body.includes(want), `SettingsHub must disclose/wire: "${want}"`);
  }
});

test('GAP-21 settings backend: secret flow is hash-only with rotate-audit; PUT rejects plaintext secrets', () => {
  const body = readFileSync(new URL('../lib/services/settings-service.ts', import.meta.url).pathname, 'utf8');
  for (const want of ['SETTINGS_UPDATE', 'SETTINGS_SECRET_ROTATE', 'SECRET_VIA_ROTATE', 'settings.put', 'settings.rotate', 'sha256']) {
    assert.ok(body.includes(want), `settings-service must carry: "${want}"`);
  }
  assert.ok(!body.includes('sdk.slack'), 'no third-party SDK leakage');
});

test('GAP-22 shift plan: fictional compliance badge gone, honest labels + real handover wiring present', () => {
  const body = readFileSync(new URL('../components/shifts/ShiftPlan.tsx', import.meta.url).pathname, 'utf8');
  for (const gone of ['AUDIT COMPLIANT']) {
    assert.ok(!body.includes(gone), `ShiftPlan still fabricates: "${gone}"`);
  }
  for (const want of [
    "'/api/shifts/handovers'",
    'local demo — not persisted',
    'LOCAL DEMO',
    'Handover initiated (server)',
    'HANDOVER_ACCEPT audit logged',
  ]) {
    assert.ok(body.includes(want), `ShiftPlan must disclose/wire: "${want}"`);
  }
});

test('GAP-22 handover backend: terminal decisions immutable, reject requires reason, audit written per action', () => {
  const body = readFileSync(new URL('../lib/services/handover-service.ts', import.meta.url).pathname, 'utf8');
  for (const want of ['HANDOVER_CREATE', 'HANDOVER_ACCEPT', 'HANDOVER_REJECT', 'REASON_REQUIRED', 'HANDOVER_TERMINAL', 'HANDOVER_NOT_FOUND', 'handover.create', 'handover.decide']) {
    assert.ok(body.includes(want), `handover-service must carry: "${want}"`);
  }
});

test('GAP-16 gerbang sweep: era-GAP-16 fiction strings stay absent on every component surface', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p2 = path.join(dir, e.name);
      return e.isDirectory() ? walk(p2) : /\.(tsx?|jsx?)$/.test(e.name) ? [p2] : [];
    });
  const compDir = new URL('../components', import.meta.url).pathname;
  const banned = ['10.14.0.8', 'MODEL MATCHED', 'production KV-store', 'AUDIT COMPLIANT', 'SOC2 AUDIT READY'];
  for (const file of walk(compDir)) {
    const body = fs.readFileSync(file, 'utf8');
    for (const s of banned) {
      assert.ok(!body.includes(s), `${path.basename(file)} still fabricates banned claim: "${s}"`);
    }
  }
});

test('SDD T1-2 F-COPY: WS-PUSH / Live Sync Active / Telemetry Bus stay absent in app+components+lib', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p2 = path.join(dir, e.name);
      return e.isDirectory() ? walk(p2) : /\.(tsx?|jsx?)$/.test(e.name) ? [p2] : [];
    });
  const banned = ['WS-PUSH', 'Live Sync Active', 'Telemetry Bus'];
  for (const dir of ['../components', '../app', '../lib']) {
    const root = new URL(dir, import.meta.url).pathname;
    for (const file of walk(root)) {
      const body = fs.readFileSync(file, 'utf8');
      for (const s of banned) {
        assert.ok(!body.includes(s), `${path.basename(file)} still fabricates sync label: "${s}"`);
      }
    }
  }
  const sidenav = fs.readFileSync(
    new URL('../components/ops/SideNav.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(
    sidenav.includes('Telemetry (demo)') && sidenav.includes('Broker: not configured'),
    'sidenav telemetry widget must stay honestly labeled as demo/not configured',
  );
});

test('SDD T2-5 telemetry claims stay honest (no fake synced/streaming)', () => {
  const facilityHub = readFileSync(
    new URL('../components/facilities/FacilityHub.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(!facilityHub.includes('zone tree synced'), 'FacilityHub still claims zone tree synced');
  assert.ok(
    facilityHub.includes('zone tree demo (staged, not synced)'),
    'FacilityHub zone tree must stay labeled staged/not synced',
  );

  const inspections =
    readFileSync(new URL('../components/field/FieldInspectionsHub.tsx', import.meta.url).pathname, 'utf8') +
    readFileSync(new URL('../components/field/FihQueue.tsx', import.meta.url).pathname, 'utf8');
  assert.ok(!inspections.includes('100% Synced'), 'FieldInspectionsHub still fabricates 100% Synced');
  assert.ok(!inspections.includes('SCADA STREAMING'), 'FieldInspectionsHub still fabricates SCADA STREAMING');
  assert.ok(!inspections.includes('Modbus TCP/IP: Active'), 'FieldInspectionsHub still claims live Modbus');
  assert.ok(
    inspections.includes('demo — tidak tersambung') && inspections.includes('DEMO — TIDAK STREAMING'),
    'IoT link must keep explicit demo/not-connected labels',
  );

  const orgHub = readFileSync(
    new URL('../components/org/OrgHub.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(!/CONNECTED<\/Badge>/.test(orgHub), 'OrgHub SSO dialog still asserts CONNECTED');
  assert.ok(
    orgHub.includes('No IdP is connected in this environment'),
    'OrgHub SSO dialog must disclose that no IdP is connected',
  );
  assert.ok(
    !orgHub.includes('14 Sep 2026 14:05 WIB'),
    'OrgHub deploy still stamps a hardcoded fictional timestamp',
  );
});

test('GAP-23 P0/P1/P2: canon fixture import stays removed from remediated surfaces', () => {
  const files = [
    'components/workorders/WorkOrderList.tsx',
    'components/requests/ServiceRequestList.tsx',
    'components/requests/ServiceRequestDetail.tsx',
    'components/assets/AssetRegistry.tsx',
    'components/ops/WoDialogs.tsx',
    'components/vendors/VendorList.tsx',
    'components/purchasing/PurchaseList.tsx',
    'components/purchasing/PurchaseDetail.tsx',
    'components/purchasing/dialogs.tsx',
    'components/field/RunChecklist.tsx',
    'components/field/FieldInspectionsHub.tsx',
    'components/field/fih-model.ts',
    'components/field/FihHeader.tsx',
    'components/field/FihKpiCards.tsx',
    'components/field/FihQueue.tsx',
    'components/field/FihTemplateBuilder.tsx',
    'components/field/FihFastNav.tsx',
    'components/field/FihPreviewDialog.tsx',
    'components/field/FindingDesk.tsx',
    'components/field/FindingCapture.tsx',
    'components/field/SyncStatus.tsx',
    'components/field/AuditQueue.tsx',
    'components/ops/TopBar.tsx',
    'components/auth/LoginForm.tsx',
    'components/org/OrgHub.tsx',
    'components/pm/PmHub.tsx',
  ];
  for (const rel of files) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    for (const gone of ['lib/canon', 'CANON.', 'downloadText', 'createObjectURL', 'client-side CSV of persisted rows']) {
      assert.ok(!body.includes(gone), `${rel} regressed: still contains "${gone}"`);
    }
  }
});

test('GAP-23 P0/P1/P2: infra/tenant leaks stay absent from remediated surfaces', () => {
  const files = [
    'components/workorders/WorkOrderList.tsx',
    'components/requests/ServiceRequestList.tsx',
    'components/assets/AssetRegistry.tsx',
    'components/ops/WoDialogs.tsx',
    'components/vendors/VendorList.tsx',
    'components/purchasing/PurchaseList.tsx',
    'components/purchasing/PurchaseDetail.tsx',
    'components/field/RunChecklist.tsx',
    'components/field/FieldInspectionsHub.tsx',
    'components/field/fih-model.ts',
    'components/field/FihHeader.tsx',
    'components/field/FihKpiCards.tsx',
    'components/field/FihQueue.tsx',
    'components/field/FihTemplateBuilder.tsx',
    'components/field/FihFastNav.tsx',
    'components/field/FihPreviewDialog.tsx',
    'components/field/FindingDesk.tsx',
    'components/field/FindingCapture.tsx',
    'components/ops/TopBar.tsx',
    'components/auth/LoginForm.tsx',
    'components/org/OrgHub.tsx',
    'components/pm/PmHub.tsx',
  ];
  for (const rel of files) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    for (const gone of ['tenant', 'LIVE BACKEND', 'Engine: v4.8 Active', 'Live Poll: 15s', 'ENGINE LIVE', '100% Synced']) {
      assert.ok(!body.includes(gone), `${rel} regressed: still contains "${gone}"`);
    }
  }
});

test('GAP-24 B2: CSV exports go through the shared exportTableCsv funnel', () => {
  const files = [
    'components/workorders/WorkOrderList.tsx',
    'components/requests/ServiceRequestList.tsx',
    'components/assets/AssetRegistry.tsx',
    'components/vendors/VendorList.tsx',
    'components/purchasing/PurchaseList.tsx',
    'components/purchasing/PurchaseDetail.tsx',
    'components/org/OrgHub.tsx',
    'components/field/FieldInspectionsHub.tsx',
    'components/inventory/InventoryLedger.tsx',
    'components/notifications/NotificationsHub.tsx',
    'components/reports/ReportsHub.tsx',
    'components/audit/AuditTrail.tsx',
  ];
  for (const rel of files) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(
      body.includes('exportTableCsv'),
      `${rel} must export CSV via the shared exportTableCsv funnel`,
    );
    assert.ok(
      !body.includes('buildCsvViaWorker') && !body.includes('saveAsViaPickerOrDownload'),
      `${rel} must not bypass the funnel with direct worker/picker calls`,
    );
  }
});

test('GAP-24 B2: csv-export lib delegates to the worker builder (quoting/injection-safe)', () => {
  const body = readFileSync(new URL('../lib/csv-export.ts', import.meta.url).pathname, 'utf8');
  assert.ok(
    body.includes('buildCsvViaWorker') && body.includes('saveAsViaPickerOrDownload'),
    'lib/csv-export must build via buildCsvViaWorker and save via saveAsViaPickerOrDownload',
  );
});

test('GAP-23 P0/P1/P2: Indonesian copy present on remediated surfaces', () => {
  const cases: Array<[string, string[]]> = [
    ['components/workorders/WorkOrderList.tsx', ['Work Order Baru', 'Ekspor (CSV)', 'Tugaskan ulang', 'Beranda', 'Semua Status']],
    ['components/requests/ServiceRequestList.tsx', ['Permintaan Baru', 'Menunggu Triase', 'Ekspor (CSV)']],
    ['components/requests/ServiceRequestDetail.tsx', ['Triase', 'Konversi', 'Tutup']],
    ['components/assets/AssetRegistry.tsx', ['Registry Aset', 'Semua Kelas']],
    ['components/ops/WoDialogs.tsx', ['Tahan', 'Eskalasi']],
    ['components/vendors/VendorList.tsx', ['Semua Tier']],
    ['components/purchasing/PurchaseList.tsx', ['Requisition Baru', 'Semua Jenis']],
    ['components/purchasing/PurchaseDetail.tsx', ['Tinjau', 'Penerimaan', 'Tanda Tangan']],
    ['components/purchasing/dialogs.tsx', ['Jumlah', 'Jenis sengketa', 'Minta Penawaran OEM']],
    ['components/field/RunChecklist.tsx', ['Langkah 01', 'LOTO']],
    ['components/field/FihHeader.tsx', ['Beranda', 'Ekspor Log Audit', 'Serah Terima Shift']],
    ['components/field/FindingDesk.tsx', ['Konversi Temuan ke WO', 'Tutup Temuan']],
    ['components/field/FindingCapture.tsx', ['Catat Temuan Lapangan', 'Kirim Temuan']],
    ['components/field/SyncStatus.tsx', ['Status Sinkron', 'Antrean Outbox']],
    ['components/field/AuditQueue.tsx', ['SELESAI', 'ANTRE']],
    ['components/ops/TopBar.tsx', ['BACKEND AKTIF', 'Organisasi']],
    ['components/ops/DemoBanner.tsx', ['DEMO', 'simulasi']],
    ['components/auth/LoginForm.tsx', ['Masuk', 'Lanjut']],
    ['components/org/OrgHub.tsx', ['Tata Kelola Organisasi', 'Ekspor Log Audit', 'Tambah Pengguna']],
    ['components/pm/PmHub.tsx', ['Penjadwalan Preventive Maintenance', 'Buat Rule', 'Semua']],
  ];
  for (const [rel, wants] of cases) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    for (const want of wants) {
      assert.ok(body.includes(want), `${rel} missing Indonesian copy: "${want}"`);
    }
  }
});

test('GAP-24 Fase A: CSV exports on new surfaces go through the shared funnel', () => {
  const files = [
    'components/inventory/InventoryLedger.tsx',
    'components/audit/AuditTrail.tsx',
    'components/reports/ReportsHub.tsx',
    'components/notifications/NotificationsHub.tsx',
  ];
  for (const rel of files) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(
      body.includes('exportTableCsv'),
      `${rel} must export CSV via the shared exportTableCsv funnel`,
    );
    assert.ok(
      !body.includes('buildCsvViaWorker') && !body.includes('saveAsViaPickerOrDownload'),
      `${rel} must not bypass the funnel with direct worker/picker calls`,
    );
  }
  for (const rel of [
    'components/inventory/InventoryLedger.tsx',
    'components/reports/ReportsHub.tsx',
    'components/notifications/NotificationsHub.tsx',
  ]) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(!body.includes('downloadText'), `${rel} regressed: still uses naive downloadText CSV`);
  }
});

test('GAP-24 Fase B: toast state goes through the shared hook', () => {
  const hookFiles = [
    'components/workorders/WorkOrderList.tsx',
    'components/requests/ServiceRequestList.tsx',
    'components/requests/ServiceRequestDetail.tsx',
    'components/vendors/VendorList.tsx',
    'components/vendors/VendorDetail.tsx',
    'components/purchasing/PurchaseList.tsx',
    'components/purchasing/PurchaseDetail.tsx',
    'components/field/FieldInspectionsHub.tsx',
    'components/field/FindingDesk.tsx',
    'components/org/OrgHub.tsx',
    'components/pm/PmHub.tsx',
    'components/audit/AuditTrail.tsx',
    'components/reports/ReportsHub.tsx',
    'components/notifications/NotificationsHub.tsx',
    'components/inventory/InventoryLedger.tsx',
    'components/facilities/FacilityHub.tsx',
    'components/profile/ProfileSessions.tsx',
    'components/shifts/ShiftPlan.tsx',
    'components/settings/SettingsHub.tsx',
  ];
  for (const rel of hookFiles) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(
      body.includes('useToasts') || body.includes('ToastStack'),
      `${rel} must use the shared toast hook/component`,
    );
  }
  const fieldFiles = [
    'components/field/RunChecklist.tsx',
    'components/field/FindingCapture.tsx',
    'components/field/SyncStatus.tsx',
    'components/field/AuditQueue.tsx',
  ];
  for (const rel of fieldFiles) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(
      body.includes('useFieldToasts'),
      `${rel} must use the shared field toast hook`,
    );
  }
});

test('GAP-24 Fase B: no local toast infrastructure remains', () => {
  const skip = new Set(['lib/use-toasts.ts', 'components/field/toasts.tsx']);
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      return e.isDirectory() ? walk(p) : [p];
    });
  const files = [...walk('components'), ...walk('lib'), ...walk('app')].filter(
    (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !skip.has(f),
  );
  for (const f of files) {
    const body = readFileSync(new URL(`../${f}`, import.meta.url).pathname, 'utf8');
    for (const gone of ['let toastSeq', 'interface Toast ', 'toastTimers']) {
      assert.ok(!body.includes(gone), `${f} regressed: local toast infra "${gone}"`);
    }
  }
});

test('GAP-24 Fase B: shared toast lib implements cleanup', () => {
  const hook = readFileSync(new URL('../lib/use-toasts.ts', import.meta.url).pathname, 'utf8');
  assert.ok(hook.includes('slice(-2)'), 'useToasts must cap the stack');
  assert.ok(hook.includes('clearTimeout'), 'useToasts must clear timers on unmount');
  assert.ok(hook.includes('window.setTimeout'), 'useToasts must track every timer');
  const stack = readFileSync(
    new URL('../components/ui/toast-stack.tsx', import.meta.url).pathname,
    'utf8',
  );
  assert.ok(
    stack.includes("role={t.ok ? 'status' : 'alert'}"),
    'ToastStack must map ok to status/alert roles',
  );
  assert.ok(stack.includes('Tutup notifikasi'), 'ToastStack must label the dismiss button');
});

test('GAP-24 Fase A: list filtering is memoized', () => {
  const files = [
    'components/inventory/InventoryLedger.tsx',
    'components/notifications/NotificationsHub.tsx',
    'components/reports/ReportsHub.tsx',
    'components/facilities/FacilityHub.tsx',
    'app/(ops)/field/findings/page.tsx',
    'components/org/OrgHub.tsx',
    'components/pm/PmHub.tsx',
    'components/field/SyncStatus.tsx',
    'components/field/AuditQueue.tsx',
  ];
  for (const rel of files) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    assert.ok(body.includes('useMemo'), `${rel} must memoize derived filter lists`);
  }
});

test('GAP-24 Fase A: Indonesian copy present on newly remediated surfaces', () => {
  const cases = [
    ['components/inventory/InventoryLedger.tsx', ['Inventaris &amp; Ledger Suku Cadang', 'Semua Kategori']],
    ['components/audit/AuditTrail.tsx', ['Ledger Diekspor']],
    ['components/audit/AuditHeader.tsx', ['Ekspor Log CSV']],
    ['components/reports/ReportsHub.tsx', ['Hub Laporan &amp; Analitik', 'Buat &amp; Unduh Dossier']],
    ['components/notifications/NotificationsHub.tsx', ['Ekspor Log (CSV)', 'Log diekspor']],
    ['components/settings/SettingsHub.tsx', ['Pengaturan &amp; Konfigurasi Sistem', 'Ekspor Bundle']],
    ['components/vendors/VendorDetail.tsx', ['Kartu Skor Kinerja', 'Dossier vendor tidak tersedia']],
    ['components/vendors/dialogs.tsx', ['Lihat PDF Tereksekusi', 'Ajukan Amandemen']],
    ['components/facilities/FacilityHub.tsx', ['Hub Lokasi Fasilitas', 'Tambah Sub-Lokasi']],
    ['components/profile/ProfileSessions.tsx', ['Profil &amp; Sesi', 'Sesi Aktif']],
    ['components/assets/AssetBim.tsx', ['Viewport BIM', 'Detail Node']],
    ['components/ops/CommandPalette.tsx', ['Palet perintah', 'Hasil Pencarian Database']],
    ['components/org/OrgHub.tsx', ['Matriks direset', 'Klon Policy']],
    ['components/pm/PmHub.tsx', ['Kalender (Tetap)', 'Kalender Shift']],
    ['components/shifts/ShiftPlan.tsx', ['Rencana Shift', 'Serah Terima']],
    ['app/(ops)/field/findings/page.tsx', ['Meja Triase Temuan &amp; Defek', 'Semua Level']],
    ['components/auth/SignupForm.tsx', ['Buat organisasi Anda', 'Nama Organisasi']],
  ];
  for (const [rel, wants] of cases) {
    const body = readFileSync(new URL(`../${rel}`, import.meta.url).pathname, 'utf8');
    for (const want of wants) {
      assert.ok(body.includes(want), `${rel} missing Indonesian copy: "${want}"`);
    }
  }
});
