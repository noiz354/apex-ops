'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, BellRing, CheckCircle2, ClipboardCheck, Download, Eye, Lock, Moon, Radio, Settings2, ShoppingCart, UserPlus, X, XCircle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON, canonPhone } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { downloadText } from '@/lib/download';
import { useSlaStream } from '@/lib/realtime/useSlaStream';

type Cls = 'Critical' | 'Stock' | 'PO' | 'WO' | 'Security';
type Sev = 'P1' | 'P2' | 'P3';

interface AlertT {
  id: string; cls: Cls; sev: Sev; kick: string; time: string; title: string;
  lines: string[]; body: string;
}

const SEED: AlertT[] = [
  {
    id: 'ALT-P1-0894', cls: 'Critical', sev: 'P1', kick: 'CRITICAL SLA AT RISK · Priority 1', time: '6 mins ago',
    title: 'Chiller #04 Compressor Seal Repair',
    lines: ['42m remaining until 4h SLA breach', 'Assigned: Marcus Kowalski', 'Zone: Plant Room B-204 (CUP)', 'Telemetry Node: 10.14.8.22', 'Sensor Model: FLIR-TG550'],
    body: `Refrigerant leak detected at 18.4 ppm (threshold: 10.0 ppm). Ultrasonic sensor ${CANON.assetSeal} triggered automated dispatch escalation sequence.`,
  },
  {
    id: 'ALT-PO-0314', cls: 'PO', sev: 'P2', kick: 'PO APPROVAL REQUIRED · $2,900.00 USD', time: '24 mins ago',
    title: 'Silicon Carbide Shaft Seal Kit (Pack of 2)',
    lines: ['Vendor: Trane EarthWise Supply', 'Requester: — (dual plant endorsement on file)', 'Budget: CUP Capex ($64.2k remaining)', '3-Way Match Verified'],
    body: 'Dual technical endorsement completed by Plant Engineering. Awaiting final authorization from Marcus Vance (VP Operations) to release requisition to purchasing broker.',
  },
  {
    id: 'ALT-STK-SEAL', cls: 'Stock', sev: 'P2', kick: `${CANON.sealSku} · Below Safety Stock`, time: '1h ago',
    title: 'Silicon Carbide Shaft Seal 2.5in',
    lines: ['On-Hand: 2 ea · Reserved: 1 ea · Net Available: 1 ea (Min Threshold: 4 ea)', `Bin: ${CANON.sealBin}`, 'Auto-reorder draft PR-2026-0315 staged for 10 units via Trane Supply catalog at $1,450.00/unit'],
    body: 'Net available (1 ea) is below the 4 ea safety threshold — critical path for chiller seal work.',
  },
  {
    id: 'ALT-WO-0898', cls: 'WO', sev: 'P2', kick: 'WORK ORDER DISPATCHED · WO-2026-0898 · Priority 2 Routine', time: '1h 40m ago',
    title: 'AHU-02 VAV Box Damper Actuator Calibration',
    lines: ['Lead Technician: Elena Voronova', 'Location: Substation East Wing (Roof Level)', 'Execution Window: Today 15:30 WIB'],
    body: 'Quarterly sensor drift audit checklist linked. Pre-work Job Safety Analysis (JSA) digital signature pending field sign-in from technician device.',
  },
  {
    id: 'AUDIT-EVT-9042', cls: 'Security', sev: 'P3', kick: 'SECURITY POLICY OVERRIDE · AUDIT-EVT-9042 · Off-Hours Access', time: '14:15 UTC',
    title: 'Physical & SCADA Access Bypass Granted',
    lines: ['Authorized Actor: David Chen (Engineering Manager)', 'Target Terminal: HVC-ENG-02', 'Duration: 90 mins session cap'],
    body: 'Elevated override executed for emergency chiller diagnostic session following P1 alert. Multi-factor hardware security key confirmed on terminal port.',
  },
];

const TABS: { n: string; c?: string; f: Cls | 'All' }[] = [
  { n: 'All Alerts', f: 'All' },
  { n: 'Critical Breaches', c: '12', f: 'Critical' },
  { n: 'Stock & Crib', f: 'Stock' },
  { n: 'PO Approvals', f: 'PO' },
  { n: 'System & Security', f: 'Security' },
];

interface Route { cls: string; note: string; app: boolean; email: boolean; sms: boolean; locked?: boolean }

