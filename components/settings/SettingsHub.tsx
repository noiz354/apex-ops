'use client';

import { useEffect,  useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Database, Download, Eye, EyeOff, KeyRound, Lock, Mail, Radio, RefreshCw, Ruler, ShieldCheck, Trash2, Webhook, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';
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



const download = (filename: string, text: string, type = 'application/json') => downloadText(filename, text, type);

const genKey = () => `apx_live_sec_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('')}`;

const utcDay = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
};

export function SettingsHub() {
  const [tab, setTab] = useState<string>(TABS[0]);
  const { toasts, push, dismiss, defer } = useToasts(8000);
  const [maint, setMaint] = useState(true);
  const [tx, setTx] = useState(904128);
  const [expOpen, setExpOpen] = useState(false);
  const [format, setFormat] = useState<'json' | 'yaml'>('json');
  const [company, setCompany] = useState('Apex Facility Management Global Pte Ltd');
  const [brand, setBrand] = useState('Apex Ops - Nusantara East Campus');
  const [ccy, setCcy] = useState('USD ($) - US Dollar');
  const [tz, setTz] = useState('UTC+07:00 (Asia/Jakarta - WIB / East Asia)');
  const [fiscal, setFiscal] = useState('Januari - Desember (Tahun Kalender)');
  const [week, setWeek] = useState('Senin - Sabtu | 07:00 - 22:00 (Dua Rotasi 8 jam)');
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
      push(false, `Gagal menulis pengaturan — ${key}`, errMsg(e));
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
        push(true, 'Parameter tersimpan — server', `general.profile tersimpan ke settings_kv · diperbarui oleh ${row.updatedBy}.`);
      } catch (e) {
        push(false, 'Gagal menyimpan', errMsg(e));
      } finally {
        setSetBusy(false);
      }
      return;
    }
    const n = tx + 1;
    setTx(n);
    push(true, 'Parameter ditahap (lokal)', `TX-${n} · hanya state lokal — not persisted.`);
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
      if (row) push(true, 'Endpoint tersimpan — server', `${v} · tersimpan ke settings_kv. Ingest is NOT rerouted (no live broker).`);
      return;
    }
    push(true, 'Endpoint tersimpan (lokal)', `${v} · ingest TIDAK dialihkan (no live broker) · not persisted.`);
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
    push(true, 'Bundle diekspor', `apex-settings-bundle.${format} · 9 bagian · secret dikecualikan.`);
  };

  const saveCfg = () => {
    setCfgTouched(true);
    if (!cfg || !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim())) return;
    const k = cfg.ent.startsWith('Work') ? 'WO' : cfg.ent.startsWith('Service') ? 'SR' : cfg.ent.startsWith('Purchase') ? 'PO' : cfg.ent.startsWith('Asset') ? 'AST' : 'INS';
    setIdx((x) => ({ ...x, [k]: cfgVal.trim() }));
    setCfg(null);
    setCfgTouched(false);
    push(true, 'Sequence diperbarui', `${cfg.ent} → ${cfg.prev(cfgVal.trim())}.`);
  };

  const snapshot = async () => {
    const ts = utcDay();
    setSnaps((s) => [{ ts, mode: 'Snapshot Ad-hoc (sesi ini — hanya metadata)', vol: '0 baris', sum: 'disimulasi', ret: 'Record metadata — tidak ada backup', live: true }, ...s]);
    if (setLive) {
      const row = await putKey(SKEY.snap, { ts, mode: 'simulated', rowsTouched: 0, note: 'Ad-hoc snapshot is simulated — no backup pipeline exists.' });
      if (row) push(true, 'Metadata snapshot tersimpan', 'simulated · 0 rows touched · tercatat di settings_kv (bukan backup database).');
      return;
    }
    push(true, 'Snapshot disimulasi (lokal)', 'simulated · 0 rows touched · hanya state lokal — not persisted.');
  };

  const restoreSim = (ts: string) => {
    setRestoring(ts);
    setRestored('');
    defer(async () => {
      setRestoring(null);
      setRestored(ts);
      if (setLive) {
        const row = await putKey(SKEY.restore, { fromTs: ts, mode: 'simulated', rowsTouched: 0, restoredAt: new Date().toISOString() });
        if (row) push(true, 'Restore disimulasi', `${ts} · simulated · 0 rows touched · metadata tersimpan (settings_kv).`);
        return;
      }
      push(true, 'Restore disimulasi', `${ts} · simulated · 0 rows touched · no-op terverifikasi (lokal — not persisted).`);
    }, 1500);
  };

  const tarball = (s: Snap) => {
    download(`snapshot-${s.ts.slice(0, 10)}-manifest.json`, JSON.stringify({ snapshot: s.ts, mode: s.mode, volume: s.vol, checksum: s.sum, retention: s.ret, simulated: true, note: 'Demo manifest — no vault or backup data exists (planned).' }, null, 2));
    push(true, 'Manifest diunduh (demo)', `${s.vol} · manifest demo — tidak ada vault (planned).`);
  };

  const testConn = () => {
    setConnTest('probing…');
    defer(() => {
      setConnTest('not connected (local demo) · 0 msgs/min — broker never probed');
      push(true, 'Link SCADA tidak tersambung', `${broker ?? 'no broker configured (local demo)'} · no SCADA link exists.`);
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
      if (saved) push(true, 'Webhook tersimpan — server', `${row.url} · registry tersimpan (settings_kv) · handshake tidak pernah dilakukan (no delivery).`);
      return;
    }
    push(true, 'Webhook ditahap (lokal)', `${row.url} · handshake tidak dilakukan (no webhook delivery) · not persisted.`);
  };

  const saveHookEdit = async () => {
    if (editHook === null || !editTopics.trim()) return;
    const next = hooks.map((x, i) => (i === editHook ? { ...x, topics: editTopics.trim() } : x));
    setHooks(next);
    setEditHook(null);
    if (setLive) {
      const saved = await putKey(SKEY.hooks, next.map((h) => ({ url: h.url, name: h.name, topics: h.topics, auth: h.auth })));
      if (saved) push(true, 'Webhook diperbarui — server', 'Topik langganan tersimpan (settings_kv) · no delivery performed.');
      return;
    }
    push(true, 'Webhook diperbarui (lokal)', 'Topik langganan ditahap · not persisted.');
  };

  const reveal = () => {
    if (shownOnce) {
      setRevealed(true);
      push(true, 'Plaintext ditampilkan', 'Ini nilai rotate/demo sesi ini · server hanya menyimpan hash.');
    } else {
      setRevealed(false);
      push(false, 'Tidak ada yang ditampilkan', 'Hash-only di server — rotate untuk melihat plaintext baru tepat sekali.');
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
        push(true, 'Key di-rotate — server', `Hash tersimpan · last4 ${res.last4} · plaintext tampil sekali, lalu tidak bisa diambil lagi.`);
      } catch (e) {
        push(false, 'Rotate gagal', errMsg(e));
      } finally {
        setSetBusy(false);
      }
      return;
    }
    const nk = genKey();
    setKey(nk);
    setRevealed(true);
    setShownOnce(nk);
    push(true, 'Key di-rotate (lokal)', `key demo lokal — not stored server-side · last4 ${nk.slice(-4)}.`);
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
        push(true, 'Kredensial diterbitkan — server', `last4 ${res.last4} · tersimpan hash-only · plaintext tampil sekali.`);
      } catch (e) {
        push(false, 'Penerbitan gagal', errMsg(e));
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
    push(true, 'Kredensial diterbitkan (lokal)', `key demo lokal — not stored server-side · salin sekarang — tampil sekali.`);
  };

  const masked = key ? `apx_live_sec_••••${key.slice(-4)}` : 'apx_live_sec_••••····';

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Pengaturan &amp; Konfigurasi Sistem</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="set-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">ENGINE v4.18-p3 • pengaturan workspace demo (didukung KV saat live)</p>
            <h1 id="set-h" className="text-2xl font-semibold tracking-tight">Pengaturan &amp; Konfigurasi Sistem</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            {setLive === null ? (
              <Badge variant="hold">KV: connecting…</Badge>
            ) : setLive ? (
              <Badge variant="pass">KV: live · server-fed</Badge>
            ) : (
              <Badge variant="hold">KV: demo offline — local state</Badge>
            )}
            <Badge variant={maint ? 'warn' : 'pass'}>{maint ? 'Mode Maint: AKTIF' : 'Mode Maint: NONAKTIF'}{setLive ? ' · metadata' : ' · hanya lokal'}</Badge>
            <ConfirmDialog title={maint ? 'Nonaktifkan mode maintenance?' : 'Aktifkan mode maintenance?'} description={setLive ? 'Flag is stored server-side as metadata (ops.maint_mode) — enforcement is NOT wired (planned).' : 'Local demo flag only — not enforced server-side.'} confirmLabel={maint ? 'Disarm' : 'Arm'} onConfirm={async () => {
              const next = !maint;
              setMaint(next);
              if (setLive) {
                const row = await putKey(SKEY.maint, next);
                if (row) push(true, next ? 'Mode maint aktif — server' : 'Mode maint nonaktif — server', `ops.maint_mode=${next} tersimpan (metadata; enforcement planned).`);
                return;
              }
              push(true, next ? 'Mode maint aktif' : 'Mode maint nonaktif', 'hanya lokal — not enforced server-side.');
            }}>
              <Button variant="secondary"><Wrench size={16} /> {maint ? 'Disarm' : 'Arm'}</Button>
            </ConfirmDialog>
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><Download size={16} /> Ekspor Bundle (JSON/YAML)</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="exp-h">
                <DialogTitle id="exp-h">Ekspor Bundle Pengaturan</DialogTitle>
                <DialogDescription>9 sections · secrets are always excluded.</DialogDescription>
                <div className="flex gap-2" role="radiogroup" aria-label="Format bundle">
                  {(['json', 'yaml'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFormat(f)} aria-pressed={format === f} className={cn('h-9 px-4 rounded text-[13px] font-bold border uppercase', format === f ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setExpOpen(false)}>Batal</Button>
                  <Button onClick={exportBundle}>Unduh</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => void save()} disabled={setBusy}><CheckCircle2 size={16} /> {setBusy ? 'Menyimpan…' : 'Simpan Parameter Sistem'}</Button>
          </div>
        </div>
        <p className="text-xs text-muted -mt-2">
          {setLive
            ? <>Server-backed KV via /api/settings{lastSavedAt ? ` · last write ${lastSavedAt.replace('T', ' ').slice(0, 16)} UTC` : ''}</>
            : <>Parameters are local demo state — not persisted · TX-{tx} (local)</>}
        </p>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Bagian pengaturan">
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
                <span className="apex-id text-xs">ID Tenant: <strong>{CANON.tenant}</strong> <span className="text-muted">(C6 — tenant tetap)</span></span>
              </div>
              <p className="text-xs text-muted -mt-2">Configures organizational naming conventions, operational timeframes, legal jurisdiction scope, and standard accounting windows.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="co">Nama Badan Hukum Perusahaan</label>
                  <Input id="co" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="br">Brand Fasilitas Operasional</label>
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
                  <label className="text-xs font-semibold" htmlFor="tz">Zona Waktu Operasional Utama</label>
                  <select id="tz" value={tz} onChange={(e) => setTz(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['UTC+07:00 (Asia/Jakarta - WIB / East Asia)', 'UTC+00:00 (UTC / Western Europe)', 'UTC-05:00 (America/New_York - EST)', 'UTC+08:00 (Asia/Singapore - SGT)'].map((z) => <option key={z}>{z}</option>)}
                  </select>
                  <span className="text-[11px] text-muted">Stempel waktu telemetri dinormalisasi ke UTC saat ingest</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="fy">Siklus Tahun Fiskal</label>
                  <select id="fy" value={fiscal} onChange={(e) => setFiscal(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {['Januari - Desember (Tahun Kalender)', 'April - Maret (Standar UK/APAC Commonwealth)', 'Oktober - September (Federal AS / Negara Bagian)'].map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs font-semibold" htmlFor="wk">Minggu Kerja Default &amp; Jam Operasional</label>
                  <Input id="wk" value={week} onChange={(e) => setWeek(e.target.value)} />
                  <span className="text-[11px] text-muted">Jam operasional site — bukan definisi shift (C16) · Semua shift terikat otomatis ke Engine Kalender Roster Shift</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => { setReindexed('14 Sep 2026 14:05 WIB'); push(true, 'Re-index fasilitas ditahap (lokal)', '34 gedung · 1.420 ruangan · simulasi lokal — GIS + roster tidak tersentuh.'); }}>
                  <RefreshCw size={15} /> Re-index Facilities
                </Button>
                <span className="text-xs text-muted">Last re-index {reindexed}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Mesin Telemetri Dispatcher (demo lokal)</h2>
                <Badge variant="warn">OFFLINE</Badge>
              </div>
              <p className="text-xs text-muted -mt-1">Local demo thresholds (no live routing engine): message routing, worker pool concurrency, and SLA escalation triggers.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Eskalasi Pelanggaran SLA Prioritas 1 (P1)</p><p className="font-bold">15 MIN THRESHOLD</p><p className="text-xs text-muted">Eskalasi notifikasi langsung ke Lead Engineering Plant siaga</p></div>
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">Throttle Dispatch Kerja Konkuren</p><p className="font-bold">64 WORKERS / ZONE</p><p className="text-xs text-muted">Rebalance beban otomatis lintas hub Nusantara Timur dan Tengah</p></div>
                <div className="rounded border border-border-subtle bg-card p-2"><p className="apex-label-caps text-muted">SCADA Ingestion Backpressure Buffer</p><p className="font-bold">TANPA BUFFER (demo lokal)</p><p className="text-xs text-muted">Tidak ada ingest live — tidak ada yang di-buffer</p></div>
              </div>
              <div>
                <Button variant="secondary" onClick={() => { setBuffer(2); push(true, 'Flush dilewati (lokal)', 'demo lokal — tidak ada ingest buffer.'); }}>
                  <Database size={15} /> Flush Ingest Buffer
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Sequence Penomoran Tiket &amp; Dokumen</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setLocked((l) => !l); push(true, locked ? 'Policy dibuka' : 'Policy dikunci', locked ? 'Counter bisa diubah admin.' : 'Sequence dibekukan · Konfigurasi + Reset nonaktif.'); }}>
                    <Lock size={15} /> {locked ? 'Buka Policy Sequence' : 'Kunci Policy Sequence'}
                  </Button>
                  <ConfirmDialog title="Atur ulang semua counter?" description="Mengembalikan indeks seed (WO 0894 · SR 0142 · PO 0298 · AST 004 · INS 1092). Dokumen terbit tidak pernah dinomori ulang." confirmLabel="Atur Ulang Counter" onConfirm={() => { setIdx({ WO: '0894', SR: '0142', PO: '0298', AST: '004', INS: '1092' }); push(true, 'Counter di-reset', 'Seed index dipulihkan · ledger tidak tersentuh.'); }}>
                    <Button variant="secondary" disabled={locked}>Atur Ulang Counter</Button>
                  </ConfirmDialog>
                </div>
              </div>
              <p className="text-xs text-muted -mt-1">Atur token format dokumen global yang seragam lintas dispatch, requisition, dan pelacakan hardware plant.</p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[760px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Entitas Dokumen</th><th className="font-semibold">Pola Prefix</th><th className="font-semibold">Mask Tanggal</th><th className="font-semibold">Padding</th><th className="font-semibold">Indeks Saat Ini</th><th className="font-semibold">Pratinjau Realtime</th><th className="font-semibold">Aksi</th>
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
                          <td><Button variant="secondary" disabled={locked} onClick={() => { setCfg(s); setCfgVal(idx[k]); setCfgTouched(false); }}>Konfigurasi</Button></td>
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
                <h2 className="text-base font-semibold">Siklus Database &amp; Engine Seed Demo</h2>
                <Badge variant="info">Seed Demo: AKTIF (Phase 3 Dimuat)</Badge>
              </div>
              <p className="text-xs text-muted -mt-1">Siapkan suite tes demo deterministik, simulasikan operasi plant, atau flush tabel staging sebelum audit kepatuhan ISO.</p>
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
                <ConfirmDialog title="Demo staging — reload tidak dilakukan" description="No baseline reload runs in this build; numbers below are static copy." confirmLabel="Mengerti" onConfirm={() => push(true, 'Reload baseline dilewati (lokal)', 'demo lokal — tidak ada reload seed.')}>
                  <Button variant="secondary"><RefreshCw size={15} /> Muat Ulang Seed Baseline Bersih (demo)</Button>
                </ConfirmDialog>
                <ConfirmDialog title="Demo staging — purge tidak dilakukan" description="No purge actually runs in this build." confirmLabel="Mengerti" onConfirm={() => push(true, 'Purge dilewati (lokal)', 'demo lokal — 0 baris di-purge · tidak ada yang terjadwal.')}>
                  <Button variant="secondary"><Trash2 size={15} /> Purge Transaksi Tes (&gt;30 Hari) (demo)</Button>
                </ConfirmDialog>
                <Button variant="secondary" onClick={() => { setBatches((b) => b + 1); push(true, 'Generasi telemetri dilewati (lokal)', `demo lokal — tidak ada synthetic batch #${batches + 1} yang antre (tidak ada telemetry writer).`); }}>
                  <Radio size={15} /> Generate Synthetic Sensor Telemetry (1hr Batch) (demo)
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Backup Database Otomatis &amp; Restore Point-in-Time</h2>
                <div className="flex flex-wrap gap-2">
                  <Link href="/settings/jobs">
                    <Button variant="secondary"><Clock size={15} /> Lihat Riwayat Job &amp; Snapshot</Button>
                  </Link>
                  <Button onClick={snapshot}><Database size={15} /> Buat Snapshot Ad-hoc Sekarang</Button>
                </div>
              </div>
              <p className="text-xs text-muted -mt-1">Desain terencana (no backup job): log diferensial per jam dan image cold storage terenkripsi menargetkan standar SOC2 Type II.</p>
              <p className="text-[13px]">Status Jadwal Backup: <strong>Tidak berjalan · (terencana: Diff Per Jam + Full Harian)</strong></p>
              <p className="text-[13px]">Storage S3 Vault: <span className="apex-id">s3://apex-backup-us-east-prod-wal/</span> <span className="text-muted">(planned — no vault exists)</span></p>
              <p className="text-[13px]">Snapshot Terverifikasi Terakhir: <strong>tidak ada (jadwal demo di bawah)</strong></p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[820px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Stempel Waktu Snapshot</th><th className="font-semibold">Mode Backup</th><th className="font-semibold">Volume Terkompresi</th><th className="font-semibold">Verifikasi Checksum</th><th className="font-semibold">Status Retensi</th><th className="font-semibold">Aksi Pemulihan</th>
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
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => tarball(s)}>Unduh TAR.GZ</button>
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
              {restored && <p className="text-[13px] font-semibold text-pass" role="status">Simulasi restore OK · {restored} · RTO 11 mnt · 0 baris tersentuh.</p>}
            </div>
          </div>
        )}

        {tab === 'Integrations & Webhooks' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Radio size={15} /> SCADA / IoT Gateway</h3>
                <p className="text-xs text-muted">Pipeline ingest telemetri untuk array sensor getaran chiller, pompa, dan elektrik.</p>
                <p>Alamat Broker: <strong className="apex-id">{broker ?? 'belum dikonfigurasi'}</strong>{setLive && <span className="text-xs text-muted"> (settings_kv)</span>}</p>
                <p>Protokol Didukung: <strong>MQTT / BACnet IP / OPC-UA</strong></p>
                <p>Laju Ingest Aktif: <strong>Tidak tersambung (no live ingest)</strong></p>
                <p>Monitored Fields: <strong>Getaran, Suhu, Gas Ultrasonik</strong></p>
                {connTest && <p className="font-semibold text-pass" role="status">Probe: {connTest}</p>}
                <div className="flex gap-2 mt-1">
                  <Button variant="secondary" onClick={() => { setEpVal(broker ?? ''); setEpOpen(true); setEpTouched(false); }}>Konfigurasi Endpoint</Button>
                  <Button variant="secondary" onClick={testConn}>Tes Koneksi</Button>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Mail size={15} /> Enterprise Email Gateway</h3>
                  <Badge variant="pass">Operasional</Badge>
                </div>
                <p className="text-xs text-muted">Transactional email relay for technician dispatch alerts and compliance notification digest.</p>
                <p>SMTP Relay Host: <strong className="apex-id">smtp.sendgrid.net:587</strong></p>
                <p>Transport Encryption: <strong>TLS 1.3 Strict Verification</strong></p>
                <p>Authorized Sender: <strong className="apex-id">alerts@apexops.io</strong></p>
                <p>24hr Delivery Rate: <strong>no delivery data (local demo)</strong></p>
                <div className="flex gap-2 mt-1 items-center">
                  <Button variant="secondary" onClick={() => push(true, 'Diagnostik dilewati (lokal)', 'demo lokal — no mail sent.')}>Kirim Diagnostik Email Tes</Button>
                  <Badge variant="warn">DKIM / SPF: not verified</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-1.5 text-[13px]">
                <h3 className="text-sm font-semibold">ERP &amp; Financial GL Sync · Oracle ERP (not connected)</h3>
                <p className="text-xs text-muted">Menyinkronkan encumbrance purchase order, depresiasi parts, dan billing kerja kontraktor.</p>
                <p>Kesehatan Sinkron: <strong>Tidak tersambung (demo lokal)</strong></p>
                <p>Frekuensi Polling: <strong>jendela cron 15 mnt</strong></p>
                <p>Cakupan Payload: <strong>PO, Invoice, Capex</strong></p>
                <p>OAuth2 Client: <strong className="apex-id">apex-erp-bridge-prod</strong></p>
                <div className="flex gap-2 mt-1 items-center">
                  <Button variant="secondary" onClick={() => { setErpSync('just now'); push(true, 'Re-sync dilewati (lokal)', 'demo lokal — no ERP sync performed.'); }}>Sinkron Ulang Ledger</Button>
                  <span className="text-xs text-muted">Token expires: 48h</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold flex items-center gap-2"><Webhook size={16} /> Active Webhook Dispatchers</h2>
                <Button onClick={() => setHkOpen(true)}>Daftarkan URL Webhook Baru</Button>
              </div>
              <p className="text-xs text-muted -mt-1">(local registry, no delivery) — HTTP event callbacks for automated Slack notifications, Incident.io runbooks, and PagerDuty escalations.</p>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-[13px] min-w-[820px]">
                  <thead>
                    <tr className="text-left text-muted border-b border-border-subtle bg-card">
                      <th className="p-2 font-semibold">Endpoint Tujuan</th><th className="font-semibold">Topik Event Terlangganan</th><th className="font-semibold">Autentikasi</th><th className="font-semibold">Kesehatan Respons</th><th className="font-semibold">Rata-rata Latensi</th><th className="font-semibold">Aksi</th>
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
                            <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => { setEditHook(i); setEditTopics(h.topics); }}>Ubah</button>
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
                      <input type="radio" name={title} checked={val === o} onChange={() => { set(o); push(true, 'Default unit ditahap', `${title} → ${o} · Simpan untuk menyimpan.`); }} className="accent-[#1E40AF]" />
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
                <Button onClick={() => setIssueOpen(true)}>Terbitkan Kredensial API Baru</Button>
              </div>
              <div className="rounded border border-warn bg-warn-bg/40 p-3 text-[13px] flex flex-col gap-1">
                <p className="font-bold">Kunci Scanner Lapangan Internal (Dispatch Barcode Plant Nusantara)</p>
                <p className="text-xs text-muted">Scopes: <span className="apex-id">work_orders:write · assets:read · telemetry:ingest</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="pass">ACTIVE • Expires in 182d</Badge>
                  <Badge variant="warn">DIROTASI — secret lama terekspos di mockup (C21)</Badge>
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
                    <Button variant="secondary" onClick={() => { setRevealed(false); setShownOnce(''); push(true, 'Key disamarkan lagi', 'Tampilan dibersihkan · hanya state tampilan (server tetap hash-only).'); }}>
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
                <span><strong>mTLS: not enforced (planned)</strong> · SCADA gateways + field tablets would present client certs · broker {broker ?? 'belum dikonfigurasi'}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <Dialog open={cfg !== null} onOpenChange={(v) => { if (!v) setCfg(null); }}>
        <DialogContent aria-labelledby="cfg-h">
          {cfg && (
            <>
              <DialogTitle id="cfg-h">Konfigurasi — {cfg.ent}</DialogTitle>
              <DialogDescription>Indeks saat ini menggerakkan pratinjau realtime. Dokumen terbit tidak pernah dinomori ulang.</DialogDescription>
              <label className="text-xs font-semibold" htmlFor="cfg-v">Current index (exactly {cfg.width} digits)</label>
              <Input id="cfg-v" inputMode="numeric" value={cfgVal} onChange={(e) => setCfgVal(e.target.value)} invalid={cfgTouched && !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim())} className="apex-id" />
              <p className="text-[13px]">Pratinjau: <strong className="apex-id text-cobalt">{cfg.prev(/^\d+$/.test(cfgVal.trim()) ? cfgVal.trim().padStart(cfg.width, '0') : '…')}</strong></p>
              {cfgTouched && !new RegExp(`^\\d{${cfg.width}}$`).test(cfgVal.trim()) && <p className="text-[11px] font-semibold text-fail">Tepat {cfg.width} digit wajib.</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setCfg(null)}>Batal</Button>
                <Button onClick={saveCfg}>Simpan Indeks</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={epOpen} onOpenChange={setEpOpen}>
        <DialogContent aria-labelledby="ep-h">
          <DialogTitle id="ep-h">Konfigurasi Endpoint SCADA</DialogTitle>
          <DialogDescription>Alamat broker untuk ingest MQTT.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="ep-v">Alamat Broker (mqtt://host:port)</label>
          <Input id="ep-v" value={epVal} onChange={(e) => setEpVal(e.target.value)} invalid={epTouched && !/^mqtt:\/\/.+:\d+$/.test(epVal.trim())} className="apex-id" />
          {epTouched && !/^mqtt:\/\/.+:\d+$/.test(epVal.trim()) && <p className="text-[11px] font-semibold text-fail">Format mqtt://host:port wajib.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEpOpen(false)}>Batal</Button>
            <Button onClick={() => void saveBrokerEndpoint()}>Simpan Endpoint</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={hkOpen} onOpenChange={setHkOpen}>
        <DialogContent aria-labelledby="hk-h">
          <DialogTitle id="hk-h">Daftarkan URL Webhook Baru</DialogTitle>
          <DialogDescription>Terverifikasi handshake sebelum dispatch pertama.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="hk-u">Endpoint Tujuan (https://)</label>
          <Input id="hk-u" value={hk.url} onChange={(e) => setHk((h) => ({ ...h, url: e.target.value }))} invalid={hkTouched && !/^https:\/\/.+\..+/.test(hk.url.trim())} className="apex-id" placeholder="https://…" />
          <label className="text-xs font-semibold" htmlFor="hk-t">Topik Event Terlangganan</label>
          <Input id="hk-t" value={hk.topics} onChange={(e) => setHk((h) => ({ ...h, topics: e.target.value }))} invalid={hkTouched && !hk.topics.trim()} className="apex-id" placeholder="mis. wo.created · alert.p1" />
          <label className="text-xs font-semibold" htmlFor="hk-a">Autentikasi</label>
          <select id="hk-a" value={hk.auth} onChange={(e) => setHk((h) => ({ ...h, auth: e.target.value }))} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['HMAC-SHA256 Sig', 'Bearer Token', 'Routing Key Header'].map((a) => <option key={a}>{a}</option>)}
          </select>
          {hkTouched && (!/^https:\/\/.+\..+/.test(hk.url.trim()) || !hk.topics.trim()) && <p className="text-[11px] font-semibold text-fail">URL https valid + topik wajib.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHkOpen(false)}>Batal</Button>
            <Button onClick={registerHook}>Daftarkan Webhook</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editHook !== null} onOpenChange={(v) => { if (!v) setEditHook(null); }}>
        <DialogContent aria-labelledby="eh-h">
          <DialogTitle id="eh-h">Ubah Topik Webhook</DialogTitle>
          <DialogDescription>{editHook !== null ? hooks[editHook].url : ''}</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="eh-t">Topik Event Terlangganan</label>
          <Input id="eh-t" value={editTopics} onChange={(e) => setEditTopics(e.target.value)} invalid={!editTopics.trim()} className="apex-id" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditHook(null)}>Batal</Button>
            <Button onClick={saveHookEdit}>Simpan Topik</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent aria-labelledby="pin-h">
          <DialogTitle id="pin-h">Secret hanya-hash</DialogTitle>
          <DialogDescription asChild>
            <div className="text-[13px] flex flex-col gap-2">
              <p>Server hanya menyimpan <span className="apex-id">sha256(secret) + last4</span> — full plaintext can never be recovered after first display.</p>
              {shownOnce ? (
                <p className="rounded border border-pass bg-pass-bg p-2 apex-id text-xs break-all" role="status">In-session plaintext: {shownOnce}</p>
              ) : (
                <p className="text-muted">Tidak ada plaintext dalam sesi — rotasi untuk melihat yang baru sekali.</p>
              )}
            </div>
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPinOpen(false)}>Tutup</Button>
            <Button onClick={() => { setPinOpen(false); void rotate(); }} disabled={setBusy}>Rotate &amp; Show Once</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent aria-labelledby="iss-h">
          <DialogTitle id="iss-h">Terbitkan Kredensial API Baru</DialogTitle>
          <DialogDescription>Kunci kripto-acak · ditampilkan sekali — salin segera.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="iss-n">Nama kredensial (wajib)</label>
          <Input id="iss-n" value={issueName} onChange={(e) => setIssueName(e.target.value)} invalid={issueTouched && !issueName.trim()} placeholder="mis. Kumpulan tablet rooftop" />
          {issueTouched && !issueName.trim() && <p className="text-[11px] font-semibold text-fail">Nama wajib diisi.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIssueOpen(false)}>Batal</Button>
            <Button onClick={issue}>Generate &amp; Terbitkan</Button>
          </div>
        </DialogContent>
      </Dialog>

            <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
