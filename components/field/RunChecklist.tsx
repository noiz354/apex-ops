'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowLeft, Camera, CloudUpload, Image as ImageIcon, Lock, Mic, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import { prepareEvidence, toEvidenceFormData } from '@/lib/media/evidence';
import { formatCoords, getCurrentCoords } from '@/lib/platform/geolocation';
import { haptic } from '@/lib/platform/haptics';
import { createScreenWakeLock } from '@/lib/platform/wake-lock';
import { FieldOffline } from './FieldOffline';
import { FieldToasts, useFieldToasts } from './toasts';

const wibNow = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const DEFAULT_GPS = '0.7893°S 113.9213°E (site default)';
const READING_RE = /^\d+(\.\d+)?$/;

interface ServerInspection {
  number: string;
  progressPct: number;
  status: string;
}

export function RunChecklist({ auditId, evidenceWoNumber = 'WO-2026-0894' }: { auditId: string; evidenceWoNumber?: string }) {
  const { toasts, push } = useFieldToasts();
  const [verdict, setVerdict] = useState<'FAIL' | 'PASS-OVERRIDE'>('FAIL');
  const [reading, setReading] = useState('18.4');
  const [lotoOpen, setLotoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceState, setVoiceState] = useState('Belum ada catatan suara');
  const [photoState, setPhotoState] = useState('Belum ada foto — ulangi untuk mengambil + mengunggah.');
  const [iotState, setIotState] = useState('118 PSI · bacaan demo (tidak disimpan)');
  const [iotBusy, setIotBusy] = useState(false);
  const [note, setNote] = useState(
    'Pelanggaran 18,4 ppm melebihi batas run-check 5 ppm. Penggantian Seal PART-SEAL-8821 + dispatch WO disarankan.'
  );
  const [techNotes, setTechNotes] = useState(
    'Rembesan berat terlihat di sekitar housing seal poros. Disarankan segera ganti PART-SEAL-8821 sebelum shift berakhir.'
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [autosave, setAutosave] = useState('Ledger server');
  const [gpsText, setGpsText] = useState(DEFAULT_GPS);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wl = createScreenWakeLock();
    void wl.acquire();
    return () => { void wl.release(); };
  }, []);

  useEffect(() => {
    let live = true;
    void getCurrentCoords().then((c) => {
      if (live && c) setGpsText(`${formatCoords(c)} (device)`);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    void apiFetch<{ rows: ServerInspection[] }>('/api/inspections')
      .then((res) => {
        if (!live) return;
        const row = res.rows.find((r) => r.number === auditId);
        if (!row) return;
        setServerStatus(row.status);
        if (row.status.toUpperCase() === 'COMPLETED') setSubmitted(true);
      })
      .catch(() => { /* offline — run tetap bisa diisi, submit antre gagal jujur */ });
    return () => { live = false; };
  }, [auditId]);

  const readingOk = READING_RE.test(reading.trim());
  const noteOk = note.trim().length > 0;
  const guardOk = readingOk && noteOk;

  const markDirty = () => setAutosave('Ada perubahan belum tersimpan');

  const onFail = () => {
    haptic.fail();
    setVerdict('FAIL');
    markDirty();
    push(true, 'Verdict tercatat (lokal)', `Langkah 02 FAIL · tersimpan ke server saat submit · GPS ${gpsText}`);
  };

  const onPassOverride = () => {
    haptic.pass();
    setVerdict('PASS-OVERRIDE');
    markDirty();
    push(true, 'Verdict tercatat (lokal)', 'PASS OVERRIDE dinilai sendiri · tersimpan ke server saat submit. Tanpa countersign supervisor.');
  };

  const onVoice = () => {
    if (recording) {
      setRecording(false);
      setVoiceState('Catatan Suara Tersimpan · 0:12 · hanya di perangkat ini (tidak disinkron)');
      markDirty();
      push(true, 'Catatan Suara Tersimpan', '0:12 terlampir di Langkah 02 (lokal perangkat).');
    } else {
      setRecording(true);
      setVoiceState('Merekam… 0:07');
    }
  };

  const onRetake = () => {
    if (evidenceUploading) return;
    photoInputRef.current?.click();
  };

  const onPickEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || evidenceUploading) return;
    setEvidenceUploading(true);
    let prepared: Awaited<ReturnType<typeof prepareEvidence>> | null = null;
    try {
      prepared = await prepareEvidence(f);
      setPhotoState(`Mengunggah ${prepared.fileName} · GPS ${gpsText}…`);
      const ev = await apiFetch<{ id: string }>(
        `/api/work-orders/${evidenceWoNumber}/evidence/upload`,
        { method: 'POST', body: toEvidenceFormData(prepared), timeoutMs: 60_000 },
      );
      prepared.release();
      setPhotoState(`2 frame terlampir · terakhir diunggah ${wibNow()} WIB · sha256 terverifikasi (${ev.id.slice(0, 8)})`);
      markDirty();
      haptic.pass();
      push(true, 'Bukti terunggah', 'Server menghitung ulang SHA-256 — hash cocok, bukti tersegel.');
    } catch (err) {
      prepared?.release();
      haptic.fail();
      setPhotoState('Unggah gagal — frame TIDAK tersimpan. Ulangi saat koneksi pulih.');
      push(false, 'Unggah bukti gagal', err instanceof ApiError ? `${err.message} (${err.code})` : 'Kegagalan unggah tak diketahui.');
    } finally {
      setEvidenceUploading(false);
    }
  };

  const iotTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (iotTimer.current !== null) window.clearTimeout(iotTimer.current);
  }, []);
  const onIot = () => {
    if (iotBusy) return;
    setIotBusy(true);
    setIotState('Membaca gateway Modbus (demo — tanpa PLC live)…');
    iotTimer.current = window.setTimeout(() => {
      setIotBusy(false);
      setIotState('118 PSI · bacaan demo (tidak disimpan)');
      push(true, 'Bacaan demo ditampilkan', 'Telemetri live terpisah — nilai ini tidak disimpan.');
    }, 800);
  };

  const onSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      const data = await apiFetch<{ number: string; status: string; progressPct: number }>(
        `/api/inspections/${auditId}/progress`,
        { method: 'POST', body: { progressPct: 100, status: 'COMPLETED', verdict } },
      );
      setSubmitted(true);
      setServerStatus(data.status);
      setAutosave(`Tersimpan ${wibNow()} WIB`);
      haptic.pass();
      push(true, 'Run tercatat', `${data.number} → ${data.status} (dikonfirmasi server).`);
      document.getElementById('finding-capture')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      haptic.fail();
      push(false, 'Submit gagal — run TIDAK tercatat', err instanceof ApiError ? `${err.message} (${err.code})` : 'Kegagalan submit tak diketahui.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="no-print fixed top-7 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b-2 border-slate900">
        <div className="px-4 py-2 flex flex-col gap-1 max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2">
            <Link href="/field/audits" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Kembali ke audit">
              <ArrowLeft size={24} />
            </Link>
            <div className="flex-1 min-w-0 text-center">
              <p className="apex-id font-bold">{auditId}</p>
              <p className="text-sm text-muted truncate">Run-Check Chiller Mingguan · Chiller #04</p>
            </div>
            <Link href="/field/sync" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Status sinkron">
              <CloudUpload size={24} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted whitespace-nowrap">Langkah 2 dari 4 (65%)</span>
            <span className="flex-1 h-3 rounded-full bg-surface-subtle border border-border-strong overflow-hidden">
              <span className="block h-full bg-pass rounded-full" style={{ width: `${65}%` }} />
            </span>
            <span className="text-xs text-pass font-bold whitespace-nowrap" role="status">{autosave}</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 pt-[172px] flex flex-col gap-4">
        <FieldOffline />

        {/* STEP 01 LOTO */}
        <section className="rounded border-2 border-pass bg-white overflow-hidden" aria-label="Langkah 1 LOTO">
          <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold font-display">Langkah 01 · Lockout / Tagout</h2>
            <span className="text-xs font-bold text-pass border border-pass bg-pass-bg px-2 py-0.5 rounded">PASS TERVERIFIKASI</span>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm font-bold">Integritas Gembok LOTO</p>
            <p className="apex-id">Padlock #4092 Segel Utuh · 0,0V Terukur</p>
            <p className="text-sm text-muted">Point M-44 · Panel DP-02 · terverifikasi 08:04 WIB</p>
            <Button variant="field" className="bg-white text-body border-2 border-slate900" onClick={() => setLotoOpen(true)}>
              <ImageIcon size={20} /> Lihat Foto LOTO
            </Button>
          </div>
        </section>

        {/* STEP 02 SNIFF */}
        <section className="rounded border-2 border-fail bg-white overflow-hidden" aria-label="Langkah 2 sniff refrigerant">
          <div className="flex">
            <div className="w-2 bg-fail shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold font-display">Langkah 02 · Sniff Refrigerant</h2>
                {verdict === 'FAIL' ? (
                  <span className="text-xs font-bold text-fail border border-fail bg-fail-bg px-2 py-0.5 rounded">FAIL AKTIF</span>
                ) : (
                  <span className="text-xs font-bold text-warn border border-warn bg-warn-bg px-2 py-0.5 rounded">PASS OVERRIDE</span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-3">
                <p className="text-sm">
                  Sniffer ultrasonik berbunyi pada <strong className="apex-id text-fail">18.4 ppm R-134a</strong>. Emulsi oli terlihat di sepanjang kuadran flange bawah.{' '}
                  <span className="text-xs font-bold text-fail border border-fail px-2 py-0.5 rounded whitespace-nowrap">1 Cacat Kritis</span>
                </p>
                <div className="flex flex-col gap-1">
                  <label className="apex-id font-bold" htmlFor="reading">Bacaan (ppm)</label>
                  <input
                    id="reading"
                    type="text"
                    inputMode="decimal"
                    value={reading}
                    onChange={(e) => { setReading(e.target.value); markDirty(); }}
                    aria-invalid={!readingOk}
                    className={cn('min-h-[48px] px-3 rounded border-2 font-mono text-base outline-none focus:border-slate900', readingOk ? 'border-hold' : 'border-fail')}
                  />
                  {!readingOk && <p className="text-sm font-bold text-fail">Masukkan bacaan angka, mis. 18,4.</p>}
                </div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Lulus atau gagal langkah 2">
                  <Button variant="pass" onClick={onPassOverride}>PASS</Button>
                  <Button variant="fail" className={cn(verdict === 'FAIL' && 'ring-4 ring-slate900')} onClick={onFail}>FAIL</Button>
                </div>
                <p className="text-sm text-muted">Verdict dinilai sendiri dan tersimpan ke server saat submit. Tanpa countersign supervisor.</p>
                <div className="rounded border-2 border-border-strong overflow-hidden">
                  <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
                    <span className="apex-id font-bold">PHOTO_CHILLER4_SEAL.RAW</span>
                    <span className="text-xs">GPS {gpsText}</span>
                  </div>
                  <div className="p-3 bg-surface-subtle flex flex-col items-center gap-2 text-center">
                    <Camera size={44} className="text-muted" />
                    <p className="text-sm font-bold">Rembesan flange · stempel GPS overlay</p>
                    <Button variant="field" className="bg-slate900" onClick={onRetake} disabled={evidenceUploading}>
                      {evidenceUploading ? 'Mengunggah…' : 'Ulangi Foto'}
                    </Button>
                    <p className="text-sm text-muted" role="status">{photoState}</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      aria-label="Ambil foto bukti langkah"
                      onChange={onPickEvidence}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="field" className="bg-white text-body border-2 border-slate900" onClick={onVoice}>
                    <Mic size={20} /> {recording ? 'Berhenti Merekam' : 'Rekam Catatan Suara'}
                  </Button>
                  <p className="text-sm text-muted" role="status">{voiceState}</p>
                </div>
                <textarea
                  rows={2}
                  aria-label="Catatan teknisi"
                  value={techNotes}
                  onChange={(e) => { setTechNotes(e.target.value); markDirty(); }}
                  className="w-full p-3 bg-surface-subtle border-2 border-hold rounded text-sm outline-none focus:border-slate900"
                />
              </div>
            </div>
          </div>
        </section>

        {/* STEP 03 MODBUS */}
        <section className="rounded border-2 border-border-strong bg-white overflow-hidden" aria-label="Langkah 3 modbus">
          <div className="bg-slate900 text-white px-3 py-2">
            <h2 className="text-lg font-semibold font-display">Langkah 03 · Sinkron Bacaan Live</h2>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm">Gateway Modbus (demo — tidak terhubung) · rentang tekanan discharge 110–130 PSI</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="field" className="bg-slate900" onClick={onIot} disabled={iotBusy}>Sinkron via IoT</Button>
              <p className="font-mono text-base font-bold" role="status">{iotState}</p>
            </div>
            <p className="text-sm text-muted">Bacaan di luar batas otomatis menandai cacat. Bacaan gagal kembali ke entri manual.</p>
          </div>
        </section>

        {/* STEP 04 + FINDING */}
        <section id="finding-capture" className="rounded border-2 border-slate900 bg-white shadow-hard overflow-hidden scroll-mt-40" aria-label="Langkah 4 temuan">
          <div className="bg-slate900 text-white px-3 py-2">
            <h2 className="text-lg font-semibold font-display">Langkah 04 · Temuan &amp; Submit</h2>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm">
              Verdict FAIL membuka temuan <strong className="apex-id">FND-2026-0188</strong> (Kebocoran Refrigerant Seal Poros Utama &amp; Kontaminasi Bearing). Submit run ini mencatatnya sebagai COMPLETED di ledger inspeksi.
            </p>
            <div className="flex flex-col gap-1">
              <label className="apex-id font-bold" htmlFor="finding-note">Catatan temuan (wajib untuk submit FAIL)</label>
              <textarea
                id="finding-note"
                rows={2}
                value={note}
                onChange={(e) => { setNote(e.target.value); markDirty(); }}
                className="w-full p-3 border-2 border-hold rounded text-sm outline-none focus:border-slate900"
              />
              {!noteOk && <p className="text-sm font-bold text-fail">Catatan temuan wajib diisi sebelum submit FAIL.</p>}
            </div>
            <Link
              href={`/field/findings/${'FND-2026-0188'}`}
              className="min-h-[48px] px-4 rounded border-2 border-slate900 bg-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              Buka Meja Konversi (FND-2026-0188)
            </Link>
          </div>
        </section>
      </main>

      {/* STICKY DOCK */}
      <section className="no-print fixed bottom-20 left-0 w-full z-40 px-4" aria-label="Dock submit">
        <div className="max-w-3xl mx-auto bg-surface/95 backdrop-blur-md border-2 border-slate900 rounded shadow-hard p-3 flex flex-col gap-2">
          <p className={cn('text-sm font-bold', guardOk ? 'text-pass' : 'text-warn')} role="status">
            {guardOk ? 'Guard lolos — siap submit.' : 'Guard: bacaan + foto + catatan temuan wajib.'}
          </p>
          <Button variant="field" className="bg-slate900 min-h-[56px] text-lg disabled:opacity-40" disabled={!guardOk || submitted || submitting} onClick={() => void onSubmit()}>
            {submitted ? 'Terkirim ✓' : submitting ? 'Mencatat…' : 'Submit Run Audit'}
          </Button>
          {submitted && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-pass">Run tercatat{serverStatus ? ` · ${serverStatus} (server)` : ''}.</p>
              <div className="flex gap-2">
                <Link href={`/field/findings/${'FND-2026-0188'}`} className="flex-1 min-h-[48px] rounded bg-pass text-white text-sm font-bold inline-flex items-center justify-center">
                  Buka Meja Konversi
                </Link>
                <Link href="/field/audits" className="flex-1 min-h-[48px] rounded border-2 border-slate900 text-sm font-bold inline-flex items-center justify-center">
                  Kembali ke Audit
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* LOTO LIGHTBOX */}
      <Dialog open={lotoOpen} onOpenChange={setLotoOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70" />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <DialogPrimitive.Content className="relative w-full max-w-md bg-white rounded border-2 border-slate900 shadow-hard p-4 flex flex-col gap-2" aria-labelledby="loto-h">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <DialogTitle id="loto-h" className="text-lg font-semibold font-display">Bukti LOTO</DialogTitle>
                  <DialogDescription className="text-xs text-muted">loto_breaker_isolated.jpg · Padlock #4092</DialogDescription>
                </div>
                <DialogPrimitive.Close aria-label="Tutup" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900">
                  <X size={22} />
                </DialogPrimitive.Close>
              </div>
              <div className="rounded bg-slate900 text-white p-8 flex flex-col items-center gap-2 text-center">
                <Lock size={44} className="text-pass-dot" />
                <p className="text-sm font-bold">PASS TERVERIFIKASI — 0,0V terukur</p>
                <p className="text-xs">Point M-44 · Panel DP-02 · 08:04 WIB</p>
              </div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      </Dialog>

      <FieldToasts toasts={toasts} className="bottom-44" />
    </>
  );
}
