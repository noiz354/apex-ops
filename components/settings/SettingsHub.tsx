'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Database, Download, Eye, EyeOff, KeyRound, Lock, Mail, Radio, RefreshCw, Ruler, ShieldCheck, Trash2, Webhook, Wrench, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/download';
import { ApiError, apiFetch } from '@/lib/api/client';

const TABS = ['General Configuration', 'Data & Seed Controls', 'Integrations & Webhooks', 'Localization & Units', 'Security & Auth Keys'] as const;

interface Seq { ent: string; prefix: string; mask: string; width: number; pad: string; idx: string; prev: (i: string) => string; note?: string }

const SEQS: Seq[] = [
  { ent: 'Work Orders (Core Dispatch)', prefix: 'WO-', mask: '[YYYY]-', width: 4, pad: '4 digits (0000)', idx: '0894', prev: (i) => `WO-2026-${i}` },
  { ent: 'Service Requests (Helpdesk)', prefix: 'SR-', mask: '[YYYY]-', width: 4, pad: '4 digits (0000)', idx: '0142', prev: (i) => `SR-2026-${i}`, note: 'Rewired 5-digit → 4-digit (global ID format table)' },
  { ent: 'Purchase Orders (Procurement)', prefix: 'PO-', mask: '[YYYY]-', width: 4, pad: '4 digits (0000)', idx: '0298', prev: (i) => `PO-2026-${i}` },
  { ent: 'Asset Identifier (Registry)', prefix: 'AST-', mask: '[HVAC|ELEC|FIRE]-', width: 3, pad: '3 digits (000)', idx: '004', prev: (i) => `AST-HVAC-${i}` },
  { ent: 'Field Inspection Reports', prefix: 'INS-', mask: '[YYYY]-', width: 4, pad: '4 digits (0000)', idx: '1092', prev: (i) => `INS-2026-${i}`, note: 'Rewired to INS format (global ID format table)' },
];

interface Snap { ts: string; mode: string; vol: string; sum: string; ret: string; live?: boolean }

const SNAPS: Snap[] = [
  { ts: '2026-05-24 02:00:14 UTC', mode: 'Full Scheduled Snapshot', vol: '842.6 MB', sum: 'Verified', ret: '30-day Lock • Glacier Deep (planned — no backup job)' },
  { ts: '2026-05-23 02:00:11 UTC', mode: 'Full Scheduled Snapshot', vol: '839.1 MB', sum: 'Verified', ret: '30-day Lock • S3 Standard' },
  { ts: '2026-05-22 18:45:00 UTC', mode: 'Ad-hoc Pre-deployment Snapshot', vol: '834.0 MB', sum: 'Verified', ret: 'Manual Flag • S3 Standard' },
];

interface Hook { url: string; name: string; topics: string; auth: string; health: string; lat: string }

const HOOKS: Hook[] = [
  { url: 'https://hooks.slack.com/services/T04/B08/x91...', name: 'Slack #ops-critical-dispatch', topics: 'wo.critical_sla · alert.p1', auth: 'HMAC-SHA256 Sig', health: '— (never probed)', lat: '—' },
  { url: 'https://api.incident.io/v1/escalations', name: 'Incident.io Major Incident Trigger', topics: 'asset.tier1_failure', auth: 'Bearer Token', health: '— (never probed)', lat: '—' },
  { url: 'https://pagerduty.com/integrations/v2/enqueue', name: 'PagerDuty Facilities On-Call Routing', topics: 'scada.refrigerant_leak', auth: 'Routing Key Header', health: '— (never probed)', lat: '—' },
];

interface SettingEntry {
  key: string;
  kind: 'value' | 'secret';
  value: unknown;
  last4: string | null;
  hasSecret: boolean;
  updatedAt: string;
  updatedBy: string;
}

const SETTINGS_API = '/api/settings';
const SKEY = {
  profile: 'general.profile',
  broker: 'integrations.broker',
  hooks: 'integrations.webhooks',
  maint: 'ops.maint_mode',
  snap: 'ops.backup_last_snapshot',
  restore: 'ops.backup_last_restore',
  coreSecret: 'security.core_api_secret',
  issued: 'security.issued_keys',
} as const;

const encodeKey = (k: string) => `${SETTINGS_API}/${encodeURIComponent(k)}`;

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1500;

const download = (filename: string, text: string, type = 'application/json') => downloadText(filename, text, type);

const genKey = () => `apx_live_sec_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('')}`;

const utcDay = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
};

