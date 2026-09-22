'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, BellRing, ClipboardCheck, Download, Eye, LoaderCircle, Lock, Moon, Radio, Settings2, ShoppingCart, UserPlus, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON, canonPhone } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { useSlaStream } from '@/lib/realtime/useSlaStream';

type Cls = 'Critical' | 'Stock' | 'PO' | 'WO' | 'Security';
type Sev = 'P1' | 'P2' | 'P3';

interface AlertT {
  id: string; cls: Cls; sev: Sev; kick: string; time: string; title: string;
  lines: string[]; body: string;
}

const SEED: AlertT[] = [
  {
    id: 'ALT-P1-0894', cls: 'Critical', sev: 'P1', kick: 'SLA KRITIS TERANCAM · Prioritas 1', time: '6 mnt lalu',
    title: 'Perbaikan Seal Kompresor Chiller #04',
    lines: ['tersisa 42 mnt hingga breach SLA 4 jam', 'Ditugaskan: Marcus Kowalski', 'Zona: Plant Room B-204 (CUP)', 'Telemetry Node: 10.14.8.22', 'Model Sensor: FLIR-TG550'],
    body: `Kebocoran refrigeran terdeteksi 18,4 ppm (ambang: 10,0 ppm). Sensor ultrasonik ${CANON.assetSeal} memicu urutan eskalasi dispatch otomatis.`,
  },
  {
    id: 'ALT-PO-0314', cls: 'PO', sev: 'P2', kick: 'PERLU PERSETUJUAN PO · $2,900.00 USD', time: '24 mnt lalu',
    title: 'Kit Seal Poros Silicon Carbide (Paket 2)',
    lines: ['Vendor: Trane EarthWise Supply', 'Pemohon: — (endorsement ganda plant tercatat)', 'Anggaran: CUP Capex (tersisa $64,2k)', 'Cocok 3-Arah Terverifikasi'],
    body: 'Endorsement teknis ganda selesai oleh Plant Engineering. Menunggu otorisasi final dari Marcus Vance (VP Operasi) untuk melepas requisition ke broker purchasing.',
  },
  {
    id: 'ALT-STK-SEAL', cls: 'Stock', sev: 'P2', kick: `${CANON.sealSku} · Di Bawah Stok Pengaman`, time: '1 jam lalu',
    title: 'Seal Poros Silicon Carbide 2,5 inci',
    lines: ['On-Hand: 2 ea · Reserved: 1 ea · Net Tersedia: 1 ea (Ambang Min: 4 ea)', `Bin: ${CANON.sealBin}`, 'Draft reorder otomatis PR-2026-0315 disiapkan untuk 10 unit via katalog Trane Supply @ $1.450,00/unit'],
    body: 'Net tersedia (1 ea) di bawah ambang pengaman 4 ea — jalur kritis untuk pekerjaan seal chiller.',
  },
  {
    id: 'ALT-WO-0898', cls: 'WO', sev: 'P2', kick: 'WORK ORDER DIDISPATCH · WO-2026-0898 · Prioritas 2 Rutin', time: '1 jam 40 mnt lalu',
    title: 'Kalibrasi Aktuator Damper VAV Box AHU-02',
    lines: ['Teknisi Lead: Elena Voronova', 'Lokasi: Substation East Wing (Atap)', 'Window Eksekusi: Hari ini 15:30 WIB'],
    body: 'Checklist audit drift sensor kuartalan tertaut. Tanda tangan digital Job Safety Analysis (JSA) pra-kerja menunggu sign-in lapangan dari perangkat teknisi.',
  },
  {
    id: 'AUDIT-EVT-9042', cls: 'Security', sev: 'P3', kick: 'OVERRIDE KEBIJAKAN KEAMANAN · AUDIT-EVT-9042 · Akses Di Luar Jam', time: '14:15 UTC',
    title: 'Bypass Akses Fisik & SCADA Diberikan',
    lines: ['Aktor Resmi: David Chen (Engineering Manager)', 'Terminal Target: HVC-ENG-02', 'Durasi: batas sesi 90 mnt'],
    body: 'Override elevasi dieksekusi untuk sesi diagnostik chiller darurat setelah alert P1. Kunci keamanan hardware multi-faktor dikonfirmasi di port terminal.',
  },
];

const TABS: { n: string; c?: string; f: Cls | 'All' }[] = [
  { n: 'Semua Alert', f: 'All' },
  { n: 'Breach Kritis', c: '12', f: 'Critical' },
  { n: 'Stok & Crib', f: 'Stock' },
  { n: 'Persetujuan PO', f: 'PO' },
  { n: 'Sistem & Keamanan', f: 'Security' },
];

