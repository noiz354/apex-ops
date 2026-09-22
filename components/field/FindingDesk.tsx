'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Busy = null | 'convert' | 'dismiss' | 'pm';


interface LiveFinding { status: 'OPEN' | 'CONVERTED' | 'DISMISSED'; convertedWoNumber: string | null }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || !body?.ok) {
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const message = body?.error?.message ?? 'Unexpected server error';
    throw new Error(`${code}: ${message}`);
  }
  return body.data as T;
}

const BOM = [
  { sku: 'PART-SEAL-8821', desc: 'Silicon Carbide Shaft Seal Assembly 2.5"', qty: '1 ea', bin: 'CRIB-B / Bay 01', cost: '$1,450.00' },
  { sku: 'PART-LUB-09', desc: 'Synthetic POE Refrigeration Lubricant ISO 68', qty: '1 pail (5 gal)', bin: 'CRIB-CHEM / Rack 02', cost: '$195.00' },
];

const OTHERS = [
  { id: 'FND-2026-0185', title: 'Emergency Starter Battery Bank Float Voltage', asset: 'AST-GEN-001', meta: '21.4 VDC vs 24.0 nominal · T. Chen · INS-2026-0409 · 2h ago' },
  { id: 'FND-2026-0182', title: 'Static Differential Pressure Across Stage 2 Filter', asset: 'AST-ENV-108', meta: '340 Pa vs 280 max · E. Voronova · INS-2026-0415 · 4h ago' },
];

