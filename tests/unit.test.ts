import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base32Decode, base32Encode, totpAt, verifyTotp } from '../lib/auth/totp';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { can, ROLE_PERMISSIONS } from '../lib/auth/rbac';
import { rateLimit } from '../lib/auth/limits';
import {
  SLA_WINDOW_MS, isTerminal, slaLabel, validateTransition,
} from '../lib/domain/work-orders';
import {
  SR_SLA_WINDOW_MS, validateSrTransition,
} from '../lib/domain/service-requests';
import { requestHash } from '../lib/services/idempotency';

test('totp: RFC 6238 test vectors (SHA1, last 6 of the 8-digit RFC values)', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAt(secret, 59), '287082');
  assert.equal(totpAt(secret, 1111111109), '081804');
  assert.equal(totpAt(secret, 1111111111), '050471');
  assert.equal(totpAt(secret, 1234567890), '005924');
  assert.equal(totpAt(secret, 2000000000), '279037');
});

test('totp: verifyTotp accepts ±1 step window, rejects wrong codes', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = Math.floor(Date.now() / 1000);
  assert.ok(verifyTotp(secret, totpAt(secret, now)));
  assert.ok(verifyTotp(secret, totpAt(secret, now - 30)), 'previous step accepted');
  assert.ok(verifyTotp(secret, totpAt(secret, now + 30)), 'next step accepted');
  assert.ok(!verifyTotp(secret, '000000') || totpAt(secret, now) === '000000');
  assert.ok(!verifyTotp(secret, 'abcdef'));
  assert.ok(!verifyTotp(secret, ''));
});

test('totp: base32 round-trip', () => {
  const buf = Buffer.from('apex-ops-canon-4821', 'utf8');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
});

test('password: hash/verify round-trip, rejects wrong password', async () => {
  const hash = await hashPassword('demo-pass-4821');
  assert.match(hash, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
  assert.ok(await verifyPassword('demo-pass-4821', hash));
  assert.ok(!(await verifyPassword('wrong-password', hash)));
  assert.ok(!(await verifyPassword('demo-pass-4821', 'garbage$format')));
});

test('password: distinct salts produce distinct hashes', async () => {
  const a = await hashPassword('same-input');
  const b = await hashPassword('same-input');
  assert.notEqual(a, b);
  assert.ok(await verifyPassword('same-input', b));
});

test('rbac: Enterprise Admin has wildcard', () => {
  assert.ok(can('Enterprise Admin', 'org.manage'));
  assert.ok(can('Enterprise Admin', 'wo.transition'));
  assert.deepEqual(ROLE_PERMISSIONS['Enterprise Admin'], ['*']);
});

test('rbac: field techs can work orders but not org settings', () => {
  assert.ok(can('Senior Field Tech', 'wo.read'));
  assert.ok(can('Senior Field Tech', 'wo.transition'));
  assert.ok(!can('Senior Field Tech', 'org.manage'));
  assert.ok(!can('Senior Field Tech', 'po.approve'));
  assert.ok(!can('Senior Field Tech', 'settings.manage'));
});

test('rbac: unknown role fails closed', () => {
  assert.ok(!can('Ghost Role' as never, 'wo.read'));
});

test('limits: blocks after max hits within window, independent keys', () => {
  const key = `test:${Date.now()}`;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60_000).ok, true);
  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  assert.equal(rateLimit(`${key}:other`, 3, 60_000).ok, true);
});

test('limits: window expiry resets the counter', async () => {
  const key = `test-exp:${Date.now()}`;
  assert.equal(rateLimit(key, 1, 40).ok, true);
  assert.equal(rateLimit(key, 1, 40).ok, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rateLimit(key, 1, 40).ok, true);
});

test('wo: valid transitions per rules', () => {
  assert.deepEqual(validateTransition('OPEN', 'hold', 'x'), { ok: true, to: 'ON_HOLD' });
  assert.deepEqual(validateTransition('IN_PROGRESS', 'hold', 'x'), { ok: true, to: 'ON_HOLD' });
  assert.deepEqual(validateTransition('IN_PROGRESS', 'escalate', 'x'), { ok: true, to: 'ESCALATED' });
  assert.deepEqual(validateTransition('ON_HOLD', 'resume'), { ok: true, to: 'IN_PROGRESS' });
  assert.deepEqual(validateTransition('ESCALATED', 'resume'), { ok: true, to: 'IN_PROGRESS' });
  assert.deepEqual(validateTransition('IN_PROGRESS', 'complete'), { ok: true, to: 'COMPLETED' });
  assert.deepEqual(validateTransition('OPEN', 'cancel', 'x'), { ok: true, to: 'CANCELLED' });
  assert.deepEqual(validateTransition('OPEN', 'assign'), { ok: true, to: null });
});