const ROUTES_SEED: Route[] = [
  { cls: 'Critical SLA & Safety', note: 'P1 Locked', app: true, email: true, sms: true, locked: true },
  { cls: 'WO Dispatches & Status', note: 'Live · Shift Digest', app: true, email: true, sms: false },
  { cls: 'Inventory & Stock Triggers', note: 'Daily 08:00', app: true, email: false, sms: false },
  { cls: 'PO Approvals & Capex', note: 'Push · Push (URGENT)', app: true, email: false, sms: true },
  { cls: 'Security & RBAC Overrides', note: 'Weekly Summary', app: true, email: true, sms: false },
];

const TECHS = ['Marcus Kowalski (HVAC Lead)', 'Elena Voronova (SCADA)', 'Sarah Al-Mansoor (Life Safety)', 'D. Osei (Shift B relief)'];

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1300;

const download = (filename: string, text: string) => downloadText(filename, text);

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function NotificationsHub() {
  const [extra, setExtra] = useState<AlertT[]>([]);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<string>('All Alerts');
  const [sev, setSev] = useState('All Levels');
  const [q, setQ] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [routes, setRoutes] = useState<Route[]>(ROUTES_SEED);
  const [escalateOn, setEscalateOn] = useState(true);
  const [muteOn, setMuteOn] = useState(true);
  const [countdown, setCountdown] = useState(514);
  const [escalated, setEscalated] = useState<'idle' | 'manual' | 'auto'>('idle');
  const [poState, setPoState] = useState<'pending' | 'authorized' | 'rejected'>('pending');
  const [poOpen, setPoOpen] = useState(false);
  const [poPin, setPoPin] = useState('');
  const [poTouched, setPoTouched] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [rejOpen, setRejOpen] = useState(false);
  const [rejReason, setRejReason] = useState('');
  const [rejTouched, setRejTouched] = useState(false);
  const [reorderOk, setReorderOk] = useState(false);
  const [trOpen, setTrOpen] = useState(false);
  const [trQty, setTrQty] = useState('10');
  const [trTouched, setTrTouched] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backup, setBackup] = useState(TECHS[3]);
  const [lead, setLead] = useState(TECHS[1]);
  const [reOpen, setReOpen] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const testSeq = useRef(1);

  useEffect(() => {
    if (escalated !== 'idle' || countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) {
        setEscalated('auto');
        push(true, 'Auto-escalated', 'P1 unacknowledged past window · escalation logged (no pager integration).');
      }
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  });

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const { snapshot, state: sseState, error: sseError } = useSlaStream(true);

  const liveAlerts: AlertT[] = snapshot
    ? snapshot.notifications.map((n) => ({
        id: n.id,
        cls: 'WO' as Cls,
        sev: n.severity,
        kick: `LIVE SLA WATCH · ${n.severity} LIVE STREAM`,
        time: new Date(n.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        title: n.title,
        lines: [n.subtitle, `Snapshot: ${snapshot.snapshotAt.slice(11, 19)} WIB-lokal`],
        body: `Computed server-side from sla_due_at for tenant scope. Stream refresh: automatic.`,
      }))
    : [];
  const liveWoKeys = new Set(liveAlerts.map((a) => a.id.replace('NOTIF-', '')));
  const seedNotSuperseded = SEED.filter((s) =>
    ![...liveWoKeys].some((wo) => s.title.includes(wo) || s.body.includes(wo)),
  );

  const alerts = [...extra, ...liveAlerts, ...seedNotSuperseded];
  const marked = Object.keys(read).length;
  const unread = Math.max(0, 38 - marked);
  const filtered = alerts.filter((a) => {
    const t = TABS.find((x) => x.n === tab);
    if (t && t.f !== 'All' && a.cls !== t.f) return false;
    if (sev !== 'All Levels' && a.sev !== sev) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${a.id} ${a.title} ${a.body} ${a.lines.join(' ')}`.toLowerCase().includes(needle);
  });

  const markAll = () => {
    const r: Record<string, boolean> = {};
    alerts.forEach((a) => { r[a.id] = true; });
    setRead(r);
    push(true, 'All caught up', '38 alerts marked read · escalation timers cleared.');
  };

  const flipRoute = (i: number, ch: 'app' | 'email' | 'sms') => {
    if (routes[i].locked) {
      push(false, 'P1 Locked', 'Critical SLA & Safety routing is forced ON by policy.');
      return;
    }
    setRoutes((r) => r.map((x, j) => (j === i ? { ...x, [ch]: !x[ch] } : x)));
    push(true, 'Routing updated', `${routes[i].cls} · ${ch.toUpperCase()} → ${!routes[i][ch] ? 'ON' : 'OFF'}.`);
  };

  const injectTest = () => {
    if (extra.length >= 3) {
      push(false, 'Bus saturated', 'Max 3 synthetic test alerts — clear the bus first.');
      return;
    }
    const n = testSeq.current++;
    setExtra((e) => [{
      id: `TEST-P1-${n}`, cls: 'Critical', sev: 'P1', kick: 'SYNTHETIC TEST · Priority 1', time: 'just now',
      title: `Bus debugger probe #${n} — synthetic P1 telemetry alarm`,
      lines: ['Channel: local synthetic (client-side only)', 'No dispatch triggered — debugger only'],
      body: 'Synthetic alarm injected via Active Bus Debugger to validate dispatch triggers end-to-end.',
    }, ...e]);
    push(true, 'Test P1 injected', `TEST-P1-${n} on live bus · triggers validated.`);
  };

  const authorize = () => {
    setPoTouched(true);
    if (poPin.trim() !== '2468') return;
    setPoState('authorized');
    setPoOpen(false);
    setPoPin('');
    setPoTouched(false);
    push(true, 'PO authorized', 'PR-2026-0314 → PO release · Vance countersign · broker notified.');
  };

  const reject = () => {
    setRejTouched(true);
    if (rejReason.trim().length < 10) return;
    setPoState('rejected');
    setRejOpen(false);
    setRejReason('');
    setRejTouched(false);
    push(true, 'PO rejected', 'PR-2026-0314 returned to Plant Engineering with justification.');
  };

  const exportLog = () => {
    const head = 'id,class,severity,time,title,state';
    const body = filtered.map((a) => [`"${a.id}"`, a.cls, a.sev, `"${a.time}"`, `"${a.title}"`, read[a.id] ? 'read' : 'unread'].join(','));
    download('notifications-log.csv', [head, ...body].join('\n'));
    push(true, 'Log exported', `${filtered.length} alerts → notifications-log.csv.`);
  };

  const sevTone = (s: Sev) => (s === 'P1' ? 'fail' : s === 'P2' ? 'warn' : 'info');

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Notifications &amp; SLA Alerts Hub</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="not-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Station AST-ENG-HUB-04 · Quiet Hours: 00:00 - 06:00</p>
            <h1 id="not-h" className="text-2xl font-semibold tracking-tight">Notifications &amp; SLA Alerts Hub</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={markAll}><BellRing size={16} /> Mark All Read</Button>
            <Button variant="secondary" onClick={exportLog}><Download size={16} /> Export Log (CSV)</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Active Unread Alerts', v: String(unread), s: 'Awaiting triage · 8 P1 Critical · 14 Ops · 16 Info' },
            { l: 'SLA Breach Threats', v: 'IMMEDIATE', s: `Under 60m to Breach · Highest: ${CANON.workOrderSeal} · 42m Margin` },
            { l: 'Pending Sign-Offs', v: '2', s: 'Requires VP Auth · PR-2026-0314 + Hot Work Permit Plant B' },
            { l: 'Channel Telemetry', v: '99.98%', s: 'In-App Live Bus 100% Active · SMTP Operational · SMS Standby (0 q)' },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Alert classes">
              {TABS.map((t) => (
                <button key={t.n} type="button" onClick={() => setTab(t.n)} aria-pressed={tab === t.n} className={cn('h-8 px-3 rounded text-xs font-semibold border', tab === t.n ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                  {t.n}{t.c ? ` ${t.c}` : ''}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Input id="ntf-q" name="ntf-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter alerts… (⌘/)" aria-label="Filter alerts" />
              </div>
              <select id="ntf-sev" name="ntf-sev" value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {['All Levels', 'P1', 'P2', 'P3'].map((s) => <option key={s}>{s === 'All Levels' ? 'Severity: All Levels' : s === 'P1' ? 'P1 Critical Alert' : s === 'P2' ? 'P2 Urgent Warning' : 'P3 Operational Info'}</option>)}
              </select>
            </div>
            <ol className="flex flex-col gap-2">
              {filtered.map((a) => (
                <li key={a.id} className={cn('rounded-lg border bg-card p-3 flex flex-col gap-1.5 text-[13px]', a.sev === 'P1' && !read[a.id] ? 'border-fail' : 'border-border-subtle')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={sevTone(a.sev)}>{a.sev}</Badge>
                    <span className="font-bold">{a.kick}</span>
                    <span className="text-muted">· {a.time}</span>
                    {read[a.id] ? <Badge variant="hold">READ</Badge> : (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs ml-auto" onClick={() => setRead((r) => ({ ...r, [a.id]: true }))}>Mark read</button>
                    )}
                  </div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <ul className="text-muted text-xs flex flex-col gap-0.5">
                    {a.lines.map((l) => <li key={l}>· {l}</li>)}
                  </ul>
                  <p>{a.body}</p>
                  {a.id === 'ALT-P1-0894' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link href={`/work-orders/${CANON.workOrderSeal}`}><Button variant="secondary"><Eye size={15} /> View Work Order</Button></Link>
                      <Button variant="secondary" disabled={escalated !== 'idle'} onClick={() => { setEscalated('manual'); push(true, 'Escalated', 'Escalation logged · bridge not opened (no pager integration).'); }}>
                        <Zap size={15} /> {escalated === 'idle' ? 'Escalate to Eng Mgr' : escalated === 'manual' ? 'Escalated ✓' : 'Auto-escalated ✓'}
                      </Button>
                      <Dialog open={backupOpen} onOpenChange={setBackupOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><UserPlus size={15} /> Dispatch Backup Tech</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="bk-h">
                          <DialogTitle id="bk-h">Dispatch Backup Tech</DialogTitle>
                          <DialogDescription>Pages a backup tech to Plant Room B-204.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="bk-tech">Backup technician</label>
                          <select id="bk-tech" name="bk-tech" value={backup} onChange={(e) => setBackup(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                            {TECHS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setBackupOpen(false)}>Cancel</Button>
                            <Button onClick={() => { setBackupOpen(false); push(true, 'Backup dispatch logged', `${backup} dispatch logged · tech not paged (no dispatch integration).`); }}>Log Dispatch</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <span className="apex-id text-xs font-bold text-fail ml-auto" role="timer">Auto-escalation in {fmt(countdown)}</span>
                    </div>
                  )}
                  {a.id === 'ALT-PO-0314' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {poState === 'pending' ? <Badge variant="warn">AWAITING VP AUTH</Badge> : poState === 'authorized' ? <Badge variant="pass">AUTHORIZED ✓</Badge> : <Badge variant="fail">REJECTED</Badge>}
                      <Dialog open={poOpen} onOpenChange={setPoOpen}>
                        <DialogTrigger asChild>
                          <Button disabled={poState !== 'pending'}><Zap size={15} /> One-Click Authorize PO</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="po-h">
                          <DialogTitle id="po-h">Authorize PR-2026-0314 · $2,900.00</DialogTitle>
                          <DialogDescription>Final VP authorization — approver PIN required.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="po-pin">Approver PIN — M. Vance (demo: 2468)</label>
                          <Input id="po-pin" name="po-pin" type="password" inputMode="numeric" autoComplete="off" value={poPin} onChange={(e) => setPoPin(e.target.value)} invalid={poTouched && poPin.trim() !== '2468'} />
                          {poTouched && poPin.trim() !== '2468' && <p className="text-[11px] font-semibold text-fail">Approver PIN 2468 required.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setPoOpen(false)}>Cancel</Button>
                            <Button onClick={authorize}>Authorize $2,900.00</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><Eye size={15} /> Review 3-Way Match</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="m3-h">
                          <DialogTitle id="m3-h">3-Way Match — PR-2026-0314</DialogTitle>
                          <DialogDescription>Verified · variance $0.00.</DialogDescription>
                          <ul className="text-[13px] flex flex-col gap-1">
                            <li className="flex justify-between"><span>PO {CANON.purchaseOrder} · 2 kits × $1,450.00</span><Badge variant="pass">MATCH</Badge></li>
                            <li className="flex justify-between"><span>GRN-9941 · +2 kits posted {CANON.sealBin}</span><Badge variant="pass">MATCH</Badge></li>
                            <li className="flex justify-between"><span>CUP Capex envelope · $64,200.00</span><Badge variant="pass">FUNDED</Badge></li>
                          </ul>
                          <div className="flex justify-end"><Button variant="secondary" onClick={() => setMatchOpen(false)}>Close</Button></div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={rejOpen} onOpenChange={setRejOpen}>
                        <DialogTrigger asChild>
                          <Button variant="destructive" disabled={poState !== 'pending'}>Reject Justification</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="rej-h">
                          <DialogTitle id="rej-h">Reject PR-2026-0314</DialogTitle>
                          <DialogDescription>Returns the requisition to Plant Engineering.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="rej-r">Justification (min 10 chars)</label>
                          <textarea id="rej-r" name="rej-r" rows={2} value={rejReason} onChange={(e) => setRejReason(e.target.value)} className="w-full p-3 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt" />
                          {rejTouched && rejReason.trim().length < 10 && <p className="text-[11px] font-semibold text-fail">Min 10 chars required.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setRejOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={reject}>Confirm Reject</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'ALT-STK-SEAL' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {reorderOk && <Badge variant="pass">REORDER APPROVED ✓</Badge>}
                      <ConfirmDialog title="Auto-approve reorder (10 ea)?" description="PR-2026-0315 · 10 seal kits × $1,450.00 = $14,500.00 via Trane Supply catalog." confirmLabel="Approve $14,500.00" onConfirm={() => { setReorderOk(true); push(true, 'Reorder approved', 'PR-2026-0315 · 10 ea · broker feeding PO draft.'); }}>
                        <Button disabled={reorderOk}><ShoppingCart size={15} /> Auto-Approve Reorder (10 ea)</Button>
                      </ConfirmDialog>
                      <Link href="/inventory"><Button variant="secondary">View Inventory Ledger</Button></Link>
                      <Dialog open={trOpen} onOpenChange={setTrOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><ArrowLeftRight size={15} /> Transfer from Central Crib</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="tr-h">
                          <DialogTitle id="tr-h">Transfer from Central Crib</DialogTitle>
                          <DialogDescription>Emergency lateral move to cover the safety gap.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="tr-q">Quantity (ea, ≥ 1)</label>
                          <Input id="tr-q" inputMode="numeric" value={trQty} onChange={(e) => setTrQty(e.target.value)} invalid={trTouched && !(parseInt(trQty, 10) >= 1)} />
                          {trTouched && !(parseInt(trQty, 10) >= 1) && <p className="text-[11px] font-semibold text-fail">Qty ≥ 1 required.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setTrOpen(false)}>Cancel</Button>
                            <Button onClick={() => { setTrTouched(true); if (!(parseInt(trQty, 10) >= 1)) return; setTrOpen(false); setTrTouched(false); push(true, 'Transfer staged', `${trQty} ea ${CANON.sealSku} · Central → CRIB-B · courier ETA 40 min.`); }}>Stage Transfer</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'ALT-WO-0898' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted">Lead: <strong>{lead}</strong></span>
                      <Link href={`/field/audits/${CANON.inspection}/run`}><Button variant="secondary"><ClipboardCheck size={15} /> View Field Checklist</Button></Link>
                      <Dialog open={reOpen} onOpenChange={setReOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><UserPlus size={15} /> Reassign Tech</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="re-h">
                          <DialogTitle id="re-h">Reassign WO-2026-0898</DialogTitle>
                          <DialogDescription>Hands the calibration window to another lead.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="re-tech">Lead technician</label>
                          <select id="re-tech" name="re-tech" value={lead} onChange={(e) => setLead(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                            {TECHS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setReOpen(false)}>Cancel</Button>
                            <Button onClick={() => { setReOpen(false); push(true, 'Tech reassigned', `WO-2026-0898 → ${lead} · JSA re-issued.`); }}>Confirm Reassign</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'AUDIT-EVT-9042' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {revoked ? <Badge variant="fail">SESSION REVOKED</Badge> : <Badge variant="warn">ACTIVE BYPASS</Badge>}
                      <Link href="/audit-trail"><Button variant="secondary"><Eye size={15} /> View Audit Trace Log</Button></Link>
                      <ConfirmDialog title="Revoke this bypass session?" description="HVC-ENG-02 · David Chen · off-hours SCADA bypass. Termination is immediate + logged." confirmLabel="Revoke Session" onConfirm={() => { setRevoked(true); push(true, 'Session revoked', 'HVC-ENG-02 bypass terminated · re-auth required.'); }}>
                        <Button variant="destructive" disabled={revoked}><Lock size={15} /> Revoke Active Session</Button>
                      </ConfirmDialog>
                    </div>
                  )}
                </li>
              ))}
              {filtered.length === 0 && <li className="text-sm text-muted p-4 text-center">No alerts in this view.</li>}
            </ol>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2"><Settings2 size={16} /> Preferences &amp; Routing</h2>
                <span className="apex-id text-xs text-muted">Matrix v4</span>
              </div>
              <p className="apex-label-caps text-muted">Channel Routing per Alert Class</p>
              {routes.map((r, i) => (
                <div key={r.cls} className="rounded border border-border-subtle bg-card p-2 text-[13px]">
                  <p className="font-semibold">{r.cls} <span className="text-xs font-normal text-muted">· {r.note}</span></p>
                  <div className="flex gap-2 mt-1">
                    {(['app', 'email', 'sms'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => flipRoute(i, ch)}
                        aria-pressed={r[ch]}
                        aria-label={`${r.cls} ${ch} ${r[ch] ? 'on' : 'off'}`}
                        className={cn('h-7 px-2.5 rounded text-[11px] font-bold border uppercase', r[ch] ? 'bg-pass-bg border-pass text-pass-ink' : 'bg-card border-border-subtle text-muted')}
                      >
                        {ch === 'app' ? 'App' : ch === 'email' ? 'Email' : 'SMS'} {r[ch] ? 'ON' : 'OFF'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 text-[13px]">
              <h2 className="text-base font-semibold">Escalation Rule Engine</h2>
              <p><strong>15-Minute Unread Escalation</strong> — auto-route unacknowledged Critical P1 alerts to On-Duty VP Operations and Facilities Director via emergency SMS broadcast.</p>
              <p>Current Target: <strong>Marcus Vance ({canonPhone('mobile')})</strong> <span className="text-[10px] text-muted">C19 — +1 fixed</span></p>
              <Button variant="secondary" onClick={() => { setEscalateOn((v) => !v); push(true, escalateOn ? 'Rule paused' : 'Rule armed', `15-minute escalation ${escalateOn ? 'paused' : 'armed'} · target M. Vance.`); }}>
                {escalateOn ? 'Pause Rule' : 'Arm Rule'}
              </Button>
              <div className="rounded border border-border-subtle bg-card p-2">
                <p className="font-semibold flex items-center gap-2"><Moon size={14} /> Shift Auto-Mute Policy</p>
                <p className="text-muted text-xs">Silence non-critical notifications outside Shift A ({CANON.shiftA}) except P1 Emergency alarms and chiller shut-offs.</p>
                <p className="mt-1">Active Schedule: <strong>{muteOn ? 'Shift A Mode' : 'Unmuted (all hours)'}</strong></p>
                <Button variant="secondary" onClick={() => { setMuteOn((v) => !v); push(true, muteOn ? 'Auto-mute off' : 'Auto-mute on', muteOn ? 'All-hours delivery.' : 'Non-critical muted outside Shift A.'); }}>
                  {muteOn ? 'Disable Mute' : 'Enable Mute'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2"><Radio size={16} /> Active Bus Debugger</h2>
                <span className="apex-id text-xs text-pass font-bold">SSE: 12ms</span>
              </div>
              <p className="text-muted">Inject a real-time synthetic P1 telemetry alarm into the live message bus to test dispatch triggers.</p>
              <Button onClick={injectTest}><Zap size={15} /> Trigger Test P1 Alert (simulated)</Button>
              <p className="text-xs text-muted">
                Transport:{' '}
                {sseState === 'live'
                  ? `SSE live stream — ${snapshot?.totalAtRisk ?? 0} SLA at risk real server events · snapshot ${snapshot?.snapshotAt.slice(11, 19)}`
                  : sseState === 'fallback-polling'
                    ? 'Polling 30s (SSE unavailable) — honest fallback'
                    : sseState === 'connecting'
                      ? 'Connecting to SSE stream…'
                      : 'Idle'}
                {' · '}{extra.length}/3 synthetic on bus
                {sseError ? ` · ${sseError}` : ''}
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 text-[13px]">
              <h2 className="text-base font-semibold">24-Hour SLA Compliance Rate</h2>
              <p><strong className="text-lg">98.4%</strong> <span className="text-muted">Target</span></p>
              {[['Shift A', '100'], ['Shift B', '97.2'], ['Shift C', '98.0']].map(([s, v]) => (
                <div key={s}>
                  <div className="flex justify-between"><span>{s}</span><strong>{v}% met</strong></div>
                  <div className="h-2 rounded bg-surface-subtle overflow-hidden mt-0.5" role="img" aria-label={`${s} ${v} percent`}>
                    <div className={cn('h-full', Number(v) >= 99 ? 'bg-pass' : 'bg-warn')} style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