export function FindingDesk() {
  const { toasts, push, dismiss } = useToasts(9000);
  const [loto, setLoto] = useState(false);
  const [live, setLive] = useState<LiveFinding | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [reason, setReason] = useState('');


  const refreshLive = async () => {
    const data = await api<{ rows: (LiveFinding & { number: string })[] }>('/api/findings');
    const row = data.rows.find((r) => r.number === 'FND-2026-0188');
    if (!row) throw new Error(`NOT_IN_LIST: ${'FND-2026-0188'} missing from GET /api/findings`);
    setLive({ status: row.status, convertedWoNumber: row.convertedWoNumber });
  };

  useEffect(() => {
    refreshLive().catch((e: Error) => setLiveError(e.message));
  }, []);

  const converted = live?.status === 'CONVERTED';
  const dismissed = live?.status === 'DISMISSED';
  const terminal = converted || dismissed;
  const actionsDisabled = live === null || busy !== null || terminal;

  const doConvert = async () => {
    if (live === null || busy !== null || terminal || !loto) return;
    setBusy('convert');
    try {
      const data = await api<{ finding: LiveFinding; wo: { number: string } }>(
        `/api/findings/${'FND-2026-0188'}/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ woPriority: 'P1', reason: `Auto-dispatched from ${'FND-2026-0188'} conversion desk`, lotoConfirmed: loto }),
        },
      );
      setLive({ status: data.finding.status, convertedWoNumber: data.finding.convertedWoNumber });
      push(true, 'WO terkirim otomatis', `${data.wo.number} dibuat dari FND-2026-0188 · lihat Work Order.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Convert failed';
      if (msg.startsWith('ALREADY_CONVERTED')) {
        try { await refreshLive(); } catch { /* keep stale live, toast explains */ }
        push(false, 'Sudah dikonversi', `FND-2026-0188 sudah dikonversi di server. Status disinkron ulang.`);
      } else {
        push(false, 'Konversi gagal', msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const doDismiss = async () => {
    if (reason.trim().length < 10 || live === null || busy !== null || terminal) return;
    setBusy('dismiss');
    try {
      const data = await api<{ finding: LiveFinding }>(
        `/api/findings/${'FND-2026-0188'}/dismiss`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ justification: reason.trim() }),
        },
      );
      setDismissOpen(false);
      setLive({ status: data.finding.status, convertedWoNumber: data.finding.convertedWoNumber });
      push(true, 'Temuan ditutup', `FND-2026-0188 ditutup dengan justifikasi · tercatat di audit ledger.`);
    } catch (e) {
      push(false, 'Penutupan gagal', e instanceof Error ? e.message : 'Penutupan gagal');
    } finally {
      setBusy(null);
    }
  };

  const doSchedulePm = async () => {
    if (busy !== null) return;
    setBusy('pm');
    try {
      const rule = await api<{ id: string }>(
        '/api/preventive-maintenance',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `PM rutin draf dari FND-2026-0188`,
            assetCode: 'AST-HVAC-004',
            intervalDays: 90,
          }),
        },
      );
      push(true, 'PM dijadwalkan', `Rule PM rutin ${rule.id} dibuat untuk AST-HVAC-004 · interval 90 hari.`);
    } catch (e) {
      push(false, 'Penjadwalan PM gagal', e instanceof Error ? e.message : 'Penjadwalan PM gagal');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/field/audits">Inspeksi Lapangan</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">Temuan</span>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{'FND-2026-0188'}</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="fnd-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="fail">GAGAL KRITIS</Badge>
              <Badge variant="fail">WAJIB OSHA</Badge>
              <Badge variant="warn">SLA: TRIASE &lt;30 mnt</Badge>
              {live === null && <Badge variant="info">MEMUAT STATUS…</Badge>}
              {converted && live?.convertedWoNumber && <Badge variant="pass">TERKONVERSI → {live.convertedWoNumber}</Badge>}
              {converted && !live?.convertedWoNumber && <Badge variant="pass">TERKONVERSI</Badge>}
              {dismissed && <Badge variant="info">DITUTUP</Badge>}
              {live?.status === 'OPEN' && <Badge variant="info">TRIASE AKTIF</Badge>}
            </div>
            <h1 id="fnd-title" className="text-2xl font-semibold tracking-tight">
              Segel Mekanis Primer Jalur Refrigeran <span className="apex-id text-cobalt font-semibold">{'FND-2026-0188'}</span>
            </h1>
            <p className="text-[13px] text-muted">
              <Link className="apex-id text-cobalt font-semibold hover:underline" href={`/assets/${'AST-HVAC-004'}`}>{'AST-HVAC-004'}</Link>
              {' '}· Chiller Sentrifugal Unit 04 (Mech B-204 Basement) · 22 mnt lalu · M. Kowalski (Lead Tech) via{' '}
              <Link className="apex-id text-cobalt font-semibold hover:underline" href={`/field/audits/${'INS-2026-0412'}/run`}>{'INS-2026-0412'}</Link>
            </p>
            <p className="text-[13px] flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-surface-subtle">
                Aturan Triase <strong className="apex-id">#HVAC-LEAK-R134A</strong> · bocor &gt;10ppm → Darurat P1
              </span>
              <Badge variant="pass">DITEGAKKAN</Badge>
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {liveError && (
              <p className="text-[11px] font-semibold text-fail max-w-64">
                Status live tidak tersedia ({liveError}) — aksi dinonaktifkan sampai server merespons.
              </p>
            )}
            <Button onClick={doConvert} disabled={actionsDisabled || !loto}>
              {busy === 'convert' && 'Mengirim…'}
              {busy !== 'convert' && converted && 'Terkirim ✓'}
              {busy !== 'convert' && dismissed && 'Temuan ditutup'}
              {busy !== 'convert' && !terminal && 'Konversi Temuan ke WO & Kirim Otomatis'}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={doSchedulePm} disabled={busy !== null}>
                {busy === 'pm' ? 'Menjadwal…' : 'Jadwalkan PM Rutin'}
              </Button>
              <Dialog open={dismissOpen} onOpenChange={setDismissOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={actionsDisabled}>Tutup Temuan</Button>
                </DialogTrigger>
                <DialogContent aria-labelledby="dismiss-h">
                  <DialogTitle id="dismiss-h">Tutup FND-2026-0188</DialogTitle>
                  <DialogDescription>Penutupan butuh justifikasi tertulis. Ditulis ke audit ledger sebagai FINDING_DISMISS.</DialogDescription>
                  <label className="apex-id font-bold" htmlFor="dismiss-reason">Justifikasi (min 10 karakter)</label>
                  <textarea
                    id="dismiss-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full p-3 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt"
                    placeholder="mis. Duplikat paket bukti FND-2026-0188…"
                  />
                  {reason.length > 0 && reason.trim().length < 10 && (
                    <p className="text-[11px] font-semibold text-fail">Justifikasi terlalu pendek — kurang {10 - reason.trim().length} karakter.</p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setDismissOpen(false)}>Batal</Button>
                    <Button variant="destructive" onClick={doDismiss} disabled={reason.trim().length < 10 || busy !== null}>
                      {busy === 'dismiss' ? 'Menutup…' : 'Konfirmasi Tutup'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {!loto && !terminal && live !== null && (
              <p className="text-[11px] font-semibold text-warn">Konversi terkunci — akui penegakan LOTO di bawah.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <h2 className="text-base font-semibold">Catatan Temuan</h2>
            <dl className="text-[13px] grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted">Dicatat</dt><dd className="font-semibold">Hari ini 14:15 WIB</dd>
              <dt className="text-muted">Auditor Tersertifikasi</dt><dd className="font-semibold">M. Kowalski (Cert #882)</dd>
              <dt className="text-muted">Tier Aset</dt><dd className="font-semibold">Tier 1 Misi Kritis</dd>
              <dt className="text-muted">Tag Lokasi</dt><dd className="font-semibold">Mech Room B-204 / Pad 4</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <h2 className="text-base font-semibold">Kriteria vs Aktual</h2>
            <p className="text-[13px]"><strong className="text-pass">Nominal:</strong> hermetic seal integrity, 0.0 ppm R-134a threshold, flange torqued to 45 Nm.</p>
            <p className="text-[13px]"><strong className="text-fail">Actual:</strong> sniffer alarmed at <span className="apex-id font-bold">18.4 ppm R-134a</span>; oil emulsion weeping lower flange; slight bearing chirping on off-load spin down.</p>
          </div>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Foto Bukti</h2>
            <Badge variant="pass">SHA-256 TERVERIFIKASI</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded bg-slate900 text-white flex items-center justify-center"><Camera size={22} /></span>
            <div className="text-[13px]">
              <p className="apex-id font-bold">PHOTO_CHILLER4_SEAL.RAW</p>
              <p className="text-muted">GPS 0.7893°S 113.9213°E ±1m · 14:20 WIB</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary" className="ml-auto">Lihat Spesimen Penuh</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="spec-h">
                <DialogTitle id="spec-h">PHOTO_CHILLER4_SEAL.RAW</DialogTitle>
                <DialogDescription>GPS 0.7893°S 113.9213°E · SHA-256 7f8c92a10b48… · 14:20 WIB</DialogDescription>
                <div className="rounded bg-slate900 text-white p-8 flex flex-col items-center gap-2 text-center">
                  <Camera size={44} />
                  <p className="text-sm font-bold">Rembesan flensa · kuadran bawah</p>
                  <p className="text-xs text-white/70">Emulsi oli + overlay GPS</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Profil Dispatch WO Otomatis <span className="apex-id text-muted font-normal">VIA TEMPLATE #WO-HVAC-LEAK</span></h2>
            <Badge variant="fail">P1 · SCORE 94/100</Badge>
          </div>
          {/* BR-09: the WO-type radio was removed — it never reached the
              server (selection had zero effect). Convert always creates a
              corrective-action WO; priority comes from woPriority. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
            <div className="rounded border border-border-subtle bg-card p-3"><p className="apex-label-caps text-muted">Lead Teknisi</p><p className="font-semibold">Marcus Kowalski · HVAC Master</p><Badge variant="pass">AVAILABLE</Badge></div>
            <div className="rounded border border-border-subtle bg-card p-3"><p className="apex-label-caps text-muted">Target Selesai SLA</p><p className="font-semibold">Hari ini 18:15 WIB (SLA 4 jam)</p><p className="text-muted text-xs">Mandat OSHA Clean Air Containment</p></div>
            <div className="rounded border border-border-subtle bg-card p-3"><p className="apex-label-caps text-muted">Judul &amp; Lingkup</p><p className="font-semibold">Primary Shaft Mechanical Seal Replacement</p><p className="text-muted text-xs">45 Nm torque · POE lube · purge cert</p></div>
          </div>
          {busy === 'convert' && (
            <div className="h-2 rounded bg-surface-subtle overflow-hidden" role="status" aria-label="Dispatching">
              <div className="h-full w-2/3 bg-cobalt rounded animate-pulse" />
            </div>
          )}
          {converted && live?.convertedWoNumber && (
            <p className="text-[13px] font-semibold text-pass">
              Dikirim sebagai <Link className="apex-id underline" href={`/work-orders/${live.convertedWoNumber}`}>{live.convertedWoNumber}</Link> · tercatat di audit ledger.
            </p>
          )}
          {dismissed && (
            <p className="text-[13px] font-semibold text-muted">
              FND-2026-0188 ditutup dengan justifikasi · tercatat di audit ledger. Final — tidak ada aksi lagi.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
          <h2 className="text-base font-semibold">Spare Part Auto-Staging (BOM) <span className="text-xs font-normal text-muted">— semua baris di Central Crib</span></h2>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-muted border-b border-border-subtle"><th className="py-1 font-semibold">Part ID / SKU</th><th className="font-semibold">Deskripsi</th><th className="font-semibold">Jml</th><th className="font-semibold">Bin</th><th className="text-right font-semibold">Est. Biaya</th></tr></thead>
            <tbody>
              {BOM.map((b) => (
                <tr key={b.sku} className="border-b border-surface-subtle">
                  <td className="py-1.5 apex-id font-bold text-cobalt">{b.sku}</td>
                  <td>{b.desc}</td><td>{b.qty}</td><td className="apex-id">{b.bin}</td>
                  <td className="text-right apex-id font-bold">{b.cost}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="py-1.5 text-right apex-label-caps text-muted">Total BOM</td><td className="text-right apex-id font-bold">$1,645.00</td></tr>
            </tbody>
          </table>
          <label className="flex items-start gap-2 text-[13px] bg-card border border-border-subtle rounded p-3 cursor-pointer">
            <input type="checkbox" checked={loto} onChange={(e) => setLoto(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#1E40AF]" />
            <span><strong>Tegakkan LOTO 480V 3-Fasa Wajib.</strong> <span className="text-muted">Teknisi tidak bisa menutup/mensertifikasi WO tanpa voucher lock dual-key + sertifikat purge gas sniffer.</span></span>
          </label>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
          <h2 className="text-base font-semibold">Temuan Aktif Lain</h2>
          <ul className="flex flex-col divide-y divide-surface-subtle text-[13px]">
            {OTHERS.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between gap-2">
                <span><span className="apex-id font-bold text-cobalt">{o.id}</span> · <span className="apex-id">{o.asset}</span> · <strong>{o.title}</strong> <span className="text-muted">— {o.meta}</span></span>
                <Link className="text-cobalt font-semibold hover:underline shrink-0" href={`/field/findings/${o.id}`}>Triase →</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