interface Route { cls: string; note: string; app: boolean; email: boolean; sms: boolean; locked?: boolean }

const ROUTES_SEED: Route[] = [
  { cls: 'SLA Kritis & Keselamatan', note: 'P1 Terkunci', app: true, email: true, sms: true, locked: true },
  { cls: 'Dispatch & Status WO', note: 'Live · Digest Shift', app: true, email: true, sms: false },
  { cls: 'Pemicu Inventaris & Stok', note: 'Harian 08:00', app: true, email: false, sms: false },
  { cls: 'Persetujuan PO & Capex', note: 'Push · Push (MENDESAK)', app: true, email: false, sms: true },
  { cls: 'Override Keamanan & RBAC', note: 'Ringkasan Mingguan', app: true, email: true, sms: false },
];

const TECHS = ['Marcus Kowalski (HVAC Lead)', 'Elena Voronova (SCADA)', 'Sarah Al-Mansoor (Life Safety)', 'D. Osei (Shift B relief)'];


const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function NotificationsHub() {
  const [extra, setExtra] = useState<AlertT[]>([]);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<string>('Semua Alert');
  const [sev, setSev] = useState('Semua Level');
  const [q, setQ] = useState('');
  const { toasts, push, dismiss } = useToasts(8000);
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
        push(true, 'Oto-eskalasi', 'P1 tak diack melewati window · eskalasi dicatat (tanpa integrasi pager).');
      }
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  });



  const { snapshot, state: sseState, error: sseError } = useSlaStream(true);

  const liveAlerts: AlertT[] = snapshot
    ? snapshot.notifications.map((n) => ({
        id: n.id,
        cls: 'WO' as Cls,
        sev: n.severity,
        kick: `PANTAU SLA · ${n.severity} STREAM LANGSUNG`,
        time: new Date(n.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        title: n.title,
        lines: [n.subtitle, `Snapshot: ${snapshot.snapshotAt.slice(11, 19)} WIB-lokal`],
        body: `Dihitung server-side dari sla_due_at untuk scope organisasi. Refresh stream: otomatis.`,
      }))
    : [];
  const liveWoKeys = new Set(liveAlerts.map((a) => a.id.replace('NOTIF-', '')));
  const seedNotSuperseded = SEED.filter((s) =>
    ![...liveWoKeys].some((wo) => s.title.includes(wo) || s.body.includes(wo)),
  );

  const alerts = [...extra, ...liveAlerts, ...seedNotSuperseded];
  const marked = Object.keys(read).length;
  const unread = Math.max(0, 38 - marked);
  const filtered = useMemo(() => alerts.filter((a) => {
    const t = TABS.find((x) => x.n === tab);
    if (t && t.f !== 'All' && a.cls !== t.f) return false;
    if (sev !== 'Semua Level' && a.sev !== sev) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${a.id} ${a.title} ${a.body} ${a.lines.join(' ')}`.toLowerCase().includes(needle);
  }), [extra, snapshot, tab, sev, q]);

  const markAll = () => {
    const r: Record<string, boolean> = {};
    alerts.forEach((a) => { r[a.id] = true; });
    setRead(r);
    push(true, 'Semua dibaca', '38 alert ditandai dibaca · timer eskalasi dibersihkan.');
  };

  const flipRoute = (i: number, ch: 'app' | 'email' | 'sms') => {
    if (routes[i].locked) {
      push(false, 'P1 Terkunci', 'Routing SLA Kritis & Keselamatan dipaksa ON oleh kebijakan.');
      return;
    }
    setRoutes((r) => r.map((x, j) => (j === i ? { ...x, [ch]: !x[ch] } : x)));
    push(true, 'Routing diperbarui', `${routes[i].cls} · ${ch.toUpperCase()} → ${!routes[i][ch] ? 'ON' : 'OFF'}.`);
  };

  const injectTest = () => {
    if (extra.length >= 3) {
      push(false, 'Bus penuh', 'Maks 3 alert uji sintetis — bersihkan bus dulu.');
      return;
    }
    const n = testSeq.current++;
    setExtra((e) => [{
      id: `TEST-P1-${n}`, cls: 'Critical', sev: 'P1', kick: 'UJI SINTETIS · Prioritas 1', time: 'baru saja',
      title: `Probe debugger bus #${n} — alarm telemetri P1 sintetis`,
      lines: ['Kanal: sintetis lokal (hanya client-side)', 'Tidak ada dispatch — hanya debugger'],
      body: 'Alarm sintetis disuntik via Active Bus Debugger untuk memvalidasi pemicu dispatch end-to-end.',
    }, ...e]);
    push(true, 'Uji P1 disuntik', `TEST-P1-${n} di bus live · pemicu tervalidasi.`);
  };

  const authorize = () => {
    setPoTouched(true);
    if (poPin.trim() !== '2468') return;
    setPoState('authorized');
    setPoOpen(false);
    setPoPin('');
    setPoTouched(false);
    push(true, 'PO diotorisasi', 'PR-2026-0314 → rilis PO · countersign Vance · broker diberi tahu.');
  };

  const reject = () => {
    setRejTouched(true);
    if (rejReason.trim().length < 10) return;
    setPoState('rejected');
    setRejOpen(false);
    setRejReason('');
    setRejTouched(false);
    push(true, 'PO ditolak', 'PR-2026-0314 dikembalikan ke Plant Engineering dengan justifikasi.');
  };

  const [busyExport, setBusyExport] = useState(false);
  const exportLog = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [
        ['id', 'class', 'severity', 'time', 'title', 'state'],
        ...filtered.map((a) => [a.id, a.cls, a.sev, a.time, a.title, read[a.id] ? 'read' : 'unread']),
      ];
      await exportTableCsv('notifications-log.csv', table);
      push(true, 'Log diekspor', `${filtered.length} alert → notifications-log.csv.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const sevTone = (s: Sev) => (s === 'P1' ? 'fail' : s === 'P2' ? 'warn' : 'info');

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Hub Notifikasi &amp; Alert SLA</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="not-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">Station AST-ENG-HUB-04 · Jam Sepi: 00:00 - 06:00</p>
            <h1 id="not-h" className="text-2xl font-semibold tracking-tight">Hub Notifikasi &amp; Alert SLA</h1>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={markAll}><BellRing size={16} /> Tandai Semua Dibaca</Button>
            <Button variant="secondary" onClick={exportLog} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor Log (CSV)</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Alert Belum Dibaca', v: String(unread), s: 'Menunggu triase · 8 P1 Kritis · 14 Ops · 16 Info' },
            { l: 'Ancaman Breach SLA', v: 'SEGERA', s: `Di bawah 60 mnt ke Breach · Tertinggi: ${CANON.workOrderSeal} · Margin 42 mnt` },
            { l: 'Menunggu Sign-Off', v: '2', s: 'Butuh Auth VP · PR-2026-0314 + Hot Work Permit Plant B' },
            { l: 'Telemetri Kanal', v: '99,98%', s: 'Bus aplikasi 100% aktif · SMTP operasional · SMS siaga (0 antrean)' },
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
            <div className="flex flex-wrap gap-2" role="group" aria-label="Kelas alert">
              {TABS.map((t) => (
                <button key={t.n} type="button" onClick={() => setTab(t.n)} aria-pressed={tab === t.n} className={cn('h-8 px-3 rounded text-xs font-semibold border', tab === t.n ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                  {t.n}{t.c ? ` ${t.c}` : ''}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Input id="ntf-q" name="ntf-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter alert… (⌘/)" aria-label="Filter alert" />
              </div>
              <select id="ntf-sev" name="ntf-sev" value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Filter severity" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {['Semua Level', 'P1', 'P2', 'P3'].map((s) => <option key={s}>{s === 'Semua Level' ? 'Severity: Semua Level' : s === 'P1' ? 'P1 Alert Kritis' : s === 'P2' ? 'P2 Peringatan Mendesak' : 'P3 Info Operasional'}</option>)}
              </select>
            </div>
            <ol className="flex flex-col gap-2">
              {filtered.map((a) => (
                <li key={a.id} className={cn('rounded-lg border bg-card p-3 flex flex-col gap-1.5 text-[13px]', a.sev === 'P1' && !read[a.id] ? 'border-fail' : 'border-border-subtle')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={sevTone(a.sev)}>{a.sev}</Badge>
                    <span className="font-bold">{a.kick}</span>
                    <span className="text-muted">· {a.time}</span>
                    {read[a.id] ? <Badge variant="hold">DIBACA</Badge> : (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs ml-auto" onClick={() => setRead((r) => ({ ...r, [a.id]: true }))}>Tandai dibaca</button>
                    )}
                  </div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <ul className="text-muted text-xs flex flex-col gap-0.5">
                    {a.lines.map((l) => <li key={l}>· {l}</li>)}
                  </ul>
                  <p>{a.body}</p>
                  {a.id === 'ALT-P1-0894' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link href={`/work-orders/${CANON.workOrderSeal}`}><Button variant="secondary"><Eye size={15} /> Lihat Work Order</Button></Link>
                      <Button variant="secondary" disabled={escalated !== 'idle'} onClick={() => { setEscalated('manual'); push(true, 'Tereskalasi', 'Eskalasi dicatat · bridge tidak dibuka (tanpa integrasi pager).'); }}>
                        <Zap size={15} /> {escalated === 'idle' ? 'Eskalasi ke Eng Mgr' : escalated === 'manual' ? 'Tereskalasi ✓' : 'Oto-eskalasi ✓'}
                      </Button>
                      <Dialog open={backupOpen} onOpenChange={setBackupOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><UserPlus size={15} /> Dispatch Backup Tech</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="bk-h">
                          <DialogTitle id="bk-h">Dispatch Teknisi Cadangan</DialogTitle>
                          <DialogDescription>Memanggil teknisi cadangan ke Plant Room B-204.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="bk-tech">Teknisi cadangan</label>
                          <select id="bk-tech" name="bk-tech" value={backup} onChange={(e) => setBackup(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                            {TECHS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setBackupOpen(false)}>Batal</Button>
                            <Button onClick={() => { setBackupOpen(false); push(true, 'Dispatch cadangan dicatat', `${backup} dispatch dicatat · teknisi tidak di-page (tanpa integrasi dispatch).`); }}>Catat Dispatch</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <span className="apex-id text-xs font-bold text-fail ml-auto" role="timer">Oto-eskalasi dalam {fmt(countdown)}</span>
                    </div>
                  )}
                  {a.id === 'ALT-PO-0314' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {poState === 'pending' ? <Badge variant="warn">MENUNGGU AUTH VP</Badge> : poState === 'authorized' ? <Badge variant="pass">DIOTORISASI ✓</Badge> : <Badge variant="fail">DITOLAK</Badge>}
                      <Dialog open={poOpen} onOpenChange={setPoOpen}>
                        <DialogTrigger asChild>
                          <Button disabled={poState !== 'pending'}><Zap size={15} /> Otorisasi PO Sekali Klik</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="po-h">
                          <DialogTitle id="po-h">Otorisasi PR-2026-0314 · $2.900,00</DialogTitle>
                          <DialogDescription>Otorisasi VP final — PIN approver wajib.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="po-pin">PIN Approver — M. Vance (demo: 2468)</label>
                          <Input id="po-pin" name="po-pin" type="password" inputMode="numeric" autoComplete="off" value={poPin} onChange={(e) => setPoPin(e.target.value)} invalid={poTouched && poPin.trim() !== '2468'} />
                          {poTouched && poPin.trim() !== '2468' && <p className="text-[11px] font-semibold text-fail">PIN Approver 2468 wajib.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setPoOpen(false)}>Batal</Button>
                            <Button onClick={authorize}>Otorisasi $2.900,00</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><Eye size={15} /> Tinjau Cocok 3-Arah</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="m3-h">
                          <DialogTitle id="m3-h">Cocok 3-Arah — PR-2026-0314</DialogTitle>
                          <DialogDescription>Verified · variance $0.00.</DialogDescription>
                          <ul className="text-[13px] flex flex-col gap-1">
                            <li className="flex justify-between"><span>PO {CANON.purchaseOrder} · 2 kits × $1,450.00</span><Badge variant="pass">MATCH</Badge></li>
                            <li className="flex justify-between"><span>GRN-9941 · +2 kits posted {CANON.sealBin}</span><Badge variant="pass">MATCH</Badge></li>
                            <li className="flex justify-between"><span>CUP Capex envelope · $64,200.00</span><Badge variant="pass">FUNDED</Badge></li>
                          </ul>
                          <div className="flex justify-end"><Button variant="secondary" onClick={() => setMatchOpen(false)}>Tutup</Button></div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={rejOpen} onOpenChange={setRejOpen}>
                        <DialogTrigger asChild>
                          <Button variant="destructive" disabled={poState !== 'pending'}>Reject Justification</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="rej-h">
                          <DialogTitle id="rej-h">Tolak PR-2026-0314</DialogTitle>
                          <DialogDescription>Mengembalikan requisition ke Plant Engineering.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="rej-r">Justifikasi (min 10 karakter)</label>
                          <textarea id="rej-r" name="rej-r" rows={2} value={rejReason} onChange={(e) => setRejReason(e.target.value)} className="w-full p-3 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt" />
                          {rejTouched && rejReason.trim().length < 10 && <p className="text-[11px] font-semibold text-fail">Min 10 karakter wajib.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setRejOpen(false)}>Batal</Button>
                            <Button variant="destructive" onClick={reject}>Konfirmasi Tolak</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'ALT-STK-SEAL' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {reorderOk && <Badge variant="pass">REORDER DISETUJUI ✓</Badge>}
                      <ConfirmDialog title="Otorisasi reorder otomatis (10 ea)?" description="PR-2026-0315 · 10 kit seal × $1.450,00 = $14.500,00 via katalog Trane Supply." confirmLabel="Setujui $14.500,00" onConfirm={() => { setReorderOk(true); push(true, 'Reorder disetujui', 'PR-2026-0315 · 10 ea · broker mengisi draft PO.'); }}>
                        <Button disabled={reorderOk}><ShoppingCart size={15} /> Otorisasi Reorder Otomatis (10 ea)</Button>
                      </ConfirmDialog>
                      <Link href="/inventory"><Button variant="secondary">Lihat Ledger Inventaris</Button></Link>
                      <Dialog open={trOpen} onOpenChange={setTrOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><ArrowLeftRight size={15} /> Transfer dari Central Crib</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="tr-h">
                          <DialogTitle id="tr-h">Transfer dari Central Crib</DialogTitle>
                          <DialogDescription>Langkah lateral darurat untuk menutup gap keamanan.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="tr-q">Kuantitas (ea, ≥ 1)</label>
                          <Input id="tr-q" inputMode="numeric" value={trQty} onChange={(e) => setTrQty(e.target.value)} invalid={trTouched && !(parseInt(trQty, 10) >= 1)} />
                          {trTouched && !(parseInt(trQty, 10) >= 1) && <p className="text-[11px] font-semibold text-fail">Jml ≥ 1 wajib.</p>}
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setTrOpen(false)}>Batal</Button>
                            <Button onClick={() => { setTrTouched(true); if (!(parseInt(trQty, 10) >= 1)) return; setTrOpen(false); setTrTouched(false); push(true, 'Transfer disiapkan', `${trQty} ea ${CANON.sealSku} · Central → CRIB-B · kurir ETA 40 mnt.`); }}>Siapkan Transfer</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'ALT-WO-0898' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted">Lead: <strong>{lead}</strong></span>
                      <Link href={`/field/audits/${CANON.inspection}/run`}><Button variant="secondary"><ClipboardCheck size={15} /> Lihat Checklist Lapangan</Button></Link>
                      <Dialog open={reOpen} onOpenChange={setReOpen}>
                        <DialogTrigger asChild>
                          <Button variant="secondary"><UserPlus size={15} /> Tugaskan Ulang Teknisi</Button>
                        </DialogTrigger>
                        <DialogContent aria-labelledby="re-h">
                          <DialogTitle id="re-h">Tugaskan Ulang WO-2026-0898</DialogTitle>
                          <DialogDescription>Menyerahkan window kalibrasi ke lead lain.</DialogDescription>
                          <label className="text-xs font-semibold" htmlFor="re-tech">Teknisi lead</label>
                          <select id="re-tech" name="re-tech" value={lead} onChange={(e) => setLead(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                            {TECHS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setReOpen(false)}>Batal</Button>
                            <Button onClick={() => { setReOpen(false); push(true, 'Teknisi ditugaskan ulang', `WO-2026-0898 → ${lead} · JSA diterbitkan ulang.`); }}>Konfirmasi Tugaskan Ulang</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                  {a.id === 'AUDIT-EVT-9042' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {revoked ? <Badge variant="fail">SESI DICABUT</Badge> : <Badge variant="warn">BYPASS AKTIF</Badge>}
                      <Link href="/audit-trail"><Button variant="secondary"><Eye size={15} /> Lihat Log Audit Trace</Button></Link>
                      <ConfirmDialog title="Cabut sesi bypass ini?" description="HVC-ENG-02 · David Chen · bypass SCADA di luar jam. Terminasi segera + dicatat." confirmLabel="Cabut Sesi" onConfirm={() => { setRevoked(true); push(true, 'Sesi dicabut', 'Bypass HVC-ENG-02 diterminasi · perlu re-auth.'); }}>
                        <Button variant="destructive" disabled={revoked}><Lock size={15} /> Cabut Sesi Aktif</Button>
                      </ConfirmDialog>
                    </div>
                  )}
                </li>
              ))}
              {filtered.length === 0 && <li className="text-sm text-muted p-4 text-center">Tidak ada alert di tampilan ini.</li>}
            </ol>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2"><Settings2 size={16} /> Preferensi &amp; Routing</h2>
                <span className="apex-id text-xs text-muted">Matriks v4</span>
              </div>
              <p className="apex-label-caps text-muted">Routing Kanal per Kelas Alert</p>
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
              <h2 className="text-base font-semibold">Mesin Rule Eskalasi</h2>
              <p><strong>Eskalasi 15-Menit Belum Dibaca</strong> — route otomatis alert P1 Kritis yang tak diack ke VP Operasi Piket dan Direktur Fasilitas via broadcast SMS darurat.</p>
              <p>Target Saat Ini: <strong>Marcus Vance ({canonPhone('mobile')})</strong> <span className="text-[10px] text-muted">C19 — +1 fixed</span></p>
              <Button variant="secondary" onClick={() => { setEscalateOn((v) => !v); push(true, escalateOn ? 'Rule dijeda' : 'Rule disiagakan', `eskalasi 15-menit ${escalateOn ? 'dijeda' : 'disiagakan'} · target M. Vance.`); }}>
                {escalateOn ? 'Jeda Rule' : 'Siagakan Rule'}
              </Button>
              <div className="rounded border border-border-subtle bg-card p-2">
                <p className="font-semibold flex items-center gap-2"><Moon size={14} /> Kebijakan Auto-Mute Shift</p>
                <p className="text-muted text-xs">Senyapkan notifikasi non-kritis di luar Shift A ({CANON.shiftA}) kecuali alarm Darurat P1 dan shut-off chiller.</p>
                <p className="mt-1">Jadwal Aktif: <strong>{muteOn ? 'Mode Shift A' : 'Tanpa mute (semua jam)'}</strong></p>
                <Button variant="secondary" onClick={() => { setMuteOn((v) => !v); push(true, muteOn ? 'Auto-mute mati' : 'Auto-mute nyala', muteOn ? 'Kirim semua jam.' : 'Non-kritis disenyapkan di luar Shift A.'); }}>
                  {muteOn ? 'Matikan Mute' : 'Nyalakan Mute'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 text-[13px]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2"><Radio size={16} /> Debugger Bus Aktif</h2>
                <span className="apex-id text-xs text-pass font-bold">SSE: {sseState === 'live' ? 'live' : sseState === 'fallback-polling' ? 'polling-30s' : sseState}</span>
              </div>
              <p className="text-muted">Suntik alarm telemetri P1 sintetis real-time ke bus pesan live untuk menguji pemicu dispatch.</p>
              <Button onClick={injectTest}><Zap size={15} /> Picu Alert Uji P1 (simulasi)</Button>
              <p className="text-xs text-muted">
                Transport:{' '}
                {sseState === 'live'
                  ? `SSE live stream — ${snapshot?.totalAtRisk ?? 0} SLA berisiko event server nyata · snapshot ${snapshot?.snapshotAt.slice(11, 19)}`
                  : sseState === 'fallback-polling'
                    ? 'Polling 30s (SSE tak tersedia) — fallback jujur'
                    : sseState === 'connecting'
                      ? 'Menghubungkan ke SSE stream…'
                      : 'Siaga'}
                {' · '}{extra.length}/3 sintetis di bus
                {sseError ? ` · ${sseError}` : ''}
              </p>
            </div>

            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2 text-[13px]">
              <h2 className="text-base font-semibold">Tingkat Kepatuhan SLA 24 Jam</h2>
              <p><strong className="text-lg">98,4%</strong> <span className="text-muted">Target</span></p>
              {[['Shift A', '100'], ['Shift B', '97.2'], ['Shift C', '98.0']].map(([s, v]) => (
                <div key={s}>
                  <div className="flex justify-between"><span>{s}</span><strong>{v}% tercapai</strong></div>
                  <div className="h-2 rounded bg-surface-subtle overflow-hidden mt-0.5" role="img" aria-label={`${s} ${v} persen`}>
                    <div className={cn('h-full', Number(v) >= 99 ? 'bg-pass' : 'bg-warn')} style={{ width: `${v}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
