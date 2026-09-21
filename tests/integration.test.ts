import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { and, desc, eq, sql } from 'drizzle-orm';

import { createDb, type Db } from '../db/client';
import { auditEvents, poLineItems, purchaseOrders, users } from '../db/schema';
import { seedAll, SEED_PASSWORD, SEED_TOTP_SECRET } from '../db/seed';
import { workOrderEvents } from '../db/schema';
import { login, logout, verifyMfa } from '../lib/services/auth-service';
import {
  createWorkOrder, getDashboard, getWorkOrder, listAssignableTechs,
  listWoEvents, listWorkOrders, transitionWorkOrder,
} from '../lib/services/wo-service';
import {
  createServiceRequest, getServiceRequest, listServiceRequests,
  listSrHistory, transitionServiceRequest,
} from '../lib/services/sr-service';
import { listAuditEvents, verifyAuditHashChain } from '../lib/services/audit-service';
import { findSrByConvertedWo, getAssetDossier, listAssets } from '../lib/services/asset-service';
import { convertFindingToWo, createFinding, createInspection, dismissFinding, forceDispatchInspection, getFinding, getInspection, listFindings, listInspections, updateInspectionProgress } from '../lib/services/inspection-service';
import { addWoTask, listWoTasks, updateWoTask } from '../lib/services/task-service';
import { getPart, listMovements, mutateStock, verifyStepUpCode } from '../lib/services/inventory-service';
import { createUser, listUsers, resetUserMfa, updateUser } from '../lib/services/org-service';
import { convertPrToPo, createRequisition, decidePurchase, getInvoiceDossier, getPurchase, listInvoices, listPurchases, postGoodsReceipt, registerInvoice } from '../lib/services/procurement-service';
import { createPmRule, generatePmWorkOrder, listPmRules, togglePmRule } from '../lib/services/pm-service';
import { addEvidence, listWoEvidence } from '../lib/services/task-service';
import { createApiKey, listApiKeys, revokeApiKey } from '../lib/services/api-key-service';
import { amendVendor, commendVendor, createVendor, getVendor, listVendorPos, listVendors, renewVendor } from '../lib/services/vendor-service';
import { createFacility, getFacility, listFacilities, updateFacility } from '../lib/services/facility-service';
import { listSettings, putSetting, rotateSecret } from '../lib/services/settings-service';
import { createHandover, decideHandover, listHandovers } from '../lib/services/handover-service';
import { can } from '../lib/auth/rbac';
import { ingestSensorReading, listRecentSensorReadings } from '../lib/services/telemetry-service';
import { provisionOrganization } from '../lib/services/onboarding-service';
import { sequences } from '../db/schema';
import { NextRequest } from 'next/server';
import { POST as signupPost } from '../app/api/auth/signup/route';
import { GET as retentionDigestGet } from '../app/api/retention/digest/route';
import {
  RETENTION_DIGEST_NOTE,
  RETENTION_DIGEST_SUNSET,
  generateRetentionDigest,
} from '../lib/services/retention-service';
import { CANON } from '../lib/canon';
import { totpNow } from '../lib/auth/totp';
import { DomainError } from '../lib/domain/errors';
import { verifySession, type AuthContext } from '../lib/auth/session';
import {
  createSession,
  hashToken,
  listUserSessions,
  revokeAllUserSessions,
  revokeOtherUserSessions,
} from '../lib/auth/session';

const TEST_DIR = `.data/test-integration-${Date.now()}`;
let db: Db;
let close: () => Promise<void>;
let admin: AuthContext;
let adminToken: string;
let ipSeq = 0;

before(async () => {
  const handle = createDb(TEST_DIR);
  db = handle.db;
  close = handle.close;
  await migrate(db, { migrationsFolder: new URL('../db/migrations', import.meta.url).pathname });
  await seedAll(db);
  const session = await sessionFor('m.vance@apexops.io');
  admin = session.ctx;
  adminToken = session.token;
});