export function SettingsHub() {
  const [tab, setTab] = useState<string>(TABS[0]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [maint, setMaint] = useState(true);
  const [tx, setTx] = useState(904128);
  const [expOpen, setExpOpen] = useState(false);
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const [company, setCompany] = useState('Apex Facility Management Global Pte Ltd');
  const [brand, setBrand] = useState('Apex Ops - Nusantara East Campus');
  const [ccy, setCcy] = useState('USD ($) - US Dollar');
  const [tz, setTz] = useState('UTC+07:00 (Asia/Jakarta - WIB / East Asia)');
  const [fiscal, setFiscal] = useState('January - December (Calendar Year)');
  const [week, setWeek] = useState('Monday - Saturday | 07:00 - 22:00 (Two 8h Rotations)');
  const [reindexed, setReindexed] = useState('14 Sep 2026 06:00 WIB');
  const [, setBuffer] = useState(12);
  const [locked, setLocked] = useState(false);
  const [idx, setIdx] = useState<Record<string, string>>({ WO: '0894', SR: '0142', PO: '0298', AST: '004', INS: '1092' });
  const [cfg, setCfg] = useState<Seq | null>(null);
  const [cfgVal, setCfgVal] = useState('');
  const [cfgTouched, setCfgTouched] = useState(false);
  const [batches, setBatches] = useState(0);
  const [snaps, setSnaps] = useState<Snap[]>(SNAPS);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restored, setRestored] = useState('');
  const [broker, setBroker] = useState<string | null>(null);
  const [epOpen, setEpOpen] = useState(false);
  const [epVal, setEpVal] = useState('');
  const [epTouched, setEpTouched] = useState(false);
  const [connTest, setConnTest] = useState('');
  const [, setErpSync] = useState('4 mins ago');
  const [hooks, setHooks] = useState<Hook[]>(HOOKS);
  const [hkOpen, setHkOpen] = useState(false);
  const [hk, setHk] = useState({ url: '', topics: '', auth: 'HMAC-SHA256 Sig' });
  const [hkTouched, setHkTouched] = useState(false);
  const [editHook, setEditHook] = useState<number | null>(null);
  const [editTopics, setEditTopics] = useState('');
  const [thermal, setThermal] = useState('Celsius (°C) [ASHRAE Standard]');
  const [pressure, setPressure] = useState('Bar / Pascal (bar, kPa)');
  const [power, setPower] = useState('Kilowatts / Megawatt-hours (kW / MWh)');
  const [key, setKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueName, setIssueName] = useState('');
  const [issueTouched, setIssueTouched] = useState(false);
  const [extraKeys, setExtraKeys] = useState<{ name: string; last4: string }[]>([]);
  const [shownOnce, setShownOnce] = useState('');
  const [settingsRows, setSettingsRows] = useState<SettingEntry[]>([]);
  const [setLive, setSetLive] = useState<boolean | null>(null);
  const [setBusy, setSetBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const errMsg = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing persisted.');

  const applyEntries = (rows: SettingEntry[]) => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const prof = byKey.get(SKEY.profile);
    if (prof && typeof prof.value === 'object' && prof.value !== null) {
      const p = prof.value as Partial<Record<'company' | 'brand' | 'ccy' | 'tz' | 'fiscal' | 'week', string>>;
      if (p.company) setCompany(p.company);
      if (p.brand) setBrand(p.brand);
      if (p.ccy) setCcy(p.ccy);
      if (p.tz) setTz(p.tz);
      if (p.fiscal) setFiscal(p.fiscal);
      if (p.week) setWeek(p.week);
    }
    const br = byKey.get(SKEY.broker);
    if (br && typeof br.value === 'string') setBroker(br.value || null);
    const hk = byKey.get(SKEY.hooks);
    if (hk && Array.isArray(hk.value)) {
      setHooks((hk.value as Hook[]).map((h) => ({ ...h, health: h.health ?? '— (never probed)', lat: h.lat ?? '—' })));
    }
    const mt = byKey.get(SKEY.maint);
    if (mt && typeof mt.value === 'boolean') setMaint(mt.value);
    const core = byKey.get(SKEY.coreSecret);
    setKey(core ? null : null);
    const issued = byKey.get(SKEY.issued);
    if (issued && Array.isArray(issued.value)) {
      setExtraKeys(issued.value as { name: string; last4: string }[]);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await apiFetch<{ entries: SettingEntry[] }>(SETTINGS_API);
      setSettingsRows(res.entries);
      applyEntries(res.entries);
      setSetLive(true);
    } catch {
      setSetLive(false);
      setKey(genKey());
    }
  };

  useEffect(() => { void loadSettings(); }, []);

  const coreSecretRow = settingsRows.find((r) => r.key === SKEY.coreSecret);

  const putKey = async (key: string, value: unknown): Promise<SettingEntry | null> => {
    try {
      const row = await apiFetch<SettingEntry>(encodeKey(key), { method: 'PUT', body: JSON.stringify({ value }) });
      setSettingsRows((rows) => [row, ...rows.filter((x) => x.key !== row.key)]);
      setLastSavedAt(new Date().toISOString());
      return row;
    } catch (e) {
      push(false, `Settings write failed — ${key}`, errMsg(e));
      return null;
    }
  };

  const save = async () => {
    if (setLive) {
      setSetBusy(true);
      try {
        const row = await apiFetch<SettingEntry>(encodeKey(SKEY.profile), {
          method: 'PUT',
          body: JSON.stringify({ value: { company, brand, ccy, tz, fiscal, week } }),
        });
        setSettingsRows((rows) => [row, ...rows.filter((x) => x.key !== row.key)]);
        setLastSavedAt(row.updatedAt);
        push(true, 'Parameters persisted — server', `general.profile saved to settings_kv · updated by ${row.updatedBy}.`);
      } catch (e) {
        push(false, 'Save failed', errMsg(e));
      } finally {
        setSetBusy(false);
      }
      return;
    }
    const n = tx + 1;
    setTx(n);
    push(true, 'Parameters staged (local)', `TX-${n} · local state only — not persisted.`);
  };

  const saveBrokerEndpoint = async () => {
    setEpTouched(true);
    const v = epVal.trim();
    if (!/^mqtt:\/\/.+:\d+$/.test(v)) return;
    setEpOpen(false);
    setEpTouched(false);
    setBroker(v);
    if (setLive) {
      const row = await putKey(SKEY.broker, v);
      if (row) push(true, 'Endpoint persisted — server', `${v} · saved to settings_kv. Ingest is NOT rerouted (no live broker).`);
      return;
    }
    push(true, 'Endpoints saved (local)', `${v} · ingest NOT rerouted (no live broker) · not persisted.`);
  };

  const exportBundle = () => {
    const bundle = {
      tenant: CANON.tenant, company, brand, currency: ccy, timezone: tz, fiscal_year: fiscal, work_week: week,
      units: { thermal, pressure, power }, sequences: idx, webhooks: hooks.length, mtls: 'enforced', exported_at: utcDay(),
    };
    if (format === 'json') {
      download('apex-settings-bundle.json', JSON.stringify(bundle, null, 2));
    } else {
      const yaml = Object.entries(bundle).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
      download('apex-settings-bundle.yaml', yaml, 'text/yaml');
    }
    setExpOpen(false);
    push(true, 'Bundle exported', `apex-settings-bundle.${format} · 9 sections · secrets excluded.`);
  };

  const saveCfg = () => {
    setCfgTouched(true);
    if (!cfg || !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim())) return;
    const k = cfg.ent.startsWith('Work') ? 'WO' : cfg.ent.startsWith('Service') ? 'SR' : cfg.ent.startsWith('Purchase') ? 'PO' : cfg.ent.startsWith('Asset') ? 'AST' : 'INS';
    setIdx((x) => ({ ...x, [k]: cfgVal.trim() }));
    setCfg(null);
    setCfgTouched(false);
    push(true, 'Sequence updated', `${cfg.ent} → ${cfg.prev(cfgVal.trim())}.`);
  };

  const snapshot = async () => {
    const ts = utcDay();
    setSnaps((s) => [{ ts, mode: 'Ad-hoc Snapshot (this session — metadata only)', vol: '0 rows', sum: 'simulated', ret: 'Metadata record — no backup exists', live: true }, ...s]);
    if (setLive) {
      const row = await putKey(SKEY.snap, { ts, mode: 'simulated', rowsTouched: 0, note: 'Ad-hoc snapshot is simulated — no backup pipeline exists.' });
      if (row) push(true, 'Snapshot metadata persisted', 'simulated · 0 rows touched · recorded in settings_kv (not a database backup).');
      return;
    }
    push(true, 'Snapshot simulated (local)', 'simulated · 0 rows touched · local state only — not persisted.');
  };

  const restoreSim = (ts: string) => {
    setRestoring(ts);
    setRestored('');
    setTimeout(async () => {
      setRestoring(null);
      setRestored(ts);
      if (setLive) {
        const row = await putKey(SKEY.restore, { fromTs: ts, mode: 'simulated', rowsTouched: 0, restoredAt: new Date().toISOString() });
        if (row) push(true, 'Restore simulated', `${ts} · simulated · 0 rows touched · metadata persisted (settings_kv).`);
        return;
      }
      push(true, 'Restore simulated', `${ts} · simulated · 0 rows touched · no-op verified (local — not persisted).`);
    }, 1500);
  };

  const tarball = (s: Snap) => {
    download(`snapshot-${s.ts.slice(0, 10)}-manifest.json`, JSON.stringify({ snapshot: s.ts, mode: s.mode, volume: s.vol, checksum: s.sum, retention: s.ret, simulated: true, note: 'Demo manifest — no vault or backup data exists (planned).' }, null, 2));
    push(true, 'Manifest downloaded (demo)', `${s.vol} · demo manifest — no vault exists (planned).`);
  };

  const testConn = () => {
    setConnTest('probing…');
    setTimeout(() => {
      setConnTest('not connected (local demo) · 0 msgs/min — broker never probed');
      push(true, 'SCADA link not connected', `${broker ?? 'no broker configured (local demo)'} · no SCADA link exists.`);
    }, 1200);
  };

  const registerHook = async () => {
    setHkTouched(true);
    if (!/^https:\/\/.+\..+/.test(hk.url.trim()) || !hk.topics.trim()) return;
    const row: Hook = { url: hk.url.trim(), name: 'Custom dispatcher', topics: hk.topics.trim(), auth: hk.auth, health: '— (never probed)', lat: '—' };
    const next = [...hooks, row];
    setHooks(next);
    setHkOpen(false);
    setHk({ url: '', topics: '', auth: 'HMAC-SHA256 Sig' });
    setHkTouched(false);
    if (setLive) {
      const saved = await putKey(SKEY.hooks, next.map((h) => ({ url: h.url, name: h.name, topics: h.topics, auth: h.auth })));
      if (saved) push(true, 'Webhook persisted — server', `${row.url} · registry saved (settings_kv) · handshake never performed (no delivery).`);
      return;
    }
    push(true, 'Webhook staged (local)', `${row.url} · handshake not performed (no webhook delivery) · not persisted.`);
  };

  const saveHookEdit = async () => {
    if (editHook === null || !editTopics.trim()) return;
    const next = hooks.map((x, i) => (i === editHook ? { ...x, topics: editTopics.trim() } : x));
    setHooks(next);
    setEditHook(null);
    if (setLive) {
      const saved = await putKey(SKEY.hooks, next.map((h) => ({ url: h.url, name: h.name, topics: h.topics, auth: h.auth })));
      if (saved) push(true, 'Webhook updated — server', 'Subscribed topics persisted (settings_kv) · no delivery performed.');
      return;
    }
    push(true, 'Webhook updated (local)', 'Subscribed topics staged · not persisted.');
  };

  const reveal = () => {
    if (shownOnce) {
      setRevealed(true);
      push(true, 'Plaintext shown', 'This is the in-session rotate/demo value · server stores only a hash.');
    } else {
      setRevealed(false);
      push(false, 'Nothing to reveal', 'Hash-only on server — rotate to see a new plaintext exactly once.');
    }
  };

  const rotate = async () => {
    if (setLive) {
      setSetBusy(true);
      try {
        const res = await apiFetch<{ key: string; last4: string; secret: string; updatedAt: string }>(
          `${encodeKey(SKEY.coreSecret)}/rotate`, { method: 'POST', body: JSON.stringify({}) },
        );
        setSettingsRows((rows) => [toSecretEntry(res), ...rows.filter((x) => x.key !== res.key)]);
        setShownOnce(res.secret);
        setRevealed(true);
        push(true, 'Key rotated — server', `Hash stored · last4 ${res.last4} · plaintext shown once, then never retrievable.`);
      } catch (e) {
        push(false, 'Rotate failed', errMsg(e));
      } finally {
        setSetBusy(false);
      }
      return;
    }
    const nk = genKey();
    setKey(nk);
    setRevealed(true);
    setShownOnce(nk);
    push(true, 'Key rotated (local)', `local demo key — not stored server-side · last4 ${nk.slice(-4)}.`);
  };

  const toSecretEntry = (res: { key: string; last4: string; updatedAt: string }): SettingEntry => ({
    key: res.key, kind: 'secret', value: undefined, last4: res.last4, hasSecret: true, updatedAt: res.updatedAt, updatedBy: 'you',
  });

  const issue = async () => {
    setIssueTouched(true);
    if (!issueName.trim()) return;
    const name = issueName.trim();
    if (setLive) {
      setSetBusy(true);
      try {
        const scopedKey = `security.issued.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
        const res = await apiFetch<{ key: string; last4: string; secret: string; updatedAt: string }>(
          `${encodeKey(scopedKey)}/rotate`, { method: 'POST', body: JSON.stringify({}) },
        );
        const next = [...extraKeys.filter((k) => k.name !== name), { name, last4: res.last4 }];
        await putKey(SKEY.issued, next);
        setExtraKeys(next);
        setIssueOpen(false);
        setIssueName('');
        setIssueTouched(false);
        setShownOnce(res.secret);
        push(true, 'Credential issued — server', `last4 ${res.last4} · hash-only stored · plaintext shown once.`);
      } catch (e) {
        push(false, 'Issue failed', errMsg(e));
      } finally {
        setSetBusy(false);
      }
      return;
    }
    const nk = genKey();
    setExtraKeys((k) => [...k, { name, last4: nk.slice(-4) }]);
    setIssueOpen(false);
    setIssueName('');
    setIssueTouched(false);
    setShownOnce(nk);
    push(true, 'Credential issued (local)', `local demo key — not stored server-side · copy now — shown once.`);
  };

  const masked = key ? `apx_live_sec_••••${key.slice(-4)}` : 'apx_live_sec_••••····';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Settings &amp; System Config</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="set-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">ENGINE v4.18-p3 • demo workspace settings (KV-backed when live)</p>
            <h1 id="set-h" className="text-2xl font-semibold tracking-tight">Settings &amp; System Configuration</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            {setLive === null ? (
              <Badge variant="hold">KV: connecting…</Badge>
            ) : setLive ? (
              <Badge variant="pass">KV: live · server-fed</Badge>
            ) : (
              <Badge variant="hold">KV: demo offline — local state</Badge>
            )}
            <Badge variant={maint ? 'warn' : 'pass'}>{maint ? 'Maint Mode: ARMED' : 'Maint Mode: DISARMED'}{setLive ? ' · metadata' : ' · local only'}</Badge>
            <ConfirmDialog title={maint ? 'Disarm maintenance mode?' : 'Arm maintenance mode?'} description={setLive ? 'Flag is stored server-side as metadata (ops.maint_mode) — enforcement is NOT wired (planned).' : 'Local demo flag only — not enforced server-side.'} confirmLabel={maint ? 'Disarm' : 'Arm'} onConfirm={async () => {
              const next = !maint;
              setMaint(next);
              if (setLive) {
                const row = await putKey(SKEY.maint, next);
                if (row) push(true, next ? 'Maint mode armed — server' : 'Maint mode disarmed — server', `ops.maint_mode=${next} persisted (metadata; enforcement planned).`);
                return;
              }
              push(true, next ? 'Maint mode armed' : 'Maint mode disarmed', 'local only — not enforced server-side.');
            }}>
              <Button variant="secondary"><Wrench size={16} /> {maint ? 'Disarm' : 'Arm'}</Button>
            </ConfirmDialog>
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><Download size={16} /> Export Bundle (JSON/YAML)</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="exp-h">
                <DialogTitle id="exp-h">Export Settings Bundle</DialogTitle>
                <DialogDescription>9 sections · secrets are always excluded.</DialogDescription>
                <div className="flex gap-2" role="radiogroup" aria-label="Bundle format">
                  {(['json', 'yaml'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)} aria-pressed={format === f} className={cn('h-9 px-4 rounded text-[13px] font-bold border uppercase', format === f ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setExpOpen(false)}>Cancel</Button>
                  <Button onClick={exportBundle}>Download</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => void save()} disabled={setBusy}><CheckCircle2 size={16} /> {setBusy ? 'Saving…' : 'Save System Parameters'}</Button>
          </div>
        </div>
        <p className="text-xs text-muted -mt-2">
          {setLive
            ? <>Server-backed KV via /api/settings{lastSavedAt ? ` · last write ${lastSavedAt.replace('T', ' ').slice(0, 16)} UTC` : ''}</>
            : <>Parameters are local demo state — not persisted · TX-{tx} (local)</>}
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={cn('h-9 px-4 rounded text-[13px] font-semibold border flex items-center gap-2', tab === t ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
              {t === 'Security & Auth Keys' && <Lock size={14} />} {t}{t === 'Security & Auth Keys' ? ' · mTLS planned' : ''}{t === 'Data & Seed Controls' ? ' · Phase 3' : ''}
            </button>
          ))}
        </div>

        {tab === 'General Configuration' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Enterprise Organization &amp; Localization Profile</h2>
                <span className="apex-id text-xs">TENANT-ID: <strong>{CANON.tenant}</strong> <span className="text-muted">(C6 — tenant fixed)</span></span>
              </div>
              <p className="text-xs text-muted -mt-2">Configures organizational naming conventions, operational timeframes, legal jurisdiction scope, and standard accounting windows.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="co">Company Legal Entity Name</label>
                  <Input id="co" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="br">Operational Facility Brand</label>
                  <Input id="br" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="ccy">Default Operating Currency · FX: manual (no Fixer.io integration)</label>
                  <select id="ccy" value={ccy} onChange={(e) => setCcy(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['USD ($) - US Dollar', 'EUR (€) - Eurozone', 'SGD (S$) - Singapore Dollar', 'IDR (Rp) - Indonesian Rupiah', 'GBP (£) - British Pound'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <span className="text-[11px] text-muted">Exchange sync: off (no FX integration)</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="tz">Primary Operational Timezone</label>
                  <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['UTC+07:00 (Asia/Jakarta - WIB / East Asia)', 'UTC+00:00 (UTC / Western Europe)', 'UTC-05:00 (America/New_York - EST)', 'UTC+08:00 (Asia/Singapore - SGT)'].map((z) => <option key={z}>{z}</option>)}
                  </select>
                  <span className="text-[11px] text-muted">Telemetry timestamps normalized to UTC at ingest</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="fy">Fiscal Year Cycle</label>
                  <select id="fy" value={fiscal} onChange={(e) => setFiscal(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['January - December (Calendar Year)', 'April - March (Standard UK/APAC Commonwealth)', 'October - September (US Federal / State)'].map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="wk">Default Work Week &amp; Operating Hours</label>
                  <Input id="wk" value={week} onChange={(e) => setWeek(e.target.value)} />
                  <span className="text-[11px] text-muted">Site operating hours — not the shift definition (C16) · All shifts automatically bound to Shift Roster Calendar Engine</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => { setReindexed('14 Sep 2026 14:05 WIB'); push(true, 'Facilities re-index staged (local)', '34 buildings · 1,420 rooms · local simulation — GIS + roster untouched.'); }}>
                  <RefreshCw size={15} /> Re-index Facilities
                </Button>
                <span className="text-xs text-muted">Last re-index {reindexed}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Dispatcher Telemetry Engine (local demo)</h2>
                <Badge variant="warn">OFFLINE</Badge>
              </div>
              <p className="text-xs text-muted -mt-1">Local demo thresholds (no live routing engine): message routing, worker pool concurrency, and SLA escalation triggers.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Priority 1 (P1) SLA Breach Escalation</p><p className="font-bold">15 MIN THRESHOLD</p><p className="text-xs text-muted">Direct notification escalation to On-Call Plant Engineering Lead</p></div>
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Concurrent Work Dispatch Throttle</p><p className="font-bold">64 WORKERS / ZONE</p><p className="text-xs text-muted">Auto-rebalance workload across Nusantara East and Central hubs</p></div>
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">SCADA Ingestion Backpressure Buffer</p><p className="font-bold">NO BUFFER (local demo)</p><p className="text-xs text-muted">No live ingest — nothing buffered</p></div>
              </div>
              <div>
                <Button variant="secondary" onClick={() => { setBuffer(2); push(true, 'Flush skipped (local)', 'local demo — no ingest buffer exists.'); }}>
                  <Database size={15} /> Flush Ingest Buffer
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Ticket &amp; Document Numbering Sequences</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setLocked((l) => !l); push(true, locked ? 'Policy unlocked' : 'Policy locked', locked ? 'Counters editable by admins.' : 'Sequences frozen · Configure + Reset disabled.'); }}>
                    <Lock size={15} /> {locked ? 'Unlock Sequence Policy' : 'Lock Sequence Policy'}
                  </Button>
                  <ConfirmDialog title="Reset all counters?" description="Restores seeded indexes (WO 0894 · SR 0142 · PO 0298 · AST 004 · INS 1092). Issued documents are never renumbered." confirmLabel="Reset Counters" onConfirm={() => { setIdx({ WO: '0894', SR: '0142', PO: '0298', AST: '004', INS: '1092' }); push(true, 'Counters reset', 'Seed indexes restored · ledger untouched.'); }}>
                    <Button variant="secondary" disabled={locked}>Reset Counters</Button>
                  </ConfirmDialog>
                </div>
              </div>
              <p className="text-xs text-muted -mt-1">Configure uniform global document formatting tokens across dispatches, requisitions, and plant hardware tracking.</p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[760px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Document Entity</th><th className="font-semibold">Prefix Pattern</th><th className="font-semibold">Date Mask</th><th className="font-semibold">Padding</th><th className="font-semibold">Current Index</th><th className="font-semibold">Realtime Generated Preview</th><th className="font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEQS.map((s) => {
                      const k = s.ent.startsWith('Work') ? 'WO' : s.ent.startsWith('Service') ? 'SR' : s.ent.startsWith('Purchase') ? 'PO' : s.ent.startsWith('Asset') ? 'AST' : 'INS';
                      return (
                        <tr key={s.ent} className="border-b border-surface-subtle">
                          <td className="p-2"><p className="font-medium">{s.ent}</p>{s.note && <p className="text-[10px] text-muted">{s.note}</p>}</td>
                          <td className="apex-id">{s.prefix}</td>
                          <td className="apex-id">{s.mask}</td>
                          <td className="apex-id">{s.pad}</td>
                          <td className="apex-id font-bold">{idx[k]}</td>
                          <td className="apex-id font-bold text-cobalt">{s.prev(idx[k])}</td>
                          <td><Button variant="secondary" disabled={locked} onClick={() => { setCfg(s); setCfgVal(idx[k]); setCfgTouched(false); }}>Configure</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'Data & Seed Controls' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Database Lifecycle &amp; Demo Seed Engine</h2>
                <Badge variant="info">Demo Seed: ACTIVE (Phase 3 Loaded)</Badge>
              </div>
              <p className="text-xs text-muted -mt-1">Provision deterministic demo test suites, simulate plant operations, or flush staging tables prior to ISO compliance auditing.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[13px]">
                {[
                  ['Provisioned Users', '148', ''],
                  ['Roles & Leads', '6 Roles • 12 Shift Leads', 'C15 — 8 fixed'],
                  ['Active Plant Assets', '412', '98.4% Telemetry Active'],
                  ['Inventory SKUs', '1,840', '4 Primary Warehouses'],
                ].map(([l, v, s]) => (
                  <div key={l} className="rounded border border-border-subtle bg-card p-2">
                    <p className="apex-label-caps text-muted">{l}</p>
                    <p className="text-lg font-bold tabular-nums">{v}</p>
                    {s && <p className="text-[11px] text-muted">{s}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[13px]">Work Order History: <strong>4,892</strong> <span className="text-muted">· 18-Month Time Series</span></p>
              <div className="flex flex-wrap gap-2">
                <ConfirmDialog title="Staging demo — reload is not performed" description="No baseline reload runs in this build; numbers below are static copy." confirmLabel="Understood" onConfirm={() => push(true, 'Baseline reload skipped (local)', 'local demo — no seed reload performed.')}>
                  <Button variant="secondary"><RefreshCw size={15} /> Reload Clean Baseline Seed (demo)</Button>
                </ConfirmDialog>
                <ConfirmDialog title="Staging demo — purge is not performed" description="No purge actually runs in this build." confirmLabel="Understood" onConfirm={() => push(true, 'Purge skipped (local)', 'local demo — 0 rows purged · nothing scheduled.')}>
                  <Button variant="secondary"><Trash2 size={15} /> Purge Test Transactions (&gt;30 Days) (demo)</Button>
                </ConfirmDialog>
                <Button variant="secondary" onClick={() => { setBatches((b) => b + 1); push(true, 'Telemetry generation skipped (local)', `local demo — no synthetic batch #${batches + 1} queued (no telemetry writer).`); }}>
                  <Radio size={15} /> Generate Synthetic Sensor Telemetry (1hr Batch) (demo)
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Automated Database Backup &amp; Point-in-Time Restore</h2>
                <div className="flex flex-wrap gap-2">
                  <Link href="/settings/jobs">
                    <Button variant="secondary"><Clock size={15} /> View Job &amp; Snapshot History</Button>
                  </Link>
                  <Button onClick={snapshot}><Database size={15} /> Create Ad-hoc Snapshot Now</Button>
                </div>
              </div>
              <p className="text-xs text-muted -mt-1">Planned design (no backup job running): hourly differential write-ahead-logs and encrypted cold storage images would target SOC2 Type II standard.</p>
              <p className="text-[13px]">Backup Schedule Status: <strong>Not running · (planned: Hourly Diff + Daily Full)</strong></p>
              <p className="text-[13px]">Storage S3 Vault: <span className="apex-id">s3://apex-backup-us-east-prod-wal/</span> <span className="text-muted">(planned — no vault exists)</span></p>
              <p className="text-[13px]">Latest Verified Snapshot: <strong>none (demo schedule below)</strong></p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[820px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Snapshot Timestamp</th><th className="font-semibold">Backup Mode</th><th className="font-semibold">Compressed Volume</th><th className="font-semibold">Checksum Verification</th><th className="font-semibold">Retention Status</th><th className="font-semibold">Recovery Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snaps.map((s) => (
                      <tr key={s.ts} className="border-b border-surface-subtle">
                        <td className="p-2 apex-id">{s.ts} {s.live && <Badge variant="info">NEW</Badge>}</td>
                        <td>{s.mode}</td>
                        <td className="apex-id">{s.vol}</td>
                        <td>{s.sum === 'simulated' ? <Badge variant="hold">SIMULATED</Badge> : s.sum === 'Verified' ? <><Badge variant="pass">demo row</Badge></> : <Badge variant="warn">Sealing…</Badge>}</td>
                        <td className="text-xs">{s.ret}{s.ret.includes('S3') && !s.ret.includes('planned') ? ' (planned — no vault)' : ''}</td>
                        <td>
                          <div className="flex gap-2">
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => tarball(s)}>Download TAR.GZ</button>
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" disabled={restoring === s.ts} onClick={() => restoreSim(s.ts)}>
                              {restoring === s.ts ? 'Simulating…' : 'Trigger Restore Simulation'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {restored && <p className="text-[13px] font-semibold text-pass" role="status">Restore simulation OK · {restored} · RTO 11 min · 0 rows touched.</p>}
            </div>
          </div>
        )}

        {tab === 'Integrations & Webhooks' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Radio size={15} /> SCADA / IoT Gateway</h3>
                <p className="text-xs text-muted">Telemetry ingest pipeline for chiller, pump, and electrical vibration sensor arrays.</p>
                <p>Broker Address: <strong className="apex-id">{broker ?? 'not configured'}</strong>{setLive && <span className="text-xs text-muted"> (settings_kv)</span>}</p>
                <p>Supported Protocols: <strong>MQTT / BACnet IP / OPC-UA</strong></p>
                <p>Active Ingest Rate: <strong>Not connected (no live ingest)</strong></p>
                <p>Monitored Fields: <strong>Vibration, Temp, Ultrasonic Gas</strong></p>
                {connTest && <p className="font-semibold text-pass" role="status">Probe: {connTest}</p>}
                <div className="flex gap-2 mt-1">
                  <Button variant="secondary" onClick={() => { setEpVal(broker ?? ''); setEpOpen(true); setEpTouched(false); }}>Configure Endpoints</Button>
                  <Button variant="secondary" onClick={testConn}>Test Connection</Button>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Mail size={15} /> Enterprise Email Gateway</h3>
                  <Badge variant="pass">Operational</Badge>
                </div>
                <p className="text-xs text-muted">Transactional email relay for technician dispatch alerts and compliance notification digest.</p>
                <p>SMTP Relay Host: <strong className="apex-id">smtp.sendgrid.net:587</strong></p>
                <p>Transport Encryption: <strong>TLS 1.3 Strict Verification</strong></p>
                <p>Authorized Sender: <strong className="apex-id">alerts@apexops.io</strong></p>
                <p>24hr Delivery Rate: <strong>no delivery data (local demo)</strong></p>
                <div className="flex gap-2 mt-1 items-center">
                  <Button variant="secondary" onClick={() => push(true, 'Diagnostic skipped (local)', 'local demo — no mail sent.')}>Send Test Email Diagnostic</Button>
                  <Badge variant="warn">DKIM / SPF: not verified</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <h3 className="text-sm font-semibold">ERP &amp; Financial GL Sync · Oracle ERP (not connected)</h3>
                <p className="text-xs text-muted">Synchronizes purchase order encumbrances, parts deprecation, and contractor work billing.</p>
                <p>Sync Health: <strong>Not connected (local demo)</strong></p>
                <p>Polling Frequency: <strong>15 mins cron window</strong></p>
                <p>Payload Scope: <strong>POs, Invoices, Capex</strong></p>
                <p>OAuth2 Client: <strong className="apex-id">apex-erp-bridge-prod</strong></p>
                <div className="flex gap-2 mt-1 items-center">
                  <Button variant="secondary" onClick={() => { setErpSync('just now'); push(true, 'Re-sync skipped (local)', 'local demo — no ERP sync performed.'); }}>Re-sync Ledgers</Button>
                  <span className="text-xs text-muted">Token expires: 48h</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold flex items-center gap-2"><Webhook size={16} /> Active Webhook Dispatchers</h2>
                <Button onClick={() => setHkOpen(true)}>Register New Webhook URL</Button>
              </div>
              <p className="text-xs text-muted -mt-1">(local registry, no delivery) — HTTP event callbacks for automated Slack notifications, Incident.io runbooks, and PagerDuty escalations.</p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[820px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Destination Endpoint</th><th className="font-semibold">Subscribed Event Topics</th><th className="font-semibold">Authentication</th><th className="font-semibold">Response Health</th><th className="font-semibold">Avg Latency</th><th className="font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hooks.map((h, i) => (
                      <tr key={h.url} className="border-b border-surface-subtle">
                        <td className="p-2"><p className="apex-id text-xs break-all">{h.url}</p><p className="text-xs text-muted">{h.name}</p></td>
                        <td className="apex-id text-xs">{h.topics}</td>
                        <td className="text-xs">{h.auth}</td>
                        <td><Badge variant="pass">{h.health}</Badge></td>
                        <td className="apex-id">{h.lat}</td>
                        <td>
                          <div className="flex gap-2">
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => push(true, 'Ping OK', `${h.name} · ${h.health} · ${h.lat}.`)}>Ping</button>
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => { setEditHook(i); setEditTopics(h.topics); }}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'Localization & Units' && (
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-semibold flex items-center gap-2"><Ruler size={16} /> Engineering Units of Measurement &amp; Sensor Calibration</h2>
            <p className="text-xs text-muted -mt-2">Define global default unit conversion scales across thermodynamic, HVAC airflow, and electrical monitoring nodes.</p>
            {([
              ['Thermal & Chillers', thermal, setThermal, ['Celsius (°C) [ASHRAE Standard]', 'Fahrenheit (°F)', 'Kelvin (K)'], 'Display precision: 2 decimal places'],
              ['Pressure & Hydraulics', pressure, setPressure, ['Bar / Pascal (bar, kPa)', 'Pounds per Square Inch (PSI)', 'Millimeter of Mercury (mmHg)'], 'Default pump intake metric'],
              ['Electrical Active Power', power, setPower, ['Kilowatts / Megawatt-hours (kW / MWh)', 'Volts-Amperes Reactive (kVAR)', 'British Thermal Units / hr (BTU/h)'], 'Transformer substations telemetry'],
            ] as const).map(([title, val, set, opts, note]) => (
              <fieldset key={title} className="rounded border border-border-subtle bg-card p-3">
                <legend className="text-[13px] font-semibold px-1">{title}</legend>
                <div className="flex flex-col gap-1 mt-1" role="radiogroup" aria-label={title}>
                  {opts.map((o) => (
                    <label key={o} className={cn('flex items-center gap-2 text-[13px] px-3 py-1.5 rounded border cursor-pointer', val === o ? 'border-cobalt-deep bg-cobalt-tint font-semibold' : 'border-border-subtle bg-card')}>
                      <input type="radio" name={title} checked={val === o} onChange={() => { set(o); push(true, 'Unit default staged', `${title} → ${o} · Save to persist.`); }} className="accent-[#1E40AF]" />
                      {o}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-1">{note}</p>
              </fieldset>
            ))}
          </div>
        )}

        {tab === 'Security & Auth Keys' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold flex items-center gap-2"><KeyRound size={16} /> API Gateway Keys &amp; SCADA Mutual TLS (mTLS)</h2>
                <Button onClick={() => setIssueOpen(true)}>Issue New API Credential</Button>
              </div>
              <div className="rounded border border-warn bg-warn-bg/40 p-3 text-[13px] flex flex-col gap-1">
                <p className="font-bold">Internal Field Scanner Key (Nusantara Plant Barcode Dispatch)</p>
                <p className="text-xs text-muted">Scopes: <span className="apex-id">work_orders:write · assets:read · telemetry:ingest</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="pass">ACTIVE • Expires in 182d</Badge>
                  <Badge variant="warn">ROTATED — prev secret exposed in mockup (C21)</Badge>
                </div>
                <p className="apex-id text-sm break-all">
                  {revealed
                    ? shownOnce || key
                    : coreSecretRow
                      ? <Badge variant="info">stored hash-only · last4 {coreSecretRow.last4}</Badge>
                      : masked}
                </p>
                <div className="flex flex-wrap gap-2">
                  {revealed ? (
                    <Button variant="secondary" onClick={() => { setRevealed(false); setShownOnce(''); push(true, 'Key re-masked', 'Display cleared · display state only (server still hash-only).'); }}>
                      <EyeOff size={15} /> Mask Key
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={reveal}><Eye size={15} /> Reveal</Button>
                  )}
                  <Button variant="secondary" onClick={() => void rotate()} disabled={setBusy}><RefreshCw size={15} /> Rotate</Button>
                </div>
              </div>
              {extraKeys.map((k) => (
                <div key={k.name} className="rounded border border-border-subtle bg-card p-3 text-[13px] flex flex-wrap items-center gap-2">
                  <strong>{k.name}</strong>
                  <span className="apex-id">apx_live_sec_••••{k.last4}</span>
                  <Badge variant="pass">ACTIVE</Badge>
                </div>
              ))}
              {shownOnce && (
                <p className="apex-id text-xs break-all rounded border border-pass bg-pass-bg p-2" role="status">Shown once — copy now: {shownOnce}</p>
              )}
              <div className="rounded border border-border-subtle bg-card p-3 text-[13px] flex flex-wrap items-center gap-2">
                <ShieldCheck size={16} className="text-pass" />
                <span><strong>mTLS: not enforced (planned)</strong> · SCADA gateways + field tablets would present client certs · broker {broker ?? 'not configured'}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <Dialog open={cfg !== null} onOpenChange={(v) => { if (!v) setCfg(null); }}>
        <DialogContent aria-labelledby="cfg-h">
          {cfg && (
            <>
              <DialogTitle id="cfg-h">Configure — {cfg.ent}</DialogTitle>
              <DialogDescription>Current index drives the realtime preview. Issued documents are never renumbered.</DialogDescription>
              <label className="text-xs font-semibold" htmlFor="cfg-v">Current index (exactly {cfg.width} digits)</label>
              <Input id="cfg-v" inputMode="numeric" value={cfgVal} onChange={(e) => setCfgVal(e.target.value)} invalid={cfgTouched && !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim())} className="apex-id" />
              <p className="text-[13px]">Preview: <strong className="apex-id text-cobalt">{cfg.prev(/^\d+$/.test(cfgVal.trim()) ? cfgVal.trim().padStart(cfg.width, '0') : '…')}</strong></p>
              {cfgTouched && !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim()) && <p className="text-[11px] font-semibold text-fail">Exactly {cfg.width} digits required.</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setCfg(null)}>Cancel</Button>
                <Button onClick={saveCfg}>Save Index</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={epOpen} onOpenChange={setEpOpen}>
        <DialogContent aria-labelledby="ep-h">
          <DialogTitle id="ep-h">Configure SCADA Endpoints</DialogTitle>
          <DialogDescription>Broker address for MQTT ingest.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="ep-v">Broker Address (mqtt://host:port)</label>
          <Input id="ep-v" value={epVal} onChange={(e) => setEpVal(e.target.value)} invalid={epTouched && !/^mqtt:\/\/.+:\d+$/.test(epVal.trim())} className="apex-id" />
          {epTouched && !/^mqtt:\/\/.+:\d+$/.test(epVal.trim()) && <p className="text-[11px] font-semibold text-fail">Format mqtt://host:port required.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEpOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveBrokerEndpoint()}>Save Endpoints</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={hkOpen} onOpenChange={setHkOpen}>
        <DialogContent aria-labelledby="hk-h">
          <DialogTitle id="hk-h">Register New Webhook URL</DialogTitle>
          <DialogDescription>Handshake-verified before first dispatch.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="hk-u">Destination Endpoint (https://)</label>
          <Input id="hk-u" value={hk.url} onChange={(e) => setHk((h) => ({ ...h, url: e.target.value }))} invalid={hkTouched && !/^https:\/\/.+\..+/.test(hk.url.trim())} className="apex-id" placeholder="https://…" />
          <label className="text-xs font-semibold" htmlFor="hk-t">Subscribed Event Topics</label>
          <Input id="hk-t" value={hk.topics} onChange={(e) => setHk((h) => ({ ...h, topics: e.target.value }))} invalid={hkTouched && !hk.topics.trim()} className="apex-id" placeholder="e.g. wo.created · alert.p1" />
          <label className="text-xs font-semibold" htmlFor="hk-a">Authentication</label>
          <select id="hk-a" value={hk.auth} onChange={(e) => setHk((h) => ({ ...h, auth: e.target.value }))} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['HMAC-SHA256 Sig', 'Bearer Token', 'Routing Key Header'].map((a) => <option key={a}>{a}</option>)}
          </select>
          {hkTouched && (!/^https:\/\/.+\..+/.test(hk.url.trim()) || !hk.topics.trim()) && <p className="text-[11px] font-semibold text-fail">Valid https URL + topics required.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHkOpen(false)}>Cancel</Button>
            <Button onClick={registerHook}>Register Webhook</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editHook !== null} onOpenChange={(v) => { if (!v) setEditHook(null); }}>
        <DialogContent aria-labelledby="eh-h">
          <DialogTitle id="eh-h">Edit Webhook Topics</DialogTitle>
          <DialogDescription>{editHook !== null ? hooks[editHook].url : ''}</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="eh-t">Subscribed Event Topics</label>
          <Input id="eh-t" value={editTopics} onChange={(e) => setEditTopics(e.target.value)} invalid={!editTopics.trim()} className="apex-id" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditHook(null)}>Cancel</Button>
            <Button onClick={saveHookEdit}>Save Topics</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent aria-labelledby="pin-h">
          <DialogTitle id="pin-h">Secret is hash-only</DialogTitle>
          <DialogDescription asChild>
            <div className="text-[13px] flex flex-col gap-2">
              <p>The server stores only <span className="apex-id">sha256(secret) + last4</span> — full plaintext can never be recovered after first display.</p>
              {shownOnce ? (
                <p className="rounded border border-pass bg-pass-bg p-2 apex-id text-xs break-all" role="status">In-session plaintext: {shownOnce}</p>
              ) : (
                <p className="text-muted">No in-session plaintext — rotate to see a new one once.</p>
              )}
            </div>
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPinOpen(false)}>Close</Button>
            <Button onClick={() => { setPinOpen(false); void rotate(); }} disabled={setBusy}>Rotate &amp; Show Once</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent aria-labelledby="iss-h">
          <DialogTitle id="iss-h">Issue New API Credential</DialogTitle>
          <DialogDescription>Crypto-random key · shown once — copy immediately.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="iss-n">Credential name (required)</label>
          <Input id="iss-n" value={issueName} onChange={(e) => setIssueName(e.target.value)} invalid={issueTouched && !issueName.trim()} placeholder="e.g. Rooftop tablet pool" />
          {issueTouched && !issueName.trim() && <p className="text-[11px] font-semibold text-fail">Name required.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button onClick={issue}>Generate &amp; Issue</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