test('wo: invalid transitions rejected with codes', () => {
  const done = validateTransition('COMPLETED', 'hold', 'x');
  assert.equal(done.ok, false);
  if (!done.ok) assert.equal(done.code, 'WO_INVALID_TRANSITION');

  const noReason = validateTransition('IN_PROGRESS', 'hold');
  assert.equal(noReason.ok, false);
  if (!noReason.ok) assert.equal(noReason.code, 'WO_REASON_REQUIRED');

  const blankReason = validateTransition('IN_PROGRESS', 'hold', '   ');
  assert.equal(blankReason.ok, false);

  const earlyComplete = validateTransition('ON_HOLD', 'complete');
  assert.equal(earlyComplete.ok, false);
  if (!earlyComplete.ok) assert.equal(earlyComplete.code, 'WO_INVALID_TRANSITION');

  const unknown = validateTransition('OPEN', 'teleport' as never);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, 'WO_UNKNOWN_ACTION');
});

test('wo: terminal states', () => {
  assert.ok(isTerminal('COMPLETED'));
  assert.ok(isTerminal('CANCELLED'));
  assert.ok(!isTerminal('ON_HOLD'));
  assert.ok(!isTerminal('OPEN'));
});

test('sla: label shows BREACH for past due, countdown for future, — for none', () => {
  const now = new Date('2026-09-14T12:00:00Z');
  assert.match(slaLabel(new Date(now.getTime() + 42 * 60_000), now), /42m/);
  assert.match(slaLabel(new Date(now.getTime() - 102 * 60_000), now), /BREACH/);
  assert.equal(slaLabel(null, now), '—');
});

test('sla: canon windows P1=4h P2=8h P3=24h', () => {
  assert.equal(SLA_WINDOW_MS.P1, 4 * 3600_000);
  assert.equal(SLA_WINDOW_MS.P2, 8 * 3600_000);
  assert.equal(SLA_WINDOW_MS.P3, 24 * 3600_000);
});

test('idempotency: requestHash is stable, key-order-insensitive, body-sensitive', () => {
  assert.equal(requestHash({ a: 1, b: 'x' }), requestHash({ b: 'x', a: 1 }));
  assert.notEqual(requestHash({ a: 1 }), requestHash({ a: 2 }));
});

test('sr: valid transitions per rules', () => {
  assert.deepEqual(validateSrTransition('OPEN', 'triage'), { ok: true, to: 'TRIAGED' });
  assert.deepEqual(validateSrTransition('BREACHED', 'triage'), { ok: true, to: 'TRIAGED' });
  assert.deepEqual(validateSrTransition('OPEN', 'convert'), { ok: true, to: 'CONVERTED' });
  assert.deepEqual(validateSrTransition('TRIAGED', 'convert'), { ok: true, to: 'CONVERTED' });
  assert.deepEqual(validateSrTransition('BREACHED', 'close', 'duplicate'), { ok: true, to: 'CLOSED' });
});

test('sr: terminal + reason + unknown-action handling', () => {
  const done = validateSrTransition('CONVERTED', 'convert');
  assert.equal(done.ok, false);
  if (!done.ok) assert.equal(done.code, 'SR_INVALID_TRANSITION');

  const closed = validateSrTransition('CLOSED', 'triage');
  assert.equal(closed.ok, false);

  const noReason = validateSrTransition('OPEN', 'close');
  assert.equal(noReason.ok, false);
  if (!noReason.ok) assert.equal(noReason.code, 'SR_REASON_REQUIRED');

  const triagedTriage = validateSrTransition('TRIAGED', 'triage');
  assert.equal(triagedTriage.ok, false);

  const unknown = validateSrTransition('OPEN', 'reopen' as never);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, 'SR_UNKNOWN_ACTION');
});

test('sr: canon triage windows P1=15m P2=45m P3=2h', () => {
  assert.equal(SR_SLA_WINDOW_MS.P1, 15 * 60_000);
  assert.equal(SR_SLA_WINDOW_MS.P2, 45 * 60_000);
  assert.equal(SR_SLA_WINDOW_MS.P3, 2 * 3_600_000);
});