after(async () => {
  await close();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

async function sessionFor(email: string, password = SEED_PASSWORD): Promise<{ ctx: AuthContext; token: string }> {
  const step1 = await login(db, { email, password, ip: `10.9.0.${++ipSeq}` });
  assert.equal(step1.status, 'mfa_required');
  if (step1.status !== 'mfa_required') throw new Error('unreachable');
  const step2 = await verifyMfa(db, { challengeId: step1.challengeId, code: totpNow(SEED_TOTP_SECRET) });
  return { ctx: step2.user, token: step2.token };
}

async function expectDomainError(fn: () => Promise<unknown>, status: number, code: string) {
  try {
    await fn();
    assert.fail(`expected DomainError ${status} ${code}`);
  } catch (err) {
    assert.ok(err instanceof DomainError, `expected DomainError, got ${err}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
  }
}

test('auth: wrong password → 401 INVALID_CREDENTIALS (no enumeration)', async () => {
  await expectDomainError(
    () => login(db, { email: 'e.voronova@apexops.io', password: 'totally-wrong', ip: '10.0.0.9' }),
    401, 'INVALID_CREDENTIALS',
  );
});

test('auth: unknown email → same 401 INVALID_CREDENTIALS', async () => {
  await expectDomainError(
    () => login(db, { email: 'nobody@apexops.io', password: 'whatever1', ip: '10.0.0.9' }),
    401, 'INVALID_CREDENTIALS',
  );
});

test('auth: seeded credentials → MFA challenge → TOTP verify → session', async () => {
  const step1 = await login(db, { email: 'd.chen@apexops.io', password: SEED_PASSWORD, ip: '10.0.0.3' });
  assert.equal(step1.status, 'mfa_required');
  if (step1.status !== 'mfa_required') return;
  assert.ok(step1.challengeId);
  assert.equal(step1.devHint, totpNow(SEED_TOTP_SECRET), 'dev hint = current TOTP (non-prod only)');

  if (totpNow(SEED_TOTP_SECRET) !== '000000') {
    await expectDomainError(
      () => verifyMfa(db, { challengeId: step1.challengeId, code: '000000' }),
      401, 'MFA_INVALID',
    );
  }

  const step2 = await verifyMfa(db, { challengeId: step1.challengeId, code: totpNow(SEED_TOTP_SECRET) });
  assert.ok(step2.token.length >= 32);
  assert.equal(step2.user.orgId, 'APX-NUSA-01');
  assert.equal(step2.user.email, 'd.chen@apexops.io');
  assert.equal(step2.user.role, 'Engineering Lead');

  await expectDomainError(
    () => verifyMfa(db, { challengeId: step1.challengeId, code: totpNow(SEED_TOTP_SECRET) }),
    400, 'CHALLENGE_INVALID',
  );
});

test('auth: logout revokes the session', async () => {
  const { token } = await sessionFor('e.voronova@apexops.io');
  assert.ok(await verifySession(db, token));
  await logout(db, token);
  assert.equal(await verifySession(db, token), null);
});

test('tenant: canon org sees its 7 seeded WOs, decoy WO invisible', async () => {
  const rows = await listWorkOrders(db, admin);
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => !r.number.includes('7777')));
  assert.ok(rows.some((r) => r.number === 'WO-2026-0894'));
});

test('tenant: decoy org sees ONLY its own WO; cross-tenant get → 404', async () => {
  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.equal(decoy.orgId, 'APX-GL-9021');
  const rows = await listWorkOrders(db, decoy);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, 'WO-2026-7777');
  await expectDomainError(
    () => getWorkOrder(db, decoy, 'WO-2026-0894'),
    404, 'WORK_ORDER_NOT_FOUND',
  );
  await expectDomainError(
    () => transitionWorkOrder(db, decoy, 'WO-2026-0894', { action: 'hold', reason: 'hostile' }),
    404, 'WORK_ORDER_NOT_FOUND',
  );
});

test('wo: full lifecycle hold → resume → complete persists with events', async () => {
  const num = 'WO-2026-0894';

  const held = await transitionWorkOrder(db, admin, num, { action: 'hold', reason: 'Test hold — bearing kit delayed' });
  assert.equal(held.status, 'ON_HOLD');
  assert.equal(held.holdReason, 'Test hold — bearing kit delayed');

  await expectDomainError(
    () => transitionWorkOrder(db, admin, 'WO-2024-0901', { action: 'hold', reason: '  ' }),
    400, 'WO_REASON_REQUIRED',
  );

  await expectDomainError(
    () => transitionWorkOrder(db, admin, num, { action: 'complete' }),
    409, 'WO_INVALID_TRANSITION',
  );

  const resumed = await transitionWorkOrder(db, admin, num, { action: 'resume' });
  assert.equal(resumed.status, 'IN_PROGRESS');

  const done = await transitionWorkOrder(db, admin, num, { action: 'complete' });
  assert.equal(done.status, 'COMPLETED');
  assert.equal(done.isTerminal, true);
  assert.equal(done.slaLabel, '—');

  await expectDomainError(
    () => transitionWorkOrder(db, admin, num, { action: 'cancel', reason: 'too late' }),
    409, 'WO_INVALID_TRANSITION',
  );

  const fresh = await getWorkOrder(db, admin, num);
  assert.equal(fresh.status, 'COMPLETED');

  const events = await db
    .select({ action: workOrderEvents.action })
    .from(workOrderEvents)
    .where(and(eq(workOrderEvents.organizationId, admin.orgId), eq(workOrderEvents.workOrderNumber, num)))
    .orderBy(desc(workOrderEvents.ts));
  const actions = events.map((e) => e.action);
  for (const expected of ['HOLD', 'RESUME', 'COMPLETE']) {
    assert.ok(actions.includes(expected), `missing event ${expected}`);
  }
});

test('wo: assign changes tech but not status; cross-tenant assignee rejected', async () => {
  const techs = await listAssignableTechs(db, admin);
  assert.ok(techs.length >= 5);
  const target = techs.find((t) => t.email === 'm.kowalski@apexops.io');
  assert.ok(target);

  const assigned = await transitionWorkOrder(db, admin, 'WO-2024-0904', { action: 'assign', assigneeEmail: target.email });
  assert.equal(assigned.status, 'OPEN');
  assert.equal(assigned.tech, 'Marcus Kowalski');

  await expectDomainError(
    () => transitionWorkOrder(db, admin, 'WO-2024-0904', { action: 'assign', assigneeEmail: 't.user@apexgl.io' }),
    400, 'ASSIGNEE_NOT_FOUND',
  );
});

test('wo: create numbers from the server sequence (WO-2026-0910 first)', async () => {
  const wo = await createWorkOrder(db, admin, { title: 'Cooling tower fan belt replacement', priority: 'P2', assetCode: 'AST-HVAC-004' });
  assert.equal(wo.number, 'WO-2026-0910');
  assert.equal(wo.status, 'OPEN');
  assert.ok(wo.slaDueAt, 'SLA due computed from the P2 window');
  assert.equal(wo.slaLabel.includes('BREACH'), false);

  const next = await createWorkOrder(db, admin, { title: 'Second manual WO', priority: 'P1' });
  assert.equal(next.number, 'WO-2026-0911');
});

test('idempotency: same key + body replays stored response; same key + new body → 422', async () => {
  const key = 'idem-test-key-0001';
  const first = await createWorkOrder(db, admin, { title: 'Idempotent WO', priority: 'P3' }, { idempotencyKey: key });
  assert.equal(first.number, 'WO-2026-0912');

  const replay = await createWorkOrder(db, admin, { title: 'Idempotent WO', priority: 'P3' }, { idempotencyKey: key });
  assert.equal(replay.number, first.number);

  const replay2 = await createWorkOrder(db, admin, { priority: 'P3', title: 'Idempotent WO' }, { idempotencyKey: key });
  assert.equal(replay2.number, first.number);

  await expectDomainError(
    () => createWorkOrder(db, admin, { title: 'Different body!', priority: 'P1' }, { idempotencyKey: key }),
    422, 'IDEMPOTENCY_KEY_REUSED',
  );

  const after = await createWorkOrder(db, admin, { title: 'After idempotency', priority: 'P3' });
  assert.equal(after.number, 'WO-2026-0913');
});

test('wo BR-02: create persists description/loto/assignee; unknown assignee 400', async () => {
  const wo = await createWorkOrder(db, admin, {
    title: 'BR-02 full-scope WO', priority: 'P2', assetCode: 'AST-HVAC-004',
    description: 'Replace seal + flush loop', lotoRequired: true, assigneeEmail: 'm.kowalski@apexops.io',
  });
  assert.equal(wo.description, 'Replace seal + flush loop');
  assert.equal(wo.lotoRequired, true);
  assert.equal(wo.tech, 'Marcus Kowalski');
  const fetched = await getWorkOrder(db, admin, wo.number);
  assert.equal(fetched.description, 'Replace seal + flush loop');
  assert.equal(fetched.lotoRequired, true);
  await expectDomainError(
    () => createWorkOrder(db, admin, { title: 'BR-02 bad assignee', priority: 'P3', assigneeEmail: 'ghost@apexops.io' }),
    400, 'ASSIGNEE_NOT_FOUND',
  );
  await transitionWorkOrder(db, admin, wo.number, { action: 'cancel', reason: 'BR-02 fixture cleanup' });
});

test('wo BR-21: Vendor Partner Tech sees only assigned WOs (row-level)', async () => {
  const vendor = await createUser(db, admin, {
    email: 'br21.vendor@apexops.io', name: 'BR21 Vendor', role: 'Vendor Partner Tech',
  });
  const vendorCtx = { ...admin, userId: vendor.id, email: vendor.email, name: vendor.name, role: 'Vendor Partner Tech' as const };
  const assigned = await createWorkOrder(db, admin, {
    title: 'BR-21 vendor-assigned WO', priority: 'P3', assigneeEmail: 'br21.vendor@apexops.io',
  });
  const unassigned = await createWorkOrder(db, admin, {
    title: 'BR-21 unassigned WO', priority: 'P3',
  });
  const rows = await listWorkOrders(db, vendorCtx);
  assert.ok(rows.some((r) => r.number === assigned.number), 'assigned WO visible');
  assert.ok(rows.every((r) => r.number !== unassigned.number), 'unassigned WO hidden');
  assert.ok(rows.every((r) => r.tech === 'BR21 Vendor'), 'all visible rows assigned to vendor');
  await expectDomainError(
    () => getWorkOrder(db, vendorCtx, unassigned.number),
    404, 'WORK_ORDER_NOT_FOUND',
  );
  const opened = await getWorkOrder(db, vendorCtx, assigned.number);
  assert.equal(opened.number, assigned.number);
  assert.ok((await listWorkOrders(db, admin)).some((r) => r.number === unassigned.number));
  await transitionWorkOrder(db, admin, assigned.number, { action: 'cancel', reason: 'BR-21 fixture cleanup' });
  await transitionWorkOrder(db, admin, unassigned.number, { action: 'cancel', reason: 'BR-21 fixture cleanup' });
  await updateUser(db, admin, vendor.id, { isActive: false });
});

test('session: token survives re-verification (persistence, not memory)', async () => {
  const ctx = await verifySession(db, adminToken);
  assert.ok(ctx);
  assert.equal(ctx.orgId, 'APX-NUSA-01');
  assert.equal(ctx.email, 'm.vance@apexops.io');
});

test('dashboard: KPIs computed from real rows, events feed populated', async () => {
  const data = await getDashboard(db, admin);
  assert.equal(data.kpis.open, 10);
  assert.ok(data.kpis.p1 >= 3);
  assert.equal(data.kpis.onHold, 1);
  assert.ok(data.kpis.techs >= 2);
  assert.equal(data.kpis.slaCompliance, 100);
  assert.ok(data.rows.length === 5);
  assert.ok(data.rows.every((r) => !r.isTerminal));
  assert.ok(data.events.length >= 3, 'lifecycle produced HOLD/RESUME/COMPLETE events');
});

test('sr: seeded queue is tenant-scoped; canon SR links to the seal WO', async () => {
  const rows = await listServiceRequests(db, admin);
  assert.equal(rows.length, 5);
  const canon = rows.find((r) => r.number === 'SR-2026-0894');
  assert.ok(canon);
  assert.equal(canon.status, 'CONVERTED');
  assert.equal(canon.convertedWoNumber, 'WO-2026-0894');
  assert.equal(canon.slaLabel, '—');

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.equal((await listServiceRequests(db, decoy)).length, 0);
  await expectDomainError(
    () => getServiceRequest(db, decoy, 'SR-2026-0894'),
    404, 'SERVICE_REQUEST_NOT_FOUND',
  );
});

test('sr: create → triage → convert creates a real WO in one transaction', async () => {
  const created = await createServiceRequest(db, admin, {
    title: 'AHU-7 bearing noise after PM', requesterName: 'Front Desk · Dana Priya', priority: 'P2', assetCode: 'AST-HVAC-003',
  });
  assert.equal(created.number, 'SR-2026-0895');
  assert.equal(created.status, 'OPEN');
  assert.equal(created.slaLabel.includes('BREACH'), false);

  const triaged = await transitionServiceRequest(db, admin, created.number, { action: 'triage' });
  assert.equal(triaged.sr.status, 'TRIAGED');

  const converted = await transitionServiceRequest(db, admin, created.number, {
    action: 'convert', woTitle: 'AHU-7 bearing replacement', woPriority: 'P1',
  });
  assert.equal(converted.sr.status, 'CONVERTED');
  assert.ok(converted.workOrder);
  assert.match(converted.workOrder.number, /^WO-2026-\d{4}$/);
  assert.equal(converted.sr.convertedWoNumber, converted.workOrder.number);
  assert.equal(converted.workOrder.status, 'OPEN');
  assert.equal(converted.workOrder.priority, 'P1');
  assert.equal(converted.workOrder.title, 'AHU-7 bearing replacement');

  const wo = await getWorkOrder(db, admin, converted.workOrder.number);
  assert.equal(wo.number, converted.workOrder.number);
  const events = await listWoEvents(db, admin, wo.number);
  assert.equal(events[0].action, 'CREATE');
  assert.equal(events[0].reason, `Converted from ${created.number}`);

  await expectDomainError(
    () => transitionServiceRequest(db, admin, created.number, { action: 'convert' }),
    409, 'SR_INVALID_TRANSITION',
  );

  const history = await listSrHistory(db, admin, created.number);
  const actions = history.map((h) => h.action);
  for (const expected of ['SR_CREATE', 'SR_TRIAGE', 'SR_CONVERT']) {
    assert.ok(actions.includes(expected), `missing history ${expected}`);
  }
});

test('sr: close requires a reason and is terminal', async () => {
  const created = await createServiceRequest(db, admin, {
    title: 'Duplicate: dock door sensor flicker', requesterName: 'Logistics', priority: 'P3',
  });
  assert.equal(created.number, 'SR-2026-0896');

  await expectDomainError(
    () => transitionServiceRequest(db, admin, created.number, { action: 'close' }),
    400, 'SR_REASON_REQUIRED',
  );

  const closed = await transitionServiceRequest(db, admin, created.number, {
    action: 'close', reason: 'Duplicate of SR-2026-0893',
  });
  assert.equal(closed.sr.status, 'CLOSED');

  await expectDomainError(
    () => transitionServiceRequest(db, admin, created.number, { action: 'triage' }),
    409, 'SR_INVALID_TRANSITION',
  );

  const fresh = await getServiceRequest(db, admin, created.number);
  assert.equal(fresh.status, 'CLOSED');
});

test('sr: idempotent convert replay does NOT create a second WO', async () => {
  const created = await createServiceRequest(db, admin, {
    title: 'Idempotent convert probe', requesterName: 'QA Desk', priority: 'P2',
  });
  const key = 'sr-convert-idem-0001';
  const first = await transitionServiceRequest(db, admin, created.number, { action: 'convert' }, { idempotencyKey: key });
  const replay = await transitionServiceRequest(db, admin, created.number, { action: 'convert' }, { idempotencyKey: key });
  assert.equal(replay.sr.convertedWoNumber, first.sr.convertedWoNumber);

  const rows = await listWorkOrders(db, admin);
  const matching = rows.filter((r) => r.number === first.sr.convertedWoNumber);
  assert.equal(matching.length, 1, 'exactly one WO row for the replayed convert');
});

test('audit: ledger holds real events from every flow, tenant-scoped', async () => {
  const page = await listAuditEvents(db, admin);
  assert.ok(page.total >= 10, `expected a populated ledger, got ${page.total}`);
  assert.equal(page.rows.length <= 500, true);
  const actions = new Set(page.rows.map((r) => r.action));
  for (const expected of ['AUTH_MFA_OK', 'WO_HOLD', 'WO_COMPLETE', 'SR_CREATE', 'SR_CONVERT', 'SR_CLOSE']) {
    assert.ok(actions.has(expected), `ledger missing ${expected}`);
  }
  const types = new Set(page.counts.map((c) => c.entityType));
  assert.ok(types.has('work_order') && types.has('service_request') && types.has('auth'));

  assert.ok(page.rows[0].ts >= page.rows[page.rows.length - 1].ts);
  const woHold = page.rows.find((r) => r.action === 'WO_HOLD');
  assert.ok(woHold);
  assert.equal(woHold.entityType, 'work_order');
  assert.equal(woHold.entityId, 'WO-2026-0894');
  assert.ok((woHold.after as { reason?: string }).reason?.includes('bearing kit'));

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  const decoyPage = await listAuditEvents(db, decoy);
  assert.ok(decoyPage.total < page.total);
  assert.ok(decoyPage.rows.every((r) => r.entityId === null || !r.entityId.startsWith('WO-2026-08')));
});

test('audit: verifyAuditHashChain recomputes the real chain and detects tampering', async () => {
  const clean = await verifyAuditHashChain(db, admin);
  assert.equal(clean.valid, true);
  assert.ok(clean.verifiedCount >= 10, `expected populated ledger, got ${clean.verifiedCount}`);
  assert.match(clean.rootHash, /^[0-9a-f]{64}$/);
  assert.match(clean.genesisHash, /^[0-9a-f]{64}$/);
  assert.equal(clean.tamperedEventId, null);

  const trig = await db.execute(
    sql`SELECT COUNT(DISTINCT trigger_name)::int AS n FROM information_schema.triggers WHERE event_object_table = 'audit_events' AND trigger_name = 'audit_events_no_mutation'`,
  );
  assert.equal((trig.rows[0] as { n: number }).n, 1, 'append-only trigger installed');
  const victim = (await listAuditEvents(db, admin)).rows[0];
  await assert.rejects(
    db.update(auditEvents).set({ entryHash: '0'.repeat(64) }).where(eq(auditEvents.id, victim.id)),
    /audit_events/,
    'tamper UPDATE on audit_events must be rejected at the DB layer',
  );
  const stillClean = await verifyAuditHashChain(db, admin);
  assert.equal(stillClean.valid, true);
  assert.equal(stillClean.tamperedEventId, null);
});

test('assets: registry with real workload counts; dossier relations; cross-tenant 404', async () => {
  const rows = await listAssets(db, admin);
  assert.ok(rows.length >= 4);
  const seal = rows.find((r) => r.code === 'AST-HVAC-004');
  assert.ok(seal);
  assert.equal(seal.health, 68);
  assert.equal(seal.status, 'DEGRADED');

  const ahu = rows.find((r) => r.code === 'AST-HVAC-003');
  assert.ok(ahu);
  assert.ok(ahu.openWos >= 1, 'converted WO should count as open workload');
  assert.ok(ahu.totalWos >= 1);

  const dossier = await getAssetDossier(db, admin, 'AST-HVAC-004');
  assert.ok(dossier.wos.some((w) => w.number === 'WO-2026-0894' && w.status === 'COMPLETED'));
  assert.ok(dossier.srs.some((s) => s.number === 'SR-2026-0894' && s.status === 'CONVERTED'));

  const origin = await findSrByConvertedWo(db, admin, 'WO-2026-0894');
  assert.ok(origin);
  assert.equal(origin.number, 'SR-2026-0894');

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.equal((await listAssets(db, decoy)).length, 0);
  await expectDomainError(
    () => getAssetDossier(db, decoy, 'AST-HVAC-004'),
    404, 'ASSET_NOT_FOUND',
  );
});

test('findings: create persists with canon numbering + audit; list reads DB rows', async () => {
  const before = await listFindings(db, admin);
  assert.ok(before.some((f) => f.status === 'CONVERTED'), 'seeded converted finding visible');

  const fnd = await createFinding(db, admin, {
    title: 'Oil mist at compressor terminal box',
    severity: 'MAJOR',
    assetCode: 'AST-HVAC-004',
    extra: { description: 'Visible misting', zone: 'Plant Room' },
  });
  assert.equal(fnd.number, 'FND-2026-0189');
  assert.equal(fnd.status, 'OPEN');
  assert.equal(fnd.severity, 'MAJOR');

  const refetched = await getFinding(db, admin, 'FND-2026-0189');
  assert.equal(refetched.title, 'Oil mist at compressor terminal box');
  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'FINDING_CREATE' && e.entityId === 'FND-2026-0189'), 'FINDING_CREATE audited');

  const after = await listFindings(db, admin);
  assert.equal(after.length, before.length + 1);

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.equal((await listFindings(db, decoy)).length, 0);
  await expectDomainError(() => getFinding(db, decoy, 'FND-2026-0189'), 404, 'FINDING_NOT_FOUND');
});

test('findings: idempotent create replays without a second row', async () => {
  const key = 'finding-idem-key-0001';
  const first = await createFinding(db, admin, {
    title: 'Vibration probe loose on AHU-3', severity: 'MODERATE', assetCode: 'AST-HVAC-003',
  }, { idempotencyKey: key });
  assert.equal(first.number, 'FND-2026-0190');

  const replay = await createFinding(db, admin, {
    title: 'Vibration probe loose on AHU-3', severity: 'MODERATE', assetCode: 'AST-HVAC-003',
  }, { idempotencyKey: key });
  assert.equal(replay.number, first.number, 'replay returns the stored row, no duplicate');

  const after = await createFinding(db, admin, {
    title: 'After idempotency', severity: 'MINOR', assetCode: 'AST-HVAC-003',
  });
  assert.equal(after.number, 'FND-2026-0191', 'sequence advanced only for real inserts');
});

test('findings (T4-5): same key + same body with a different requestId replays instead of 422', async () => {
  const key = 'finding-reqid-key-0001';
  const before = await listFindings(db, admin);
  const first = await createFinding(db, admin, {
    title: 'RequestId must not poison idempotency', severity: 'MINOR', assetCode: 'AST-HVAC-003',
  }, { idempotencyKey: key, requestId: 'req-aaaa-0001' });
  const replay = await createFinding(db, admin, {
    title: 'RequestId must not poison idempotency', severity: 'MINOR', assetCode: 'AST-HVAC-003',
  }, { idempotencyKey: key, requestId: 'req-bbbb-0002' });
  assert.equal(replay.number, first.number, 'replay returns the stored row despite different requestId');
  const after = await listFindings(db, admin);
  assert.equal(after.length, before.length + 1, 'no duplicate row from the replay');
});

test('findings: convert creates WO transactionally, second convert 409, replay idempotent', async () => {
  const fnd = await createFinding(db, admin, {
    title: 'Gap-4 convert probe', severity: 'CRITICAL', assetCode: 'AST-HVAC-004',
  });
  assert.equal(fnd.status, 'OPEN');

  const wosBefore = await listWorkOrders(db, admin);
  const key = 'finding-convert-key-0001';
  const res = await convertFindingToWo(db, admin, fnd.number,
    { woPriority: 'P1', reason: 'Gap-4 probe', lotoConfirmed: true }, { idempotencyKey: key });
  assert.equal(res.finding.status, 'CONVERTED');
  assert.ok(res.finding.convertedWoNumber, 'WO number linked');
  assert.equal(res.wo.number, res.finding.convertedWoNumber);
  assert.equal(res.wo.status, 'OPEN');

  const wo = await getWorkOrder(db, admin, res.wo.number);
  assert.equal(wo.title, `Corrective Action: ${fnd.title}`);
  const refetched = await getFinding(db, admin, fnd.number);
  assert.equal(refetched.convertedWoNumber, res.wo.number);
  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'FINDING_CONVERT_WO' && e.entityId === fnd.number), 'FINDING_CONVERT_WO audited');

  await expectDomainError(
    () => convertFindingToWo(db, admin, fnd.number, { woPriority: 'P1' }),
    409, 'ALREADY_CONVERTED',
  );

  const replay = await convertFindingToWo(db, admin, fnd.number,
    { woPriority: 'P1', reason: 'Gap-4 probe', lotoConfirmed: true }, { idempotencyKey: key });
  assert.equal(replay.wo.number, res.wo.number, 'replay returns stored conversion');
  const wosAfter = await listWorkOrders(db, admin);
  assert.equal(wosAfter.length, wosBefore.length + 1, 'exactly one WO created');
});

test('BR-09: finding convert requires explicit LOTO confirmation (server-enforced)', async () => {
  const fnd = await createFinding(db, admin, {
    title: 'BR-09 LOTO probe', severity: 'MAJOR', assetCode: 'AST-HVAC-004',
  });
  await expectDomainError(
    () => convertFindingToWo(db, admin, fnd.number, { woPriority: 'P2' }),
    400, 'LOTO_NOT_CONFIRMED',
  );
  await expectDomainError(
    () => convertFindingToWo(db, admin, fnd.number, { woPriority: 'P2', lotoConfirmed: false }),
    400, 'LOTO_NOT_CONFIRMED',
  );
  assert.equal((await getFinding(db, admin, fnd.number)).status, 'OPEN', 'refused convert changes nothing');
  const ok = await convertFindingToWo(db, admin, fnd.number,
    { woPriority: 'P2', lotoConfirmed: true });
  assert.equal(ok.finding.status, 'CONVERTED');
});

test('BR-18: pm generate without key replays same-day (no accidental double WO)', async () => {
  const rule = await createPmRule(db, admin, {
    title: 'BR-18 auto-key probe',
    assetCode: CANON.assetSeal,
    intervalDays: 30,
    priority: 'P3',
  });
  const wosBefore = await listWorkOrders(db, admin);
  const first = await generatePmWorkOrder(db, admin, rule.id);
  const second = await generatePmWorkOrder(db, admin, rule.id);
  assert.equal(second.wo.number, first.wo.number, 'same-day no-key repeat replays');
  const wosAfter = await listWorkOrders(db, admin);
  assert.equal(wosAfter.length, wosBefore.length + 1, 'exactly one WO created');
});

test('findings: dismiss writes DISMISSED + audit; guards enforced', async () => {
  const fnd = await createFinding(db, admin, {
    title: 'Gap-4 dismiss probe', severity: 'MODERATE', assetCode: 'AST-HVAC-003',
  });

  await expectDomainError(
    () => dismissFinding(db, admin, fnd.number, { justification: 'too short' }),
    400, 'VALIDATION_ERROR',
  );
  assert.equal((await getFinding(db, admin, fnd.number)).status, 'OPEN', 'rejected dismiss changes nothing');

  const done = await dismissFinding(db, admin, fnd.number,
    { justification: 'Duplicate of earlier evidence pack, verified by lead' });
  assert.equal(done.finding.status, 'DISMISSED');
  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'FINDING_DISMISS' && e.entityId === fnd.number), 'FINDING_DISMISS audited');

  await expectDomainError(
    () => dismissFinding(db, admin, fnd.number, { justification: 'Another long enough justification here' }),
    409, 'ALREADY_DISMISSED',
  );

  const conv = await createFinding(db, admin, {
    title: 'Gap-4 convert-then-dismiss probe', severity: 'MAJOR', assetCode: 'AST-HVAC-004',
  });
  await convertFindingToWo(db, admin, conv.number, { woPriority: 'P2', lotoConfirmed: true });
  await expectDomainError(
    () => dismissFinding(db, admin, conv.number, { justification: 'Too late, already a work order now' }),
    409, 'ALREADY_CONVERTED',
  );

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  await expectDomainError(() => dismissFinding(db, decoy, fnd.number, { justification: 'Decoy attempt with long text' }), 404, 'FINDING_NOT_FOUND');
});

test('BR-24: dismiss honors Idempotency-Key (replay returns stored, key-reuse 422)', async () => {
  const fnd = await createFinding(db, admin, {
    title: 'BR-24 dismiss key probe', severity: 'MINOR', assetCode: 'AST-HVAC-004',
  });
  const key = 'finding-dismiss-key-0001';
  const input = { justification: 'Verified duplicate during BR-24 remediation probe' };
  const first = await dismissFinding(db, admin, fnd.number, input, { idempotencyKey: key });
  assert.equal(first.finding.status, 'DISMISSED');

  const replay = await dismissFinding(db, admin, fnd.number, input, { idempotencyKey: key });
  assert.equal(replay.finding.status, 'DISMISSED');
  const count = (await listAuditEvents(db, admin)).rows
    .filter((e) => e.action === 'FINDING_DISMISS' && e.entityId === fnd.number).length;
  assert.equal(count, 1, 'replay writes no second audit row');

  await expectDomainError(
    () => dismissFinding(db, admin, fnd.number,
      { justification: 'A completely different justification text here' }, { idempotencyKey: key }),
    422, 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('org: provision → edit role → deactivate (login blocked) → reactivate, all audited', async () => {
  const created = await createUser(db, admin, {
    email: 'gap2.probe@apexops.io',
    name: 'Gap Two Probe',
    role: 'Senior Field Tech',
    title: 'Facilities Engineering · Senior Field Tech',
  });
  assert.equal(created.isActive, true);
  assert.equal(created.hasMfa, false);

  const edited = await updateUser(db, admin, created.id, { role: 'Engineering Lead' });
  assert.equal(edited.role, 'Engineering Lead');

  const off = await updateUser(db, admin, created.id, { isActive: false });
  assert.equal(off.isActive, false);

  await expectDomainError(
    () => login(db, { email: 'gap2.probe@apexops.io', password: 'wrong-pass', ip: '10.9.0.99' }),
    401, 'INVALID_CREDENTIALS',
  );

  const on = await updateUser(db, admin, created.id, { isActive: true });
  assert.equal(on.isActive, true);

  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'USER_INVITE' && e.entityId === created.id), 'USER_INVITE audited');
  assert.ok(ledger.rows.some((e) => e.action === 'USER_DEACTIVATE' && e.entityId === created.id), 'USER_DEACTIVATE audited');
});

test('org: reset-mfa clears totp, revokes live sessions, audited; self-targets → 403', async () => {
  const dir = await listUsers(db, admin);
  const chen = dir.find((u) => u.email === 'd.chen@apexops.io');
  assert.ok(chen, 'seeded Engineering Lead listed');
  assert.equal(chen.hasMfa, true);

  const { token: chenToken } = await sessionFor('d.chen@apexops.io');
  assert.ok(await verifySession(db, chenToken), 'live session verifies before reset');

  const res = await resetUserMfa(db, admin, chen.id);
  assert.equal(res.mfaEnrolled, false);
  assert.ok(res.sessionsRevoked >= 1, 'at least the live session revoked');
  assert.equal(await verifySession(db, chenToken), null, 'revoked session no longer verifies');

  const after = await listUsers(db, admin);
  assert.equal(after.find((u) => u.email === 'd.chen@apexops.io')?.hasMfa, false);

  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'USER_MFA_RESET' && e.entityId === chen.id), 'USER_MFA_RESET audited');

  await expectDomainError(() => updateUser(db, admin, admin.userId, { isActive: false }), 403, 'USER_SELF_DEACTIVATE');
  await expectDomainError(() => resetUserMfa(db, admin, admin.userId), 403, 'USER_SELF_MFA_RESET');
  await expectDomainError(
    () => resetUserMfa(db, admin, '00000000-0000-0000-0000-000000000000'),
    404, 'USER_NOT_FOUND',
  );
});

test('inventory (GAP-3): wrong step-up code → 403 STEP_UP_INVALID, stock untouched', async () => {
  const before = await getPart(db, admin, 'PART-BRG-6205');
  const code = totpNow(SEED_TOTP_SECRET) === '000000' ? '000001' : '000000';
  await expectDomainError(() => verifyStepUpCode(db, admin, code), 403, 'STEP_UP_INVALID');
  const after = await getPart(db, admin, 'PART-BRG-6205');
  assert.equal(after.onHand, before.onHand, 'rejected step-up mutates nothing');
});

test('inventory (GAP-3): user without enrolled MFA → 403 STEP_UP_UNAVAILABLE', async () => {
  const created = await createUser(db, admin, {
    email: 'gap3.nomfa@apexops.io',
    name: 'Gap Three NoMfa',
    role: 'Senior Field Tech',
  });
  assert.equal(created.hasMfa, false);
  const ctx: AuthContext = { ...admin, userId: created.id, email: created.email, name: created.name };
  await expectDomainError(() => verifyStepUpCode(db, ctx, totpNow(SEED_TOTP_SECRET)), 403, 'STEP_UP_UNAVAILABLE');
});

test('inventory (GAP-3): RECEIVE + ISSUE with step-up persist, audited with stepUpAt; replay idempotent; over-issue → 422', async () => {
  const sku = 'PART-BRG-6205';
  const start = await getPart(db, admin, sku);
  const key = `gap3-${Date.now()}`;

  const received = await mutateStock(
    db, admin,
    { sku, type: 'RECEIVE', qty: 4, refNumber: 'PO-2026-0999', reason: 'GAP-3 probe receipt' },
    { idempotencyKey: key, stepUpAt: await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET)) },
  );
  assert.equal(received.onHand, start.onHand + 4);

  const replay = await mutateStock(
    db, admin,
    { sku, type: 'RECEIVE', qty: 4, refNumber: 'PO-2026-0999', reason: 'GAP-3 probe receipt' },
    { idempotencyKey: key, stepUpAt: await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET)) },
  );
  assert.equal(replay.onHand, start.onHand + 4, 'replay must not double-apply');

  const issued = await mutateStock(
    db, admin,
    { sku, type: 'ISSUE', qty: 1, refNumber: 'WO-2026-0894', reason: 'GAP-3 probe issue' },
    { stepUpAt: await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET)) },
  );
  assert.equal(issued.onHand, start.onHand + 3);

  await expectDomainError(
    () => mutateStock(db, admin, { sku, type: 'ISSUE', qty: 9999, refNumber: 'WO-2026-0894' }, {}),
    422, 'INSUFFICIENT_STOCK',
  );
  assert.equal((await getPart(db, admin, sku)).onHand, start.onHand + 3);

  const ledger = await listAuditEvents(db, admin, { entityType: 'part' });
  const recv = ledger.rows.find((e) => e.action === 'PART_RECEIVE' && e.entityId === sku);
  assert.ok(recv, 'PART_RECEIVE audited');
  assert.ok((recv.after as { stepUpAt?: string })?.stepUpAt, 'step-up approval timestamp recorded');
  assert.ok(ledger.rows.some((e) => e.action === 'PART_ISSUE' && e.entityId === sku), 'PART_ISSUE audited');
});

test('inventory (T4-15): ADJUST sets absolute stock, reason mandatory, ledger row exact', async () => {
  const sku = 'PART-FLTR-401';
  const start = await getPart(db, admin, sku);

  const rowsBefore = (await listMovements(db, admin, { sku })).length;
  await expectDomainError(
    () => mutateStock(db, admin, { sku, type: 'ADJUST', qty: start.onHand }, {}),
    400, 'REASON_REQUIRED',
  );
  assert.equal((await getPart(db, admin, sku)).onHand, start.onHand);
  assert.equal((await listMovements(db, admin, { sku })).length, rowsBefore);

  const target = start.onHand + 5;
  const adjusted = await mutateStock(
    db, admin,
    { sku, type: 'ADJUST', qty: target, refNumber: 'CYCLE-COUNT-01', reason: 'T4-15 cycle count' },
    { stepUpAt: await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET)) },
  );
  assert.equal(adjusted.onHand, target, 'ADJUST sets absolute on-hand, not a delta');

  const rows = await listMovements(db, admin, { sku });
  assert.equal(rows.length, rowsBefore + 1, 'exactly one ledger row per mutation');
  const row = rows[0];
  assert.equal(row.type, 'ADJUST');
  assert.equal(row.qty, target);
  assert.equal(row.beforeOnHand, start.onHand);
  assert.equal(row.afterOnHand, target);
  assert.equal(row.refNumber, 'CYCLE-COUNT-01');
  assert.equal(row.reason, 'T4-15 cycle count');
  assert.ok(row.actorName, 'actor recorded on ledger row');
});

test('inventory (T4-15): decoy tenant blind — no canon ledger rows, canon sku → 404', async () => {
  const { ctx: decoy } = await gap14Decoy();
  assert.equal(decoy.orgId, 'APX-GL-9021');
  assert.equal((await listMovements(db, decoy)).length, 0, 'decoy sees none of canon ledger');
  await expectDomainError(
    () => mutateStock(db, decoy, { sku: 'PART-BRG-6205', type: 'ISSUE', qty: 1 }, {}),
    404, 'PART_NOT_FOUND',
  );
});

test('inventory (T4-15): movement row count == mutation count; idempotent replay adds no row', async () => {
  const sku = 'PART-BRG-6204';
  const key = `t415-${Date.now()}`;
  const before = (await listMovements(db, admin, { sku })).length;
  const stepUp = () => verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));

  await mutateStock(
    db, admin,
    { sku, type: 'RECEIVE', qty: 2, reason: 'T4-15 count probe' },
    { idempotencyKey: key, stepUpAt: await stepUp() },
  );
  await mutateStock(
    db, admin,
    { sku, type: 'RECEIVE', qty: 2, reason: 'T4-15 count probe' },
    { idempotencyKey: key, stepUpAt: await stepUp() },
  );
  await mutateStock(
    db, admin,
    { sku, type: 'ISSUE', qty: 1, refNumber: 'WO-2026-0894', reason: 'T4-15 count probe' },
    { stepUpAt: await stepUp() },
  );

  const rows = await listMovements(db, admin, { sku });
  assert.equal(rows.length, before + 2, 'two mutations → two rows; replay writes nothing');
  assert.equal(rows[0].type, 'ISSUE', 'newest-first ordering');
  assert.equal(rows[0].refNumber, 'WO-2026-0894');
});

test('sessions (GAP-5): list marks exactly the caller current; prefixes only, never full hashes', async () => {
  const other = await createSession(db, admin.userId, admin.orgId, 'gap5-test tablet');
  const rows = await listUserSessions(db, admin.userId, admin.orgId, hashToken(adminToken));
  assert.ok(rows.length >= 2, 'caller session + probe session listed');
  const current = rows.filter((r) => r.current);
  assert.equal(current.length, 1, 'exactly one row is current');
  assert.equal(current[0].idHashPrefix, hashToken(adminToken).slice(0, 8));
  assert.ok(rows.every((r) => r.idHashPrefix.length === 8), 'only 8-char prefixes exposed');
  assert.ok(!('idHash' in current[0]), 'full hash never leaves the server');
  assert.ok(rows.some((r) => r.userAgent === 'gap5-test tablet' && !r.current));
  await logout(db, other);
  assert.equal(await verifySession(db, other), null, 'probe session cleaned up');
});

test('sessions (GAP-5): revoke-others keeps the caller, kills the rest', async () => {
  const doomed = await createSession(db, admin.userId, admin.orgId, 'gap5-doomed device');
  assert.ok(await verifySession(db, doomed), 'probe session live before revoke');

  const n = await revokeOtherUserSessions(db, admin.userId, admin.orgId, hashToken(adminToken));
  assert.ok(n >= 1, 'at least the probe session revoked');
  assert.ok(await verifySession(db, adminToken), 'caller session survives revoke-others');
  assert.equal(await verifySession(db, doomed), null, 'other session revoked');
});

test('sessions (GAP-5): revoke-all kills everything incl. caller', async () => {
  const probe = await createSession(db, admin.userId, admin.orgId, 'gap5-revoke-all probe');
  const n = await revokeAllUserSessions(db, admin.userId, admin.orgId);
  assert.ok(n >= 2, 'caller + probe revoked');
  assert.equal(await verifySession(db, adminToken), null, 'caller gone after revoke-all');
  assert.equal(await verifySession(db, probe), null, 'probe gone after revoke-all');
  const fresh = await sessionFor('m.vance@apexops.io');
  admin = fresh.ctx;
  adminToken = fresh.token;
});

import { createHmac } from 'node:crypto';
import {
  createCheckoutSession,
  getOrganizationSubscription,
  isBillingDemoMode,
  processStripeWebhook,
} from '../lib/services/billing-service';
import { organizations, subscriptions } from '../db/schema';

const GAP6_SECRET = 'whsec_gap6_test_secret';

function gap6Sign(rawBody: string, secret = GAP6_SECRET): string {
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

function gap6Event(id: string, type = 'customer.subscription.updated', plan = 'GROWTH') {
  return JSON.stringify({
    id,
    type,
    data: {
      object: {
        id: 'sub_gap6',
        customer: 'cus_gap6',
        subscription: 'sub_gap6',
        metadata: { organizationId: admin.orgId, plan },
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      },
    },
  });
}

async function gap6AuditCount(eventId: string): Promise<number> {
  const rows = await db.select().from(auditEvents)
    .where(and(eq(auditEvents.organizationId, admin.orgId), eq(auditEvents.entityId, admin.orgId)));
  return rows.filter((r) => (r.after as { eventId?: string })?.eventId === eventId).length;
}

test('billing (GAP-6): valid signature processes once; replay is deduped without duplicate audit', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = GAP6_SECRET;
  try {
    const raw = gap6Event('evt_gap6_once');
    const sig = gap6Sign(raw);
    const first = await processStripeWebhook(db, raw, sig);
    assert.equal(first.status, 'subscription_updated');
    assert.equal(first.processed, true);
    assert.equal(first.replayed, false);
    assert.equal(await gap6AuditCount('evt_gap6_once'), 1, 'exactly one audit row');

    const replay = await processStripeWebhook(db, raw, sig);
    assert.equal(replay.status, 'subscription_updated');
    assert.equal(replay.replayed, true, 'replay flagged');
    assert.equal(await gap6AuditCount('evt_gap6_once'), 1, 'replay must not duplicate audit');

    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.organizationId, admin.orgId)).limit(1);
    assert.equal(sub?.plan, 'GROWTH');
    assert.equal(sub?.status, 'ACTIVE');
  } finally {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    await db.update(subscriptions).set({ plan: 'ENTERPRISE', status: 'ACTIVE' })
      .where(eq(subscriptions.organizationId, admin.orgId));
    await db.update(organizations).set({ plan: 'ENTERPRISE' })
      .where(eq(organizations.id, admin.orgId));
  }
});

test('billing (GAP-6): bad/tampered signature and missing header fail closed with no mutation', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = GAP6_SECRET;
  try {
    const raw = gap6Event('evt_gap6_evil');
    const before = await gap6AuditCount('evt_gap6_evil');

    await expectDomainError(() => processStripeWebhook(db, raw, gap6Sign(raw, 'wrong-secret')), 400, 'BILLING_BAD_SIGNATURE');
    await expectDomainError(() => processStripeWebhook(db, `${raw} `, gap6Sign(raw)), 400, 'BILLING_BAD_SIGNATURE');
    await expectDomainError(() => processStripeWebhook(db, raw, null), 401, 'BILLING_SIGNATURE_MISSING');
    await expectDomainError(() => processStripeWebhook(db, 'not-json', gap6Sign('not-json')), 400, 'BILLING_BAD_PAYLOAD');
    assert.equal(await gap6AuditCount('evt_gap6_evil'), before, 'rejected webhooks mutate nothing');
  } finally {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

test('billing (GAP-6): missing webhook secret fails closed (503), never silently skips verify', async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const raw = gap6Event('evt_gap6_nosecret');
  await expectDomainError(() => processStripeWebhook(db, raw, gap6Sign(raw)), 503, 'BILLING_NOT_CONFIGURED');
  assert.equal(await gap6AuditCount('evt_gap6_nosecret'), 0, 'unconfigured webhook persists nothing');
});

test('billing (GAP-6): checkout without STRIPE_SECRET_KEY is an honest 503 — no fake URL, no TRIALING upsert', async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const before = await db.select().from(subscriptions)
    .where(eq(subscriptions.organizationId, admin.orgId)).limit(1);
  await expectDomainError(
    () => createCheckoutSession(db, admin, 'GROWTH', 'https://x.test/success'),
    503, 'BILLING_NOT_CONFIGURED',
  );
  const after = await db.select().from(subscriptions)
    .where(eq(subscriptions.organizationId, admin.orgId)).limit(1);
  assert.deepEqual(after, before, 'failed checkout must not touch the subscription row');
  await expectDomainError(
    () => createCheckoutSession(db, admin, 'COMMUNITY', 'https://x.test/success'),
    503, 'BILLING_NOT_CONFIGURED',
  );
});

test('purchasing (GAP-9): PR create persists with canon numbering + audit; empty lines → 400; tenant-scoped', async () => {
  await expectDomainError(
    () => createRequisition(db, admin, { title: 'Empty probe', lineItems: [] }),
    400, 'LINE_ITEMS_REQUIRED',
  );

  const pr = await createRequisition(db, admin, {
    title: 'GAP-9 probe requisition',
    vendorSlug: 'grainger-industrial-supply',
    lineItems: [{ sku: CANON.sealSku, description: 'GAP-9 probe seal', quantity: 2, unitPriceCents: 145000 }],
  });
  assert.match(pr.number, /^PR-\d{4}-\d{4}$/, 'canon PR numbering');
  assert.equal(pr.status, 'PENDING_APPROVAL');
  assert.equal(pr.totalCents, 290000);
  assert.equal(pr.lineItems.length, 1);

  const fetched = await getPurchase(db, admin, pr.number);
  assert.equal(fetched.title, 'GAP-9 probe requisition');

  const ledger = await listAuditEvents(db, admin, { entityType: 'purchase_requisition' });
  assert.ok(ledger.rows.some((e) => e.action === 'PR_CREATE' && e.entityId === pr.number), 'PR_CREATE audited');

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.ok(!(await listPurchases(db, decoy)).some((d) => d.number === pr.number), 'decoy tenant sees nothing');
  await expectDomainError(() => getPurchase(db, decoy, pr.number), 404, 'PURCHASE_DOCUMENT_NOT_FOUND');
});

test('purchasing (GAP-9): approve persists + audited; replay idempotent; terminal 409; reject guards', async () => {
  const key = `gap9-decide-${Date.now()}`;
  const decided = await decidePurchase(db, admin, 'PO-2026-0315', { decision: 'APPROVE' }, { idempotencyKey: key });
  assert.equal(decided.status, 'APPROVED');
  assert.equal(decided.decidedBy, admin.name);

  const audits = async () =>
    (await listAuditEvents(db, admin, { entityType: 'purchase_document' })).rows
      .filter((e) => e.action === 'PO_APPROVE' && e.entityId === 'PO-2026-0315');
  assert.equal((await audits()).length, 1, 'exactly one PO_APPROVE audit');

  const replay = await decidePurchase(db, admin, 'PO-2026-0315', { decision: 'APPROVE' }, { idempotencyKey: key });
  assert.equal(replay.status, 'APPROVED');
  assert.equal((await audits()).length, 1, 'idempotent replay writes no second audit');

  await expectDomainError(() => decidePurchase(db, admin, 'PO-2026-0315', { decision: 'APPROVE' }), 409, 'ALREADY_DECIDED');
  await expectDomainError(() => decidePurchase(db, admin, 'PO-2026-9999', { decision: 'APPROVE' }), 404, 'PURCHASE_DOCUMENT_NOT_FOUND');

  const rej = await createRequisition(db, admin, {
    title: 'GAP-9 reject-path probe',
    lineItems: [{ sku: CANON.sealSku, description: 'probe', quantity: 1, unitPriceCents: 100 }],
  });
  await expectDomainError(() => decidePurchase(db, admin, rej.number, { decision: 'REJECT' }), 400, 'REASON_REQUIRED');
  const rejected = await decidePurchase(db, admin, rej.number, { decision: 'REJECT', reason: 'GAP-9 probe: over budget cap' });
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.reason, 'GAP-9 probe: over budget cap');
  const ledger = await listAuditEvents(db, admin, { entityType: 'purchase_document' });
  assert.ok(ledger.rows.some((e) => e.action === 'PO_REJECT' && e.entityId === rej.number), 'PO_REJECT audited');
});

test('purchasing (BR-01): APPROVED PR converts to PO with copied lines; repeat returns same PO; guards enforced', async () => {
  const pr = await createRequisition(db, admin, {
    title: 'BR-01 convert probe',
    vendorSlug: 'grainger-industrial-supply',
    lineItems: [{ sku: CANON.sealSku, description: 'BR-01 seal', quantity: 3, unitPriceCents: 145000 }],
  });
  await expectDomainError(() => convertPrToPo(db, admin, pr.number), 409, 'PR_NOT_APPROVED');

  await decidePurchase(db, admin, pr.number, { decision: 'APPROVE' });

  const key = `br01-convert-${Date.now()}`;
  const first = await convertPrToPo(db, admin, pr.number, { idempotencyKey: key });
  assert.match(first.po.number, /^PO-\d{4}-\d{4}$/, 'canon PO numbering');
  assert.equal(first.po.kind, 'PO');
  assert.equal(first.po.status, 'APPROVED');
  assert.equal(first.po.totalCents, 435000);
  assert.equal(first.po.lineItems.length, 1);
  assert.equal(first.po.lineItems[0].sku, CANON.sealSku);
  assert.equal(first.pr.alreadyConverted, false);

  assert.equal((await getPurchase(db, admin, pr.number)).status, 'CONVERTED');

  const second = await convertPrToPo(db, admin, pr.number);
  assert.equal(second.po.number, first.po.number, 'repeat convert returns existing PO');
  assert.equal(second.pr.alreadyConverted, true);

  const replay = await convertPrToPo(db, admin, pr.number, { idempotencyKey: key });
  assert.equal(replay.po.number, first.po.number, 'keyed replay returns stored response');

  const trail = await listAuditEvents(db, admin, { entityType: 'purchase_document' });
  assert.ok(trail.rows.some((e) => e.action === 'PR_CONVERT' && e.entityId === pr.number), 'PR_CONVERT audited');

  await expectDomainError(() => convertPrToPo(db, admin, first.po.number), 409, 'NOT_A_REQUISITION');
  await expectDomainError(() => convertPrToPo(db, admin, 'PR-2026-9999'), 404, 'PURCHASE_DOCUMENT_NOT_FOUND');
});

test('purchasing (GAP-9): GRN posts with step-up, canon GRN number, stock loop closes; guards enforced', async () => {
  const sku = CANON.sealSku;
  const start = await getPart(db, admin, sku);
  const stepUpAt = await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));

  await expectDomainError(
    () => postGoodsReceipt(db, admin, { poNumber: 'PO-2026-0315', waybill: 'GAP9-WB-1', skuReceived: sku, qtyReceived: 3 }),
    403, 'STEP_UP_REQUIRED',
  );

  const grn = await postGoodsReceipt(
    db, admin,
    { poNumber: 'PO-2026-0315', waybill: 'GAP9-WB-1', skuReceived: sku, qtyReceived: 3 },
    { idempotencyKey: `gap9-grn-${Date.now()}`, stepUpAt },
  );
  assert.match(grn.number, /^GRN-\d{4}-\d{4}$/, 'canon GRN numbering (no Math.random)');
  assert.equal(grn.status, 'RECEIVED');
  assert.equal(grn.verifiedBy, admin.name);

  assert.equal((await getPart(db, admin, sku)).onHand, start.onHand + 3, 'GRN RECEIVE hits stock');
  assert.equal((await getPurchase(db, admin, 'PO-2026-0315')).status, 'RECEIVED', 'PO flips to RECEIVED');

  const ledger = await listAuditEvents(db, admin, { entityType: 'part' });
  const recv = ledger.rows.find((e) => e.action === 'PART_RECEIVE' && (e.after as { ref?: string })?.ref === 'PO-2026-0315');
  assert.ok(recv, 'PART_RECEIVE audited with PO ref');
  assert.ok((recv.after as { stepUpAt?: string })?.stepUpAt, 'step-up timestamp carried into stock audit');

  await expectDomainError(
    () => postGoodsReceipt(db, admin, { poNumber: 'PO-2026-9999', waybill: 'GAP9-WB-2', skuReceived: sku, qtyReceived: 1 }, { stepUpAt }),
    404, 'PURCHASE_DOCUMENT_NOT_FOUND',
  );
  await expectDomainError(
    () => postGoodsReceipt(db, admin, { poNumber: 'PO-2026-0315', waybill: 'GAP9-WB-2', skuReceived: 'PART-NOPE-000', qtyReceived: 1 }, { stepUpAt }),
    404, 'PART_NOT_FOUND',
  );

  const pr = await createRequisition(db, admin, {
    title: 'GAP-9 kind-guard probe',
    lineItems: [{ sku, description: 'probe', quantity: 1, unitPriceCents: 100 }],
  });
  await expectDomainError(
    () => postGoodsReceipt(db, admin, { poNumber: pr.number, waybill: 'GAP9-WB-3', skuReceived: sku, qtyReceived: 1 }, { stepUpAt }),
    422, 'WRONG_DOCUMENT_KIND',
  );

  await expectDomainError(
    () => postGoodsReceipt(db, admin, { poNumber: 'PO-2026-0315', grnNumber: grn.number, waybill: 'GAP9-WB-4', skuReceived: sku, qtyReceived: 1 }, { stepUpAt }),
    409, 'DUPLICATE_RECEIPT',
  );
});

async function t416SeedPo(poNumber: string, qty: number) {
  await db.insert(purchaseOrders).values({
    organizationId: admin.orgId,
    number: poNumber,
    kind: 'PO',
    title: 'T4-16 3-way match probe',
    vendorSlug: 'grainger-industrial-supply',
    totalCents: qty * 145000,
    status: 'APPROVED',
  });
  await db.insert(poLineItems).values({
    organizationId: admin.orgId,
    id: `${poNumber}-L1`,
    documentNumber: poNumber,
    sku: CANON.sealSku,
    description: 'T4-16 probe seal',
    quantity: qty,
    unitPriceCents: 145000,
  });
}

test('purchasing (T4-16): partial dock + full invoice → DISPUTED flag + payment hold + MATCH_DISPUTED audit', async () => {
  await t416SeedPo('PO-2026-4101', 2);
  const stepUpAt = await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));

  await postGoodsReceipt(
    db, admin,
    { poNumber: 'PO-2026-4101', waybill: 'T416-WB-1', skuReceived: CANON.sealSku, qtyReceived: 1 },
    { idempotencyKey: 't416-grn-4101', stepUpAt },
  );

  const inv = await registerInvoice(db, admin, {
    invoiceNumber: 'INV-2026-4101',
    poNumber: 'PO-2026-4101',
    invoiceDate: '2026-09-17',
    lines: [{ sku: CANON.sealSku, description: 'T4-16 probe seal', quantity: 2, unitPriceCents: 145000 }],
  }, { idempotencyKey: 't416-inv-4101', stepUpAt });

  assert.equal(inv.status, 'DISPUTED', 'mismatch → flag');
  assert.equal(inv.paymentHold, true, 'mismatch → payment hold');
  assert.equal(inv.lines.length, 1);
  assert.equal(inv.lines[0].matched, false);
  assert.equal(inv.lines[0].grnQty, 1, 'live GRN qty feeds the line');
  assert.match(inv.lines[0].variance, /pending receipt/, 'variance names the shortage');
  assert.equal(inv.holdCents, 145000, '1 undocked unit held');
  assert.ok(inv.auditTrailId, 'real MATCH_DISPUTED audit id, never fabricated');

  const ledger = await listAuditEvents(db, admin, { entityType: 'vendor_invoice' });
  assert.ok(ledger.rows.some((e) => e.action === 'INVOICE_REGISTER' && e.entityId === 'INV-2026-4101'), 'INVOICE_REGISTER audited');
  assert.ok(ledger.rows.some((e) => e.action === 'MATCH_DISPUTED' && e.entityId === 'INV-2026-4101'), 'MATCH_DISPUTED audited');

  const dossier = await getInvoiceDossier(db, admin, 'INV-2026-4101');
  assert.equal(dossier.status, 'DISPUTED', 'stored verdict feeds the dossier');
  assert.equal(dossier.grnCount, 1);
  assert.equal(dossier.auditTrailId, inv.auditTrailId);
});

test('purchasing (T4-16): full dock + exact invoice → MATCHED, no hold, MATCH_RECONCILED', async () => {
  await t416SeedPo('PO-2026-4102', 2);
  const stepUpAt = await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));

  await postGoodsReceipt(
    db, admin,
    { poNumber: 'PO-2026-4102', waybill: 'T416-WB-2', skuReceived: CANON.sealSku, qtyReceived: 2 },
    { idempotencyKey: 't416-grn-4102', stepUpAt },
  );

  const inv = await registerInvoice(db, admin, {
    invoiceNumber: 'INV-2026-4102',
    poNumber: 'PO-2026-4102',
    invoiceDate: '2026-09-17',
    lines: [{ sku: CANON.sealSku, description: 'T4-16 probe seal', quantity: 2, unitPriceCents: 145000 }],
  }, { idempotencyKey: 't416-inv-4102', stepUpAt });

  assert.equal(inv.status, 'MATCHED');
  assert.equal(inv.paymentHold, false);
  assert.equal(inv.holdCents, 0);
  assert.equal(inv.lines[0].matched, true);
  assert.equal(inv.lines[0].variance, '$0.00 (0.0%)');

  const ledger = await listAuditEvents(db, admin, { entityType: 'vendor_invoice' });
  assert.ok(ledger.rows.some((e) => e.action === 'MATCH_RECONCILED' && e.entityId === 'INV-2026-4102'), 'MATCH_RECONCILED audited');
});

test('purchasing (T4-16): invoices are tenant-scoped; unknown number 404s (no static fallback)', async () => {
  const { ctx: decoy } = await gap14Decoy();
  await expectDomainError(() => getInvoiceDossier(db, decoy, 'INV-2026-4101'), 404, 'VENDOR_INVOICE_NOT_FOUND');
  assert.ok(!(await listInvoices(db, decoy)).some((r) => r.number === 'INV-2026-4101'), 'decoy tenant sees nothing');
  await expectDomainError(() => getInvoiceDossier(db, admin, 'INV-2026-9999'), 404, 'VENDOR_INVOICE_NOT_FOUND');
});

test('purchasing (T4-16): idempotent replay of registerInvoice writes no second audit row', async () => {
  const disputedCount = async () =>
    (await listAuditEvents(db, admin, { entityType: 'vendor_invoice' })).rows
      .filter((e) => e.action === 'MATCH_DISPUTED' && e.entityId === 'INV-2026-4101').length;
  assert.equal(await disputedCount(), 1, 'exactly one MATCH_DISPUTED from the first registration');

  const stepUpAt = await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));
  const replay = await registerInvoice(db, admin, {
    invoiceNumber: 'INV-2026-4101',
    poNumber: 'PO-2026-4101',
    invoiceDate: '2026-09-17',
    lines: [{ sku: CANON.sealSku, description: 'T4-16 probe seal', quantity: 2, unitPriceCents: 145000 }],
  }, { idempotencyKey: 't416-inv-4101', stepUpAt });
  assert.equal(replay.status, 'DISPUTED', 'replay returns the stored verdict');
  assert.equal(await disputedCount(), 1, 'idempotent replay writes no second MATCH_DISPUTED');
});

test('purchasing (T4-16): registerInvoice guards — step-up, number format, duplicates, PO kind', async () => {
  const stepUpAt = await verifyStepUpCode(db, admin, totpNow(SEED_TOTP_SECRET));
  const line = [{ sku: CANON.sealSku, description: 'T4-16 probe seal', quantity: 1, unitPriceCents: 145000 }];

  await expectDomainError(
    () => registerInvoice(db, admin, { invoiceNumber: 'INV-2026-4199', poNumber: 'PO-2026-4101', invoiceDate: '2026-09-17', lines: line }),
    403, 'STEP_UP_REQUIRED',
  );
  await expectDomainError(
    () => registerInvoice(db, admin, { invoiceNumber: 'NOPE', poNumber: 'PO-2026-4101', invoiceDate: '2026-09-17', lines: line }, { stepUpAt }),
    422, 'INVALID_INVOICE_NUMBER',
  );
  await expectDomainError(
    () => registerInvoice(db, admin, { invoiceNumber: 'INV-2026-4101', poNumber: 'PO-2026-4101', invoiceDate: '2026-09-17', lines: line }, { stepUpAt }),
    409, 'DUPLICATE_INVOICE',
  );

  const pr = await createRequisition(db, admin, {
    title: 'T4-16 kind-guard probe',
    lineItems: [{ sku: CANON.sealSku, description: 'probe', quantity: 1, unitPriceCents: 100 }],
  });
  await expectDomainError(
    () => registerInvoice(db, admin, { invoiceNumber: 'INV-2026-4198', poNumber: pr.number, invoiceDate: '2026-09-17', lines: line }, { stepUpAt }),
    422, 'WRONG_DOCUMENT_KIND',
  );
});

test('pm (GAP-10): create rule with canon PM number; list reflects it; tenant-scoped + audited', async () => {
  const rule = await createPmRule(db, admin, {
    title: 'GAP-10 chiller loop probe',
    assetCode: CANON.assetSeal,
    intervalDays: 90,
    priority: 'P2',
  });
  assert.match(rule.id, /^PM-\d{4}-\d{4}$/, 'canon PM numbering (no Math.random)');
  assert.equal(rule.status, 'ACTIVE');
  assert.equal(rule.intervalDays, 90);

  const list = await listPmRules(db, admin);
  assert.ok(list.some((r) => r.id === rule.id), 'list contains the new rule');

  const ledger = await listAuditEvents(db, admin, { entityType: 'pm_rule' });
  assert.ok(ledger.rows.some((e) => e.action === 'PM_RULE_CREATE' && e.entityId === rule.id), 'PM_RULE_CREATE audited');
});

test('pm (GAP-10): generate WO from rule; idempotent replay; nextDueAt advances; guards enforced', async () => {
  const rule = await createPmRule(db, admin, {
    title: 'GAP-10 generate probe',
    assetCode: CANON.assetSeal,
    intervalDays: 30,
    priority: 'P3',
  });

  const key = `gap10-gen-${Date.now()}`;
  const first = await generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: key });
  assert.match(first.wo.number, /^WO-\d{4}-\d{4}$/, 'WO from the WO sequence (not fabricated)');
  assert.equal(first.wo.status, 'SCHEDULED');
  assert.ok(first.rule.lastGeneratedAt, 'rule stamps lastGeneratedAt');

  const replay = await generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: key });
  assert.equal(replay.wo.number, first.wo.number, 'same Idempotency-Key → same WO, no duplicate');

  const paused = await togglePmRule(db, admin, rule.id, 'PAUSED');
  assert.equal(paused.status, 'PAUSED');
  await expectDomainError(
    () => generatePmWorkOrder(db, admin, rule.id),
    422, 'RULE_PAUSED',
  );
  const resumed = await togglePmRule(db, admin, rule.id, 'ACTIVE');
  assert.equal(resumed.status, 'ACTIVE');

  await expectDomainError(
    () => generatePmWorkOrder(db, admin, 'PM-2099-9999'),
    404, 'PM_RULE_NOT_FOUND',
  );
  await expectDomainError(
    () => togglePmRule(db, admin, 'PM-2099-9999', 'PAUSED'),
    404, 'PM_RULE_NOT_FOUND',
  );

  const ledger = await listAuditEvents(db, admin, { entityType: 'pm_rule' });
  assert.ok(
    ledger.rows.some((e) => e.action === 'PM_GENERATE_WO' && e.entityId === rule.id),
    'PM_GENERATE_WO audited',
  );
});

test('inspections (GAP-11): create persists with canon numbering + audit; tenant-scoped', async () => {
  const ins = await createInspection(db, admin, { title: 'GAP-11 probe inspection', auditorName: 'GAP Probe' });
  assert.match(ins.number, /^INS-\d{4}-\d{4}$/, 'canon INS numbering (no Math.random)');
  assert.equal(ins.status, 'SCHEDULED');
  assert.equal(ins.progressPct, 0);

  const fetched = await getInspection(db, admin, ins.number);
  assert.equal(fetched.title, 'GAP-11 probe inspection');

  const ledger = await listAuditEvents(db, admin, { entityType: 'inspection' });
  assert.ok(ledger.rows.some((e) => e.action === 'INSPECTION_CREATE' && e.entityId === ins.number), 'INSPECTION_CREATE audited');

  const { ctx: decoy } = await sessionFor('t.user@apexgl.io', 'decoy-pass-9021');
  assert.ok(!(await listInspections(db, decoy)).some((r) => r.number === ins.number), 'decoy tenant sees nothing');
  await expectDomainError(() => getInspection(db, decoy, ins.number), 404, 'INSPECTION_NOT_FOUND');
});

test('inspections (GAP-11): force-dispatch persists + audited; replay idempotent; 404/409 guards; progress preserved', async () => {
  const ins = await createInspection(db, admin, { title: 'GAP-11 dispatch probe' });
  const key = `gap11-dispatch-${Date.now()}`;

  const disp = await forceDispatchInspection(db, admin, ins.number, { reason: 'GAP-11 probe' }, { idempotencyKey: key });
  assert.equal(disp.status, 'IN_PROGRESS');
  assert.equal(disp.progressPct, 0, 'fresh dispatch keeps progress');

  const audits = async () =>
    (await listAuditEvents(db, admin, { entityType: 'inspection' })).rows
      .filter((e) => e.action === 'INSPECTION_FORCE_DISPATCH' && e.entityId === ins.number);
  assert.equal((await audits()).length, 1, 'exactly one INSPECTION_FORCE_DISPATCH audit');

  const replay = await forceDispatchInspection(db, admin, ins.number, { reason: 'GAP-11 probe' }, { idempotencyKey: key });
  assert.equal(replay.status, 'IN_PROGRESS');
  assert.equal((await audits()).length, 1, 'idempotent replay writes no second audit');

  await updateInspectionProgress(db, admin, ins.number, 45);
  const redispatched = await forceDispatchInspection(db, admin, ins.number, {}, {});
  assert.equal(redispatched.progressPct, 45, 'dispatch preserves existing progress');
  assert.equal(redispatched.status, 'IN_PROGRESS');

  await expectDomainError(() => forceDispatchInspection(db, admin, 'INS-2099-9999', {}, {}), 404, 'INSPECTION_NOT_FOUND');

  await updateInspectionProgress(db, admin, ins.number, 100);
  await expectDomainError(() => forceDispatchInspection(db, admin, ins.number, {}, {}), 409, 'ALREADY_COMPLETED');
});

test('inspections (GAP-11): progress persists COMPLETED + audit; clamps; unknown → 404', async () => {
  const ins = await createInspection(db, admin, { title: 'GAP-11 progress probe' });

  const done = await updateInspectionProgress(db, admin, ins.number, 150);
  assert.equal(done.progressPct, 100, 'service clamps to 100');
  assert.equal(done.status, 'COMPLETED');

  const ledger = await listAuditEvents(db, admin, { entityType: 'inspection' });
  assert.ok(ledger.rows.some((e) => e.action === 'INSPECTION_PROGRESS' && e.entityId === ins.number), 'INSPECTION_PROGRESS audited');

  await expectDomainError(() => updateInspectionProgress(db, admin, 'INS-2099-9999', 10), 404, 'INSPECTION_NOT_FOUND');
});

test('wo-tasks (GAP-12/F5): seed 7 steps → advance 05 DONE unlocks 06 → 07 early is 422 → photo gate on T01', async () => {
  const tasks = await listWoTasks(db, admin, CANON.workOrderSeal);
  assert.equal(tasks.length, 7, 'canon seal WO seeds 7 execution tasks');
  assert.deepEqual(tasks.map((t) => t.status), ['DONE', 'DONE', 'DONE', 'DONE', 'IN_PROGRESS', 'PENDING', 'LOCKED']);

  const t07 = tasks.find((t) => t.stepOrder === 7)!;
  await expectDomainError(() => updateWoTask(db, admin, { taskId: t07.id, woNumber: CANON.workOrderSeal, status: 'DONE' }), 422, 'SEQUENCE_VIOLATION');

  const t05 = tasks.find((t) => t.stepOrder === 5)!;
  const done05 = await updateWoTask(db, admin, { taskId: t05.id, woNumber: CANON.workOrderSeal, status: 'DONE' });
  assert.equal(done05.status, 'DONE');
  assert.equal(done05.verifiedBy, 'Marcus Vance');
  const after = await listWoTasks(db, admin, CANON.workOrderSeal);
  assert.equal(after.find((t) => t.stepOrder === 6)!.status, 'PENDING', 'next LOCKED step unlocks on DONE');

  const woNo = 'WO-2026-0911';
  await db.insert((await import('../db/schema')).workOrders).values({
    organizationId: admin.orgId, number: woNo, title: 'Photo gate probe', assetCode: null,
    location: 'Probe Bay', priority: 'P3', status: 'IN_PROGRESS', holdReason: null,
    slaDueAt: new Date(Date.now() + 3600_000), assignedTo: null,
  }).onConflictDoNothing();
  const { woTasks } = await import('../db/schema');
  await db.insert(woTasks).values({
    organizationId: admin.orgId, id: 'PROBE-T01', workOrderNumber: woNo, stepOrder: 1,
    title: 'Photo-gated step', instruction: '', status: 'IN_PROGRESS', requiresPhoto: true,
  }).onConflictDoNothing();
  await expectDomainError(() => updateWoTask(db, admin, { taskId: 'PROBE-T01', woNumber: woNo, status: 'DONE' }), 422, 'PHOTO_REQUIRED');

  const ledger = await listAuditEvents(db, admin);
  assert.ok(ledger.rows.some((e) => e.action === 'WO_TASK_UPDATE'), 'WO_TASK_UPDATE audited');
});

test('api-keys (GAP-13/F30): issue show-once → list hides secret → revoke → 409 replay', async () => {
  const created = await createApiKey(db, admin, { name: 'gap13-probe' });
  assert.match(created.id, /^AK-\d{4}-\d{4}$/, 'canon AK numbering');
  assert.ok(created.secret.startsWith('ak_live_'), 'secret issued once');
  assert.equal(created.last4, created.secret.slice(-4), 'last4 derives from secret');

  const keys = await listApiKeys(db, admin);
  const listed = keys.find((k) => k.id === created.id)!;
  assert.ok(listed, 'new key listed');
  assert.ok(!('secret' in listed), 'secret NEVER readable again');

  const again = await createApiKey(db, admin, { name: 'gap13-second' });
  assert.notEqual(again.id, created.id, 'ids unique');
  assert.notEqual(again.secret, created.secret, 'secrets unique');

  const revoked = await revokeApiKey(db, admin, created.id);
  assert.ok(revoked.revokedAt, 'revokedAt stamped');
  assert.ok(!(await listApiKeys(db, admin)).some((k) => k.id === created.id), 'revoked key leaves the active list');

  await expectDomainError(() => revokeApiKey(db, admin, created.id), 409, 'API_KEY_ALREADY_REVOKED');
  await expectDomainError(() => revokeApiKey(db, admin, 'AK-2099-9999'), 404, 'API_KEY_NOT_FOUND');
  await expectDomainError(() => createApiKey(db, admin, { name: '   ' }), 400, 'VALIDATION_ERROR');

  const ledger = await listAuditEvents(db, admin, { entityType: 'api_key' });
  assert.ok(ledger.rows.some((e) => e.action === 'API_KEY_CREATE' && e.entityId === created.id), 'API_KEY_CREATE audited');
  assert.ok(ledger.rows.some((e) => e.action === 'API_KEY_REVOKE' && e.entityId === created.id), 'API_KEY_REVOKE audited');
});

test('evidence (GAP-13/F6): addEvidence persists row + listWoEvidence tenant-scoped', async () => {
  const ev = await addEvidence(db, admin, {
    workOrderNumber: CANON.workOrderSeal,
    taskId: null,
    fileName: 'probe.png',
    filePath: '.data/evidence/probe.png',
    mimeType: 'image/png',
    fileSize: 68,
    sha256Hash: 'probe-hash-gap13',
  });
  assert.ok(ev.id.startsWith('ev-'), 'evidence id issued');
  assert.equal(ev.uploadedBy, 'Marcus Vance');

  const rows = await listWoEvidence(db, admin, CANON.workOrderSeal);
  assert.ok(rows.some((r) => r.id === ev.id), 'row visible in WO evidence list');

  const ledger = await listAuditEvents(db, admin, { entityType: 'evidence' });
  assert.ok(ledger.rows.some((e) => e.action === 'EVIDENCE_UPLOAD' && e.entityId === ev.id), 'EVIDENCE_UPLOAD audited');
});

let gap14DecoyCache: { ctx: AuthContext; token: string } | null = null;
async function gap14Decoy(): Promise<{ ctx: AuthContext; token: string }> {
  if (gap14DecoyCache) return gap14DecoyCache;
  const rows = await db.select({ id: users.id, organizationId: users.organizationId })
    .from(users).where(eq(users.email, 't.user@apexgl.io')).limit(1);
  assert.ok(rows[0], 'decoy user seeded');
  const token = await createSession(db, rows[0].id, rows[0].organizationId, 'gap14-probe');
  const ctx = await verifySession(db, token);
  assert.ok(ctx, 'decoy session verifies');
  gap14DecoyCache = { ctx, token };
  return gap14DecoyCache;
}

test('vendors (GAP-14/F14): create → 409 slug replay → list tenant-scoped', async () => {  const v = await createVendor(db, admin, { name: 'Carrier Rental Systems', tier: 'TIER-2', duns: '00-555-0199', scope: 'Temporary chillers', contact: 'Jane Doe' }, { idempotencyKey: 'gap14-vendor-1' });
  assert.equal(v.slug, 'carrier-rental-systems', 'slug derives from name');
  assert.equal(v.msaStatus, 'NO MSA', 'no term on file');
  assert.equal(v.scope, 'Temporary chillers');

  await expectDomainError(() => createVendor(db, admin, { name: 'Carrier Rental Systems' }), 409, 'VENDOR_SLUG_EXISTS');
  await expectDomainError(() => createVendor(db, admin, { name: 'Bad Tier Co', tier: 'TIER-9' }), 400, 'VALIDATION_ERROR');

  const replay = await createVendor(db, admin, { name: 'Carrier Rental Systems', tier: 'TIER-2', duns: '00-555-0199', scope: 'Temporary chillers', contact: 'Jane Doe' }, { idempotencyKey: 'gap14-vendor-1' });
  assert.equal(replay.slug, v.slug, 'idempotent replay returns same vendor');

  const rows = await listVendors(db, admin);
  assert.ok(rows.some((r) => r.slug === v.slug), 'new vendor listed');
  assert.ok(rows.some((r) => r.slug === CANON.vendorSlug), 'seeded canon vendor listed');

  const { ctx: decoy } = await gap14Decoy();
  assert.ok(!(await listVendors(db, decoy)).some((r) => r.slug === v.slug), 'decoy tenant sees nothing');
  await expectDomainError(() => getVendor(db, decoy, v.slug), 404, 'VENDOR_NOT_FOUND');

  const ledger = await listAuditEvents(db, admin, { entityType: 'vendor' });
  assert.ok(ledger.rows.some((e) => e.action === 'VENDOR_CREATE' && e.entityId === v.slug), 'VENDOR_CREATE audited');
});

test('vendors (GAP-14/F14): amend + renew advance expiry + commend audited + 404', async () => {
  const v = await amendVendor(db, admin, 'carrier-rental-systems', { scope: 'Temporary chillers + pumps', contact: 'Jane Doe · AM' }, { idempotencyKey: 'gap14-amend-1' });
  assert.equal(v.scope, 'Temporary chillers + pumps');
  await expectDomainError(() => amendVendor(db, admin, 'carrier-rental-systems', {}), 400, 'VALIDATION_ERROR');

  const renewed = await renewVendor(db, admin, CANON.vendorSlug, { termMonths: 12 }, { idempotencyKey: 'gap14-renew-1' });
  assert.equal(renewed.msaStatus, 'ACTIVE', 'canon vendor stays in-term');
  assert.ok(renewed.msaExpiresOn! > '2026-09-16', 'expiry is a future date');
  await expectDomainError(() => renewVendor(db, admin, CANON.vendorSlug, { termMonths: 7 }), 400, 'VALIDATION_ERROR');

  const cmd = await commendVendor(db, admin, CANON.vendorSlug, { note: 'Night response under 2h — zero extension.' });
  assert.equal(cmd.slug, CANON.vendorSlug, 'commendation recorded');
  await expectDomainError(() => commendVendor(db, admin, CANON.vendorSlug, { note: 'short' }), 400, 'VALIDATION_ERROR');
  await expectDomainError(() => getVendor(db, admin, 'no-such-vendor'), 404, 'VENDOR_NOT_FOUND');

  const ledger = await listAuditEvents(db, admin, { entityType: 'vendor' });
  assert.ok(ledger.rows.some((e) => e.action === 'VENDOR_AMEND'), 'VENDOR_AMEND audited');
  assert.ok(ledger.rows.some((e) => e.action === 'VENDOR_RENEW'), 'VENDOR_RENEW audited');
  assert.ok(ledger.rows.some((e) => e.action === 'VENDOR_COMMEND'), 'VENDOR_COMMEND audited');
});

test('vendors (GAP-14/F14): related POs resolve by vendorSlug', async () => {
  const pos = await listVendorPos(db, admin, CANON.vendorSlug);
  assert.ok(pos.some((p) => p.number === CANON.purchaseOrder), 'canon PO linked to canon vendor');
  const empty = await listVendorPos(db, admin, 'carrier-rental-systems');
  assert.equal(empty.length, 0, 'new vendor has no POs yet');
});

test('telemetry (GAP-14/F8): ingest → listRecent by assetCode feeds BIM refresh', async () => {
  const r = await ingestSensorReading(db, admin, { assetCode: CANON.assetSeal, sensorType: 'TEMPERATURE', value: 84.1, unit: '°C' });
  assert.equal(r.status, 'WARNING', '84.1°C trips the 75°C warning threshold');
  await ingestSensorReading(db, admin, { assetCode: CANON.assetSeal, sensorType: 'PRESSURE_PSI', value: 118, unit: 'PSI' });

  const rows = await listRecentSensorReadings(db, admin, CANON.assetSeal, 20);
  assert.ok(rows.some((x) => x.sensorType === 'TEMPERATURE' && x.value === '84.1'), 'temperature reading listed');
  assert.ok(rows.some((x) => x.sensorType === 'PRESSURE_PSI'), 'pressure reading listed');

  const { ctx: decoy } = await gap14Decoy();
  assert.equal((await listRecentSensorReadings(db, decoy, CANON.assetSeal, 20)).length, 0, 'decoy sees no readings');
});

test('signup (GAP-16/F2): provision happy → 201 contract + session verifies + tenant isolated', async () => {
  const res = await provisionOrganization(db, {
    orgName: 'GAP16 Probe Facility Co',
    adminEmail: '  GAP16-ADMIN@probe.example ', // service trims + lowercases
    adminName: 'Probe Admin',
    adminPassword: 'gap16-pass-1234',
    adminTitle: 'Ops Lead',
  }, 'gap16-test');

  assert.ok(!('duplicate' in res), 'happy-path provision is not a duplicate');
  assert.match(res.organizationId, /^APX-/, 'org id stamped APX-*');
  assert.equal(res.orgName, 'GAP16 Probe Facility Co');
  assert.equal(res.adminEmail, 'gap16-admin@probe.example', 'email trimmed+lowercased');
  assert.ok(res.adminUserId, '201 contract carries adminUserId');
  assert.ok(res.sessionToken, '201 contract carries sessionToken (= cookie value set by route)');

  const ctx = await verifySession(db, res.sessionToken);
  assert.ok(ctx, 'signup session verifies');
  assert.equal(ctx!.orgId, res.organizationId);
  assert.equal(ctx!.role, 'Enterprise Admin');

  const seqRows = await db.select().from(sequences).where(eq(sequences.organizationId, res.organizationId));
  assert.equal(seqRows.length, 8, 'sequences initialized');
  assert.ok(seqRows.every((r) => r.nextVal === 1), 'all sequences start at 1');

  assert.equal((await listWorkOrders(db, ctx!)).length, 0, 'new tenant isolated from canon data');
  assert.ok(!(await listUsers(db, admin)).some((u) => u.email === res.adminEmail), 'canon tenant cannot see new admin');
  const { ctx: decoy } = await gap14Decoy();
  assert.ok(!(await listUsers(db, decoy)).some((u) => u.email === res.adminEmail), 'decoy tenant cannot see new admin');

  const audits = await listAuditEvents(db, ctx!, { entityType: 'organization' });
  assert.ok(
    audits.rows.some((e) => e.action === 'ORG_PROVISION' && e.entityId === res.organizationId),
    'ORG_PROVISION audited',
  );
});

test('signup (GAP-16/F2/BR-20): duplicate admin email → {duplicate:true}, no oracle, nothing persisted', async () => {
  const dup1 = await provisionOrganization(db, {
    orgName: 'Duplicate Probe Org',
    adminEmail: 'gap16-admin@probe.example', // created by the happy-path test above
    adminName: 'Second Admin',
    adminPassword: 'gap16-pass-5678',
  });
  assert.deepEqual(dup1, { duplicate: true }, 'no 409 EMAIL_EXISTS oracle — same 2xx family');

  const dup2 = await provisionOrganization(db, {
    orgName: 'Squatter Org',
    adminEmail: ' M.Vance@ApexOps.io ', // seed admin, mixed case + spaces
    adminName: 'Squatter',
    adminPassword: 'squat-pass-99',
  });
  assert.deepEqual(dup2, { duplicate: true }, 'seed-admin email also generic');

  const half = await db.select().from(organizations).where(eq(organizations.name, 'Duplicate Probe Org'));
  assert.equal(half.length, 0, 'duplicate signup persists nothing');
});

test('signup (GAP-16/F2): route POST with invalid bodies → 400 VALIDATION_ERROR (zod fires before DB)', async () => {
  const reqFor = (body: unknown) => new NextRequest('http://probe.local/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const valid = {
    orgName: 'Route Probe Co',
    adminEmail: 'route-probe@probe.example',
    adminName: 'Route Probe',
    adminPassword: 'route-pass-123',
  };

  const shortPass = await signupPost(reqFor({ ...valid, adminPassword: 'short' }));
  assert.equal(shortPass.status, 400, 'short password rejected');
  const env1 = (await shortPass.json()) as { error?: { code?: string } };
  assert.equal(env1.error?.code, 'VALIDATION_ERROR');

  const badEmail = await signupPost(reqFor({ ...valid, adminEmail: 'not-an-email' }));
  assert.equal(badEmail.status, 400, 'invalid email rejected');
  const env2 = (await badEmail.json()) as { error?: { code?: string } };
  assert.equal(env2.error?.code, 'VALIDATION_ERROR');

  const shortOrg = await signupPost(reqFor({ ...valid, orgName: 'ab' }));
  assert.equal(shortOrg.status, 400, 'org name <3 rejected');

  const noOrg = await db.select().from(organizations).where(eq(organizations.name, 'Route Probe Co'));
  assert.equal(noOrg.length, 0, 'invalid payloads never reach provisioning');
});

test('retention (GAP-19/F25): digest compute unchanged — regression under the deprecation envelope', async () => {
  const digest = await generateRetentionDigest(db, admin.orgId);
  assert.equal(digest.organizationId, admin.orgId, 'digest is tenant-scoped');
  assert.ok(Array.isArray(digest.urgentSlaThreats), 'SLA threats array present');
  assert.ok(Array.isArray(digest.upcomingPreventiveMaintenances), 'upcoming PM array present');
  assert.equal(typeof digest.healthScorePct, 'number', 'health score numeric');
  assert.ok(digest.generatedAt && !Number.isNaN(Date.parse(digest.generatedAt)), 'generatedAt ISO');
});

test('retention (GAP-19/F25): deprecation metadata — sunset 90 days from 2026-09-16, honest note', () => {
  assert.equal(RETENTION_DIGEST_SUNSET, '2026-12-15', 'sunset fixed at execution date +90d');
  const deltaDays = Math.round(
    (Date.parse(`${RETENTION_DIGEST_SUNSET}T00:00:00Z`) - Date.parse('2026-09-16T00:00:00Z')) / 86_400_000,
  );
  assert.equal(deltaDays, 90, 'sunset is exactly 90 days after the deprecation execution date');
  assert.ok(
    /no trigger/i.test(RETENTION_DIGEST_NOTE) &&
      /scheduler/i.test(RETENTION_DIGEST_NOTE) &&
      /consumer/i.test(RETENTION_DIGEST_NOTE),
    'note states the orphan facts (no trigger/scheduler/consumer)',
  );
});

test('retention (GAP-19/F25): wo.read permission stays enforced — unauth GET → 401', async () => {
  const res = await retentionDigestGet(new NextRequest('http://probe.local/api/retention/digest', { method: 'GET' }));
  assert.equal(res.status, 401, 'deprecated endpoint still requires a session');
  const env = (await res.json()) as { error?: { code?: string } };
  assert.equal(env.error?.code, 'UNAUTHENTICATED');
});

test('facilities (GAP-20/F15): create persists code-recallably; idempotent replay; 409 dup; tenant guard; FACILITY_CREATE audit', async () => {
  const countAudit = async (action: string) => {
    const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action));
    return rows.length;
  };

  const before = await listFacilities(db, admin);
  assert.ok(before.some((f) => f.code === 'B2-MECH-204'), 'seed canon facility present');
  assert.equal(before.find((f) => f.code === 'B2-MECH-204')?.mapped, false, 'seed facility honestly unmapped');

  const createsBefore = await countAudit('FACILITY_CREATE');
  const f1 = await createFacility(db, admin, { name: '#B-216 RO Water Plant' }, { idempotencyKey: 'fac-create-it-01' });
  assert.equal(f1.code, 'B-216-RO-WATER-PLANT', 'code derived server-side from the name');
  assert.ok(f1.id.length > 8, 'opaque server id returned');
  assert.equal(f1.mapped, false, 'no geojson → unmapped');
  assert.equal(f1.defects.length, 0);
  assert.equal(f1.transfers.length, 0);
  const afterCreate = await countAudit('FACILITY_CREATE');
  assert.equal(afterCreate - createsBefore, 1, 'exactly one FACILITY_CREATE audit row');

  const replay = await createFacility(db, admin, { name: '#B-216 RO Water Plant' }, { idempotencyKey: 'fac-create-it-01' });
  assert.equal(replay.code, f1.code);
  assert.equal(replay.id, f1.id, 'replay returns the originally persisted row');
  assert.equal(await countAudit('FACILITY_CREATE'), afterCreate, 'replay audited nothing new');
  const mid = await listFacilities(db, admin);
  assert.equal(mid.filter((f) => f.code === f1.code).length, 1, 'single row after replay');

  await expectDomainError(
    () => createFacility(db, admin, { name: 'B-216 RO Water Plant # ' }, { idempotencyKey: null }),
    409, 'FACILITY_CODE_EXISTS',
  );

  const { ctx: decoy } = await gap14Decoy();
  const decoyList = await listFacilities(db, decoy);
  assert.ok(decoyList.some((f) => f.code === 'DOCK-QA-01'), 'decoy sees its seeded row');
  assert.ok(!decoyList.some((f) => f.code.startsWith('B2-') || f.code.startsWith('B-216')), 'decoy cannot see canon facilities');
  await expectDomainError(() => getFacility(db, decoy, f1.code), 404, 'FACILITY_NOT_FOUND');
  await expectDomainError(() => getFacility(db, admin, 'B-999'), 404, 'FACILITY_NOT_FOUND');
});

test('facilities (GAP-20/F15): update stages defect + transfer in meta (idempotent); name patch; empty patch 400; FACILITY_UPDATE audit', async () => {
  const countAudit = async (action: string) => {
    const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action));
    return rows.length;
  };

  const t1 = await updateFacility(db, admin, 'B2-MECH-204', {
    transfer: { assetCode: 'AST-HVAC-004', toCode: 'B-208-PRIMARY-PUMP-BAY' },
  }, { idempotencyKey: 'fac-transfer-it-01' });
  assert.equal(t1.transfers.length, 1, 'transfer request staged in meta');
  assert.equal(t1.transfers[0]?.assetCode, 'AST-HVAC-004');
  const tReplay = await updateFacility(db, admin, 'B2-MECH-204', {
    transfer: { assetCode: 'AST-HVAC-004', toCode: 'B-208-PRIMARY-PUMP-BAY' },
  }, { idempotencyKey: 'fac-transfer-it-01' });
  assert.equal(tReplay.transfers.length, 1, 'replay did not double-append');

  const d1 = await updateFacility(db, admin, 'B2-MECH-204', {
    defect: 'Condenser tube bundle fouling observed on boroscope inspection',
  });
  assert.equal(d1.defects.length, 1, 'defect staged in meta');
  assert.equal(d1.defects[0]?.by, admin.name);
  assert.match(d1.defects[0]?.text ?? '', /fouling/);

  const reread = await getFacility(db, admin, 'B2-MECH-204');
  assert.equal(reread.defects.length, 1);
  assert.equal(reread.transfers.length, 1);
  assert.ok(reread.updatedAt >= reread.createdAt, 'updatedAt advanced');

  const renamed = await updateFacility(db, admin, 'B2-MECH-204', { name: 'Centrifugal Chiller Plant Room #B-204 (CUP)' });
  assert.equal(renamed.code, 'B2-MECH-204', 'code immutable on rename');
  assert.match(renamed.name, /\(CUP\)$/);
  const mapped = await updateFacility(db, admin, 'B2-MECH-204', { geojson: '{"type":"Polygon","coordinates":[[[101.73,2.51],[101.736,2.51],[101.736,2.518],[101.73,2.518],[101.73,2.51]]]}' });
  assert.equal(mapped.mapped, true, 'geojson persisted → mapped');
  const unmapped = await updateFacility(db, admin, 'B2-MECH-204', { geojson: null });
  assert.equal(unmapped.mapped, false, 'geojson explicitly cleared');

  await expectDomainError(() => updateFacility(db, admin, 'B2-MECH-204', {}), 400, 'VALIDATION_ERROR');

  await expectDomainError(() => updateFacility(db, admin, 'B-999', { defect: 'irrelevant long enough note' }), 404, 'FACILITY_NOT_FOUND');
  const { ctx: decoy } = await gap14Decoy();
  await expectDomainError(
    () => updateFacility(db, decoy, 'B2-MECH-204', { defect: 'cross-tenant tamper attempt should fail' }),
    404, 'FACILITY_NOT_FOUND',
  );

  const updates = await countAudit('FACILITY_UPDATE');
  assert.ok(updates >= 5, `expected ≥5 FACILITY_UPDATE audit rows, got ${updates}`);
});

test('facilities (GAP-20/F15): RBAC grants facilities.read to all roles and facilities.manage to vendor-managing roles', () => {
  assert.ok(can('Read-Only Auditor', 'facilities.read'), 'read for every role');
  assert.ok(can('Facility Director', 'facilities.manage'), 'Facility Director manages facilities');
  assert.ok(can('Engineering Lead', 'facilities.manage'), 'Engineering Lead manages facilities');
  assert.ok(can('Enterprise Admin', 'facilities.manage'), 'Enterprise Admin wildcard');
  assert.equal(can('Senior Field Tech', 'facilities.manage'), false, 'Senior Field Tech read-only');
});

test('settings KV (GAP-21/F26): PUT/GET round-trip, replay idempotent, kind=secret blocked on PUT, tenant guard, audit written', async () => {
  const countAudit = async (action: string) => {
    const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action));
    return rows.length;
  };

  const init = await listSettings(db, admin);
  assert.ok(init.some((s) => s.key === 'ops.maint_mode' && s.value === false), 'seeded ops.maint_mode=false present');
  assert.ok(!init.some((s) => s.kind === 'secret'), 'no secrets seeded');

  const before = await countAudit('SETTINGS_UPDATE');
  const written = await putSetting(db, admin, 'general.profile', {
    value: { company: 'Apex Nusantara', brand: 'Apex Ops East', ccy: 'IDR', tz: 'UTC+07:00', fiscal: 'Jan-Dec', week: 'Mon-Sat' },
  }, { idempotencyKey: 'set-put-it-01' });
  assert.equal(written.key, 'general.profile');
  assert.deepEqual((written.value as Record<string, unknown>).ccy, 'IDR');
  assert.equal(await countAudit('SETTINGS_UPDATE') - before, 1, 'exactly one SETTINGS_UPDATE audit row');

  const replay = await putSetting(db, admin, 'general.profile', {
    value: { company: 'Apex Nusantara', brand: 'Apex Ops East', ccy: 'IDR', tz: 'UTC+07:00', fiscal: 'Jan-Dec', week: 'Mon-Sat' },
  }, { idempotencyKey: 'set-put-it-01' });
  assert.equal(replay.updatedAt, written.updatedAt, 'replay returns the original write (unchanged timestamp)');
  assert.equal(await countAudit('SETTINGS_UPDATE') - before, 1, 'replay audited nothing new');

  const rePut = await putSetting(db, admin, 'general.profile', { value: { ccy: 'USD' } });
  assert.equal((rePut.value as Record<string, unknown>).ccy, 'USD');

  const listAgain = await listSettings(db, admin);
  const profile = listAgain.find((s) => s.key === 'general.profile');
  assert.ok(profile && (profile.value as Record<string, unknown>).ccy === 'USD', 'list reflects latest write');

  await expectDomainError(
    () => putSetting(db, admin, 'security.core_api_secret', { value: 'apx_live_sec_plaintext_no', kind: 'secret' }),
    400, 'SECRET_VIA_ROTATE',
  );
  assert.ok(
    !(await listSettings(db, admin)).some((s) => s.key === 'security.core_api_secret'),
    'blocked secret PUT left no secret row',
  );

  await expectDomainError(() => putSetting(db, admin, 'bad key with spaces', { value: 1 }), 400, 'VALIDATION_ERROR');
  await expectDomainError(
    () => putSetting(db, admin, 'toobig', { value: 'x'.repeat(20_000) }),
    400, 'VALIDATION_ERROR',
  );

  const { ctx: decoy } = await gap14Decoy();
  const decoyList = await listSettings(db, decoy);
  assert.ok(!decoyList.some((s) => s.key === 'general.profile' || s.key === 'ops.maint_mode'), 'decoy cannot see canon settings');
  const decoyPut = await putSetting(db, decoy, 'general.profile', { value: { ccy: 'MYR' } });
  assert.equal((decoyPut.value as Record<string, unknown>).ccy, 'MYR', 'decoy writes its own profile');
  const canonAfter = (await listSettings(db, admin)).find((s) => s.key === 'general.profile');
  assert.equal((canonAfter!.value as Record<string, unknown>).ccy, 'USD', 'canon row untouched by decoy write');
});

test('settings KV (GAP-21/F26): rotate hash-only — plaintext returned once, never listed, replaystable, audit written', async () => {
  const countAudit = async (action: string) => {
    const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action));
    return rows.length;
  };

  const before = await countAudit('SETTINGS_SECRET_ROTATE');
  const r1 = await rotateSecret(db, admin, 'security.core_api_secret', { idempotencyKey: 'set-rot-it-01' });
  assert.match(r1.secret, /^apx_live_sec_[a-f0-9]{32}$/, 'server-side crypto secret pattern');
  assert.equal(r1.secret.slice(-4), r1.last4);
  assert.equal(await countAudit('SETTINGS_SECRET_ROTATE') - before, 1);

  const listed = (await listSettings(db, admin)).find((s) => s.key === 'security.core_api_secret');
  assert.ok(listed, 'secret row listed');
  assert.equal(listed!.hasSecret, true);
  assert.equal(listed!.last4, r1.last4);
  assert.equal(listed!.value, undefined, 'value never leaves for secrets');
  const rawJson = JSON.stringify(listed);
  assert.ok(!rawJson.includes(r1.secret), 'plaintext absent from list DTO');
  assert.ok(!rawJson.includes('apx_live_sec_'), 'even the prefix stays out of the listed row');

  const replay = await rotateSecret(db, admin, 'security.core_api_secret', { idempotencyKey: 'set-rot-it-01' });
  assert.equal(replay.secret, r1.secret, 'idempotent replay returns the stored envelope (same plaintext once-more)');
  assert.equal(await countAudit('SETTINGS_SECRET_ROTATE') - before, 1, 'replay did not re-audit');

  const r2 = await rotateSecret(db, admin, 'security.core_api_secret');
  assert.notEqual(r2.secret, r1.secret);
  assert.notEqual(r2.last4 === r1.last4 && r2.secret === r1.secret, true);
  const listed2 = (await listSettings(db, admin)).find((s) => s.key === 'security.core_api_secret');
  assert.equal(listed2!.last4, r2.last4, 'latest rotation wins');
  assert.equal(await countAudit('SETTINGS_SECRET_ROTATE') - before, 2, 'second rotation audited');

  const { ctx: decoy } = await gap14Decoy();
  const decoyList = await listSettings(db, decoy);
  assert.ok(!decoyList.some((s) => s.key === 'security.core_api_secret'), 'decoy sees no canon secret');
  const dr = await rotateSecret(db, decoy, 'security.core_api_secret');
  const decoyAgain = (await listSettings(db, decoy)).find((s) => s.key === 'security.core_api_secret');
  assert.equal(decoyAgain!.last4, dr.last4, 'decoy rotates in its own tenant');
  const canonAgain = (await listSettings(db, admin)).find((s) => s.key === 'security.core_api_secret');
  assert.equal(canonAgain!.last4, r2.last4, 'canon secret untouched by decoy rotate');

  await expectDomainError(
    () => putSetting(db, admin, 'security.core_api_secret', { value: 'x', kind: 'secret' }),
    400, 'SECRET_VIA_ROTATE',
  );
});

test('handovers (GAP-22/F27): create happy + idempotent replay + validation, audit HANDOVER_CREATE', async () => {
  const countAudit = async (action: string) => {
    const rows = await db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, action));
    return rows.length;
  };
  assert.equal((await listHandovers(db, admin)).length, 0, 'seed ships zero handover rows');

  const before = await countAudit('HANDOVER_CREATE');
  const payload = {
    shiftFrom: 'Shift A (Day)', shiftTo: 'Shift B (Evening)',
    leadFrom: 'Elena Voronova', leadTo: 'David Chen',
    woRef: 'WO-2026-0894', items: 'Seal replacement in progress', notes: 'Stopwatch transferred',
  };
  const h = await createHandover(db, admin, payload, { idempotencyKey: 'hnd-it-01', requestId: 'it-hnd-1' });
  assert.equal(h.status, 'PENDING');
  assert.equal(h.leadTo, 'David Chen');
  assert.equal(h.woRef, 'WO-2026-0894');
  const replay = await createHandover(db, admin, payload, { idempotencyKey: 'hnd-it-01' });
  assert.equal(replay.id, h.id, 'idempotent replay returns same row');
  assert.equal((await listHandovers(db, admin)).length, 1, 'replay created no duplicate');
  assert.equal(await countAudit('HANDOVER_CREATE') - before, 1, 'create audited exactly once');

  await expectDomainError(
    () => createHandover(db, admin, { ...payload, leadTo: '  ' }),
    400, 'VALIDATION_ERROR',
  );
});

test('handovers (GAP-22/F27): accept → terminal 409 · reject needs reason 400 → REJECTED + audit, tenant guard', async () => {
  const created = await createHandover(db, admin, {
    shiftFrom: 'Shift B', shiftTo: 'Shift C', leadFrom: 'David Chen', leadTo: 'Sarah Al-Mansoor',
    items: 'Cleanroom BMS telemetry nominal',
  });

  await expectDomainError(
    () => decideHandover(db, admin, created.id, { action: 'reject', reason: '' }),
    400, 'REASON_REQUIRED',
  );
  await expectDomainError(
    () => decideHandover(db, admin, created.id, { action: 'reject' }),
    400, 'REASON_REQUIRED',
  );
  const row = (await listHandovers(db, admin)).find((r) => r.id === created.id)!;
  assert.equal(row.status, 'PENDING', 'failed reject leaves row PENDING');

  await expectDomainError(
    () => decideHandover(db, admin, '00000000-0000-0000-0000-000000000000', { action: 'accept' }),
    404, 'HANDOVER_NOT_FOUND',
  );

  const accepted = await decideHandover(db, admin, created.id, { action: 'accept' }, { idempotencyKey: 'hnd-dec-it-1' });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.decidedBy, admin.name);
  assert.ok(accepted.decidedAt, 'decision stamped');
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, 'HANDOVER_ACCEPT'));
  const mine = audits.filter((a) => a.entityId === created.id);
  assert.equal(mine.length, 1, 'HANDOVER_ACCEPT written');
  assert.deepEqual((mine[0]!.before as { status: string }).status, 'PENDING');
  assert.deepEqual((mine[0]!.after as { status: string }).status, 'ACCEPTED');

  const replayDec = await decideHandover(db, admin, created.id, { action: 'accept' }, { idempotencyKey: 'hnd-dec-it-1' });
  assert.equal(replayDec.status, 'ACCEPTED', 'same key replays the stored envelope');
  await expectDomainError(
    () => decideHandover(db, admin, created.id, { action: 'reject', reason: 'late objection' }),
    409, 'HANDOVER_TERMINAL',
  );
  await expectDomainError(
    () => decideHandover(db, admin, created.id, { action: 'accept' }),
    409, 'HANDOVER_TERMINAL',
  );

  const second = await createHandover(db, admin, {
    shiftFrom: 'Shift B', shiftTo: 'Shift C', leadFrom: 'Robert Langdon', leadTo: 'Sarah Al-Mansoor',
    items: 'ELEC-TR-880 bushing kit incomplete',
  });
  const rejected = await decideHandover(db, admin, second.id, { action: 'reject', reason: 'LOTO padlock #4091 key missing from lockbox' });
  assert.equal(rejected.status, 'REJECTED');
  assert.match(rejected.rejectReason ?? '', /#4091/);
  const rejAudits = (await db.select().from(auditEvents).where(eq(auditEvents.action, 'HANDOVER_REJECT')))
    .filter((a) => a.entityId === second.id);
  assert.equal(rejAudits.length, 1, 'HANDOVER_REJECT written');

  const { ctx: decoy } = await gap14Decoy();
  assert.equal((await listHandovers(db, decoy)).length, 0, 'decoy org blind to canon handovers');
  await expectDomainError(
    () => decideHandover(db, decoy, second.id, { action: 'accept' }),
    404, 'HANDOVER_NOT_FOUND',
  );
  await createHandover(db, decoy, {
    shiftFrom: 'X', shiftTo: 'Y', leadFrom: 'Decoy One', leadTo: 'Decoy Two',
  });
  assert.equal((await listHandovers(db, decoy)).length, 1, 'decoy creates in its own org');
  const canonAfter = await listHandovers(db, admin);
  assert.ok(!canonAfter.some((r) => r.leadFrom === 'Decoy One'), 'no decoy bleed into canon list');
});

test('handovers (SDD T1-3): malformed id → 400 VALIDATION_ERROR · unknown uuid → 404 · valid decide flow intact', async () => {
  await expectDomainError(
    () => decideHandover(db, admin, 'not-a-uuid', { action: 'accept' }),
    400, 'VALIDATION_ERROR',
  );
  await expectDomainError(
    () => decideHandover(db, admin, '00000000-0000-4000-8000-000000000000', { action: 'accept' }),
    404, 'HANDOVER_NOT_FOUND',
  );
  const h = await createHandover(db, admin, {
    shiftFrom: 'Shift A (Day)', shiftTo: 'Shift B (Evening)',
    leadFrom: 'Elena Voronova', leadTo: 'David Chen',
    woRef: 'WO-2026-0894', items: 'T1-3 validation probe', notes: 'none',
  }, { idempotencyKey: 'hnd-t13-uuid', requestId: 'it-hnd-t13' });
  const accepted = await decideHandover(db, admin, h.id, { action: 'accept' });
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(accepted.decidedBy, 'Marcus Vance');
  await expectDomainError(
    () => decideHandover(db, admin, h.id, { action: 'reject', reason: 'too late' }),
    409, 'HANDOVER_TERMINAL',
  );
});

test('wo-tasks (SDD T3-2): addWoTask appends step max+1, validates, audits WO_TASK_ADD; sequence gate still applies', async () => {
  const woNo = 'WO-2026-0912';
  await db.insert((await import('../db/schema')).workOrders).values({
    organizationId: admin.orgId, number: woNo, title: 'Generic dossier probe', assetCode: null,
    location: 'Probe Bay', priority: 'P3', status: 'IN_PROGRESS', holdReason: null,
    slaDueAt: new Date(Date.now() + 3600_000), assignedTo: null,
  }).onConflictDoNothing();
  assert.equal((await listWoTasks(db, admin, woNo)).length, 0, 'generic WO ships with an empty checklist');

  const t1 = await addWoTask(db, admin, { woNumber: woNo, title: 'Inspect dock hydraulic lines', requiresPhoto: false });
  assert.equal(t1.stepOrder, 1);
  const t2 = await addWoTask(db, admin, { woNumber: woNo, title: 'Replace worn hose', instruction: 'Torque to spec', requiresPhoto: true });
  assert.equal(t2.stepOrder, 2, 'step order = max(existing)+1');
  assert.equal(t2.status, 'PENDING');

  await expectDomainError(
    () => updateWoTask(db, admin, { taskId: t2.id, woNumber: woNo, status: 'DONE' }),
    422, 'SEQUENCE_VIOLATION',
  );

  await updateWoTask(db, admin, { taskId: t1.id, woNumber: woNo, status: 'DONE' });
  await expectDomainError(
    () => updateWoTask(db, admin, { taskId: t2.id, woNumber: woNo, status: 'DONE' }),
    422, 'PHOTO_REQUIRED',
  );

  await expectDomainError(() => addWoTask(db, admin, { woNumber: woNo, title: 'ab' }), 400, 'VALIDATION_ERROR');
  await expectDomainError(() => addWoTask(db, admin, { woNumber: 'WO-2099-0001', title: 'Ghost step' }), 404, 'WORK_ORDER_NOT_FOUND');

  const ledger = await listAuditEvents(db, admin, { entityType: 'work_order_task' });
  assert.ok(ledger.rows.some((e) => e.action === 'WO_TASK_ADD' && e.entityId === t2.id), 'WO_TASK_ADD audited');

  const reloaded = await listWoTasks(db, admin, woNo);
  assert.equal(reloaded.length, 2, 'added steps persist (reload-proof)');
  assert.equal(reloaded.find((t) => t.id === t2.id)!.status, 'PENDING');
});

test('inspections (SDD T3-3): PASS-OVERRIDE verdict lands in audit as INSPECTION_PASS_OVERRIDE', async () => {
  const probe = await createInspection(db, admin, { title: 'T3-3 override probe', auditorName: 'Marcus Vance' });
  const probeNumber = probe.number;

  const before = (await listAuditEvents(db, admin, { entityType: 'inspection', limit: 500 }))
    .rows.filter((e) => e.action === 'INSPECTION_PASS_OVERRIDE').length;

  const row = await updateInspectionProgress(db, admin, probeNumber, 100, 'COMPLETED', { verdict: 'PASS-OVERRIDE' });
  assert.equal(row.status, 'COMPLETED');

  const rows = (await listAuditEvents(db, admin, { entityType: 'inspection', limit: 500 })).rows;
  const overrideRows = rows.filter((e) => e.action === 'INSPECTION_PASS_OVERRIDE');
  assert.equal(overrideRows.length, before + 1, 'exactly one PASS_OVERRIDE audit row added');
  const latest = overrideRows[overrideRows.length - 1];
  assert.equal((latest.after as { verdict?: string })?.verdict, 'PASS-OVERRIDE');
  assert.match(String((latest.after as { countersign?: string })?.countersign ?? ''), /self-assessed/, 'countersign disclosure honest');

  await updateInspectionProgress(db, admin, probeNumber, 100, 'COMPLETED');
  const after2 = (await listAuditEvents(db, admin, { entityType: 'inspection', limit: 500 }))
    .rows.filter((e) => e.action === 'INSPECTION_PASS_OVERRIDE').length;
  assert.equal(after2, before + 1, 'no extra override row without a verdict');
});

test('pm (SDD T3-5): pause stops generation (422 RULE_PAUSED); resume continues; idempotence per period intact', async () => {
  const rule = await createPmRule(db, admin, {
    title: 'T3-5 pause probe', assetCode: CANON.assetSeal, intervalDays: 7, priority: 'P3',
  });

  const gen1 = await generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: 't35-gen-1' });
  assert.equal(gen1.rule.status, 'ACTIVE', 'active rule generates');
  const replay = await generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: 't35-gen-1' });
  assert.equal(replay.wo.number, gen1.wo.number, 'same idempotency key → same WO (no double generation)');

  await togglePmRule(db, admin, rule.id, 'PAUSED');
  await expectDomainError(
    () => generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: 't35-gen-2' }),
    422, 'RULE_PAUSED',
  );

  await togglePmRule(db, admin, rule.id, 'ACTIVE');
  const gen2 = await generatePmWorkOrder(db, admin, rule.id, { idempotencyKey: 't35-gen-2' });
  assert.notEqual(gen2.wo.number, gen1.wo.number, 'resumed rule generates a NEW work order');
});

test('audit + purchasing (SDD T3-6): paging disjoint & stable; entityType + date filters work; decoy tenant blind', async () => {
  const decoyAdmin: AuthContext = {
    userId: 'decoy-probe-user', orgId: 'APX-GL-9021', orgName: 'Apex Global',
    role: 'Enterprise Admin', name: 'Decoy Probe', initials: 'DP',
    title: 'Probe', email: 'decoy-probe@apexgl.io',
  };
  const page1 = await listAuditEvents(db, admin, { limit: 25, offset: 0 });
  const page2 = await listAuditEvents(db, admin, { limit: 25, offset: 25 });
  assert.equal(page1.rows.length, 25);
  const p1ids = new Set(page1.rows.map((r) => r.id));
  const p2ids = new Set(page2.rows.map((r) => r.id));
  for (const id of p1ids) assert.ok(!p2ids.has(id), 'page 1 and 2 must be disjoint');
  const page1again = await listAuditEvents(db, admin, { limit: 25, offset: 0 });
  assert.deepEqual(page1.rows.map((r) => r.id), page1again.rows.map((r) => r.id), 'same window returns identical rows');

  const taskOnly = await listAuditEvents(db, admin, { entityType: 'work_order_task', limit: 500 });
  assert.ok(taskOnly.rows.length > 0, 'entityType filter finds the T3-2 rows');
  assert.ok(taskOnly.rows.every((r) => r.entityType === 'work_order_task'), 'all rows match the filter');

  const future = await listAuditEvents(db, admin, { from: new Date(Date.now() + 3600_000), limit: 500 });
  assert.equal(future.rows.length, 0, 'from-in-the-future excludes all rows');
  const recent = await listAuditEvents(db, admin, { from: new Date(Date.now() - 60_000), limit: 500 });
  assert.ok(recent.rows.length > 0, 'recent window includes just-written rows');

  const decoyPage = await listAuditEvents(db, decoyAdmin, { limit: 500 });
  const canonIds = new Set((await listAuditEvents(db, admin, { limit: 500 })).rows.map((r) => r.id));
  for (const r of decoyPage.rows) assert.ok(!canonIds.has(r.id), 'no canon row leaks into decoy ledger');
});

test('billing (demo): flag off by default; COMMUNITY stays invalid even in demo', async () => {
  const prevDemo = process.env.BILLING_DEMO_MODE;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.BILLING_DEMO_MODE;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    assert.equal(isBillingDemoMode(), false, 'demo mode must be opt-in');
    await expectDomainError(
      () => createCheckoutSession(db, admin, 'COMMUNITY', 'https://x.test/success'),
      503, 'BILLING_NOT_CONFIGURED',
    );
  } finally {
    if (prevDemo !== undefined) process.env.BILLING_DEMO_MODE = prevDemo;
    if (prevKey !== undefined) process.env.STRIPE_SECRET_KEY = prevKey;
  }
});

test('billing (demo): checkout returns deterministic fixture + TRIALING upsert + audit', async () => {
  const prevDemo = process.env.BILLING_DEMO_MODE;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  process.env.BILLING_DEMO_MODE = 'true';
  delete process.env.STRIPE_SECRET_KEY;
  try {
    assert.equal(isBillingDemoMode(), true);

    const first = await createCheckoutSession(db, admin, 'GROWTH', 'https://x.test/success');
    assert.match(first.sessionId, /^cs_demo_growth_[A-Za-z0-9]{4,16}$/, 'deterministic demo session id');
    assert.ok(first.checkoutUrl.startsWith('https://x.test/success'), 'fixture returns to successUrl');
    assert.ok(first.checkoutUrl.includes(`session_id=${first.sessionId}`), 'session id echoed in URL');

    const second = await createCheckoutSession(db, admin, 'GROWTH', 'https://x.test/success');
    assert.equal(second.sessionId, first.sessionId, 'demo fixture is stable across retries');

    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.organizationId, admin.orgId)).limit(1);
    assert.equal(sub?.plan, 'GROWTH');
    assert.equal(sub?.status, 'TRIALING');

    const audits = await db.select().from(auditEvents)
      .where(and(eq(auditEvents.organizationId, admin.orgId), eq(auditEvents.action, 'BILLING_CHECKOUT_INITIATED')));
    assert.ok(
      audits.some((a) => ((a.after as { sessionId?: string })?.sessionId) === first.sessionId),
      'demo checkout writes an audit row',
    );
  } finally {
    if (prevDemo !== undefined) process.env.BILLING_DEMO_MODE = prevDemo;
    else delete process.env.BILLING_DEMO_MODE;
    if (prevKey !== undefined) process.env.STRIPE_SECRET_KEY = prevKey;
    await db.update(subscriptions).set({ plan: 'ENTERPRISE', status: 'ACTIVE' })
      .where(eq(subscriptions.organizationId, admin.orgId));
  }
});

test('billing (BR-14): org without subscription row defaults to COMMUNITY', async () => {
  await db.delete(subscriptions).where(eq(subscriptions.organizationId, admin.orgId));
  try {
    const sub = await getOrganizationSubscription(db, admin.orgId);
    assert.equal(sub.plan, 'COMMUNITY', 'fail-closed default — never ENTERPRISE');
  } finally {
    await db.insert(subscriptions)
      .values({ organizationId: admin.orgId, plan: 'ENTERPRISE', status: 'ACTIVE' });
  }
});

test('auth (BR-13): MFA dev-hint requires two flags in production', async () => {
  const prevHint = process.env.DEMO_MFA_HINT;
  const prevAllow = process.env.ALLOW_DEMO_HINT_IN_PROD;
  const prevNodeEnv = process.env.NODE_ENV;
  const envRec = process.env as Record<string, string | undefined>;
  const attempt = () => login(db, { email: 'm.vance@apexops.io', password: SEED_PASSWORD, ip: '10.9.9.9' });
  try {
    delete process.env.DEMO_MFA_HINT;
    let r = await attempt();
    assert.equal(r.status, 'mfa_required');
    assert.ok((r as { devHint?: string }).devHint, 'hint present by default outside production');

    process.env.DEMO_MFA_HINT = '0';
    r = await attempt();
    assert.equal((r as { devHint?: string }).devHint, undefined, 'explicit opt-out kills hint');

    envRec.NODE_ENV = 'production';
    process.env.DEMO_MFA_HINT = '1';
    delete process.env.ALLOW_DEMO_HINT_IN_PROD;
    r = await attempt();
    assert.equal((r as { devHint?: string }).devHint, undefined, 'single flag must not leak in production');

    process.env.ALLOW_DEMO_HINT_IN_PROD = '1';
    r = await attempt();
    assert.ok((r as { devHint?: string }).devHint, 'two-flag opt-in restores hint for judge containers');
  } finally {
    if (prevHint !== undefined) process.env.DEMO_MFA_HINT = prevHint;
    else delete process.env.DEMO_MFA_HINT;
    if (prevAllow !== undefined) process.env.ALLOW_DEMO_HINT_IN_PROD = prevAllow;
    else delete process.env.ALLOW_DEMO_HINT_IN_PROD;
    if (prevNodeEnv !== undefined) envRec.NODE_ENV = prevNodeEnv;
    else delete envRec.NODE_ENV;
  }
});