test('rbac: sr.transition for leads/admin, not for field techs', () => {
  assert.ok(can('Enterprise Admin', 'sr.transition'));
  assert.ok(can('Engineering Lead', 'sr.transition'));
  assert.ok(can('Facility Director', 'sr.transition'));
  assert.ok(!can('Senior Field Tech', 'sr.transition'));
  assert.ok(!can('Read-Only Auditor', 'sr.transition'));
});

import { enqueueJob, executeQueueCycle, listJobs, retryJob } from '../lib/queue/worker';

test('queue (GAP-18/F23): empty store lists EMPTY — cold 3-job preseed removed', () => {
  assert.equal(listJobs({ orgId: 'gap18-empty-org' }).length, 0, 'unfiltered empty list');
  assert.equal(listJobs({ orgId: 'gap18-empty-org', topic: 'pm_generator' }).length, 0, 'topic filter on empty store stays empty');
  assert.equal(listJobs({ orgId: 'gap18-empty-org', status: 'COMPLETED' }).length, 0, 'status filter on empty store stays empty');
});

test('queue (GAP-18/F23): enqueue is tenant-scoped; topic/status/limit filters honest', () => {
  const a = enqueueJob('pm_generator', 'gap18-org-a', { ruleId: 'PM-X1' });
  const b = enqueueJob('vendor_notification', 'gap18-org-a', { vendor: 'v' }, 5);
  assert.equal(a.status, 'PENDING');
  assert.equal(a.attempts, 0);
  assert.equal(b.maxAttempts, 5);

  const mine = listJobs({ orgId: 'gap18-org-a' });
  assert.ok(mine.some((r) => r.id === a.id) && mine.some((r) => r.id === b.id), 'own jobs listed');

  assert.ok(!listJobs({ orgId: 'gap18-org-b' }).some((r) => r.id === a.id || r.id === b.id), 'decoy org sees nothing');

  const pms = listJobs({ orgId: 'gap18-org-a', topic: 'pm_generator' });
  assert.ok(pms.length >= 1 && pms.every((r) => r.topic === 'pm_generator'), 'topic filter');
  assert.ok(listJobs({ orgId: 'gap18-org-a', status: 'COMPLETED' }).every((r) => r.status === 'COMPLETED'), 'status filter');
  assert.ok(listJobs({ orgId: 'gap18-org-a', limit: 1 }).length <= 1, 'limit honored');
});

test('queue (GAP-18/F23): run_cycle completes PENDING with honest summary counts', async () => {
  enqueueJob('webhook_fanout', 'gap18-cycle-org', { n: 1 });
  enqueueJob('audit_merkle_batch', 'gap18-cycle-org', { n: 2 });

  const summary = await executeQueueCycle();
  const mine = listJobs({ orgId: 'gap18-cycle-org' });
  assert.equal(mine.length, 2);
  assert.ok(
    mine.every((r) => r.status === 'COMPLETED' && r.attempts === 1 && r.startedAt !== null && r.completedAt !== null),
    'both cycle jobs COMPLETED with attempts/timestamps',
  );
  assert.ok(summary.processed >= 2, 'summary processed covers at least the two enqueued');
  assert.equal(summary.failed, 0, 'no failures expected');
  assert.equal(summary.processed, summary.completed + summary.failed, 'counts consistent');

  const second = await executeQueueCycle();
  assert.equal(second.processed, 0, 'idle cycle processes nothing');
});

test('queue (GAP-18/F23): retry resets a DLQ job; unknown jobId → null (route maps 404)', () => {
  const job = enqueueJob('vendor_notification', 'gap18-retry-org', { v: 1 });
  job.status = 'FAILED_DLQ';
  job.error = 'synthetic failure';
  job.attempts = 3;

  const retried = retryJob(job.id);
  assert.ok(retried, 'known job retried');
  assert.equal(retried!.status, 'PENDING');
  assert.equal(retried!.attempts, 0);
  assert.equal(retried!.error, null);
  assert.equal(retried!.startedAt, null);
  assert.equal(retried!.completedAt, null);

  assert.equal(retryJob('job_does_not_exist'), null, 'unknown id → null (route converts to 404 JOB_NOT_FOUND)');
});
