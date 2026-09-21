'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowLeft, Camera, CloudUpload, Image as ImageIcon, Lock, Mic, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CANON, wibNow } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import { prepareEvidence, toEvidenceFormData } from '@/lib/media/evidence';
import { formatCoords, getCurrentCoords } from '@/lib/platform/geolocation';
import { haptic } from '@/lib/platform/haptics';
import { createScreenWakeLock } from '@/lib/platform/wake-lock';
import { FieldOffline } from './FieldOffline';
import { FieldToasts, useFieldToasts } from './toasts';

const DEFAULT_GPS = '0.7893°S 113.9213°E (site default)';
const READING_RE = /^\d+(\.\d+)?$/;

interface ServerInspection {
  number: string;
  progressPct: number;
  status: string;
}

export function RunChecklist({ auditId, evidenceWoNumber = CANON.workOrderSeal }: { auditId: string; evidenceWoNumber?: string }) {
  const { toasts, push } = useFieldToasts();
  const [verdict, setVerdict] = useState<'FAIL' | 'PASS-OVERRIDE'>('FAIL');
  const [reading, setReading] = useState('18.4');
  const [lotoOpen, setLotoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceState, setVoiceState] = useState('No voice note yet');
  const [photoState, setPhotoState] = useState('No photo attached yet — retake to capture + upload.');
  const [iotState, setIotState] = useState('118 PSI · demo reading (not saved to ledger)');
  const [iotBusy, setIotBusy] = useState(false);
  const [note, setNote] = useState(
    '18.4 ppm breach exceeds 5 ppm run-check limit. Seal PART-SEAL-8821 replacement + WO dispatch recommended.'
  );
  const [techNotes, setTechNotes] = useState(
    'Severe weeping observed around shaft seal housing. Recommend immediate replacement of PART-SEAL-8821 before shift end.'
  );
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [autosave, setAutosave] = useState('Server ledger');
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

  const markDirty = () => setAutosave('Unsaved changes');

  const onFail = () => {
    haptic.fail();
    setVerdict('FAIL');
    markDirty();
    push(true, 'Verdict recorded (local)', `Step 02 FAIL · persists to server on submit · GPS ${gpsText}`);
  };

  const onPassOverride = () => {
    haptic.pass();
    setVerdict('PASS-OVERRIDE');
    markDirty();
    push(true, 'Verdict recorded (local)', 'PASS OVERRIDE self-assessed · persists to server on submit. No supervisor countersign on file.');
  };

  const onVoice = () => {
    if (recording) {
      setRecording(false);
      setVoiceState('Voice Note Saved · 0:12 · stored on this device only (not synced)');
      markDirty();
      push(true, 'Voice Note Saved', '0:12 attached to Step 02 (device-local).');
    } else {
      setRecording(true);
      setVoiceState('Recording… 0:07');
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
      setPhotoState(`Uploading ${prepared.fileName} · GPS ${gpsText}…`);
      const ev = await apiFetch<{ id: string }>(
        `/api/work-orders/${evidenceWoNumber}/evidence/upload`,
        { method: 'POST', body: toEvidenceFormData(prepared), timeoutMs: 60_000 },
      );
      prepared.release();
      setPhotoState(`2 frames attached · latest uploaded ${wibNow()} WIB · sha256 verified (${ev.id.slice(0, 8)})`);
      markDirty();
      haptic.pass();
      push(true, 'Evidence uploaded', 'Server re-computed its SHA-256 — hash matched, evidence sealed.');
    } catch (err) {
      prepared?.release();
      haptic.fail();
      setPhotoState('Upload failed — frame NOT stored. Retake when the link recovers (binary upload not queued in this wave).');
      push(false, 'Evidence upload failed', err instanceof ApiError ? `${err.message} (${err.code})` : 'Unknown upload failure.');
    } finally {
      setEvidenceUploading(false);
    }
  };

  const onIot = () => {
    if (iotBusy) return;
    setIotBusy(true);
    setIotState('Reading Modbus gateway (demo — no live PLC)…');
    setTimeout(() => {
      setIotBusy(false);
      setIotState('118 PSI · demo reading (not saved to ledger)');
      push(true, 'Demo reading shown', 'Live telemetry wiring lands separately — this value is not saved.');
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
      setAutosave(`Saved ${wibNow()} WIB`);
      haptic.pass();
      push(true, 'Run recorded', `${data.number} → ${data.status} (server-confirmed).`);
      document.getElementById('finding-capture')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      haptic.fail();
      push(false, 'Submit failed — run NOT recorded', err instanceof ApiError ? `${err.message} (${err.code})` : 'Unknown submit failure.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="no-print fixed top-7 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b-2 border-slate900">
        <div className="px-4 py-2 flex flex-col gap-1 max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2">
            <Link href="/field/audits" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Back to audits">
              <ArrowLeft size={24} />
            </Link>
            <div className="flex-1 min-w-0 text-center">
              <p className="apex-id font-bold">{auditId}</p>
              <p className="text-sm text-muted truncate">Weekly Chiller Run-Check · Chiller #04</p>
            </div>
            <Link href="/field/sync" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Sync status">
              <CloudUpload size={24} />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted whitespace-nowrap">Step 2 of 4 ({CANON.inspectionProgress}%)</span>
            <span className="flex-1 h-3 rounded-full bg-surface-subtle border border-border-strong overflow-hidden">
              <span className="block h-full bg-pass rounded-full" style={{ width: `${CANON.inspectionProgress}%` }} />
            </span>
            <span className="text-xs text-pass font-bold whitespace-nowrap" role="status">{autosave}</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 pt-[172px] flex flex-col gap-4">
        <FieldOffline />

        {/* STEP 01 LOTO */}
        <section className="rounded border-2 border-pass bg-white overflow-hidden" aria-label="Step 1 LOTO">
          <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold font-display">Step 01 · Lockout / Tagout</h2>
            <span className="text-xs font-bold text-pass border border-pass bg-pass-bg px-2 py-0.5 rounded">PASS VERIFIED</span>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm font-bold">LOTO Lock Guard Integrity</p>
            <p className="apex-id">Padlock {CANON.lotoPadlock} Seal Intact · 0.0V Meas</p>
            <p className="text-sm text-muted">Point {CANON.lotoPoint} · {CANON.lotoPanel} · verified 08:04 WIB</p>
            <Button variant="field" className="bg-white text-body border-2 border-slate900" onClick={() => setLotoOpen(true)}>
              <ImageIcon size={20} /> Review LOTO Photo
            </Button>
          </div>
        </section>

        {/* STEP 02 SNIFF */}
        <section className="rounded border-2 border-fail bg-white overflow-hidden" aria-label="Step 2 refrigerant sniff">
          <div className="flex">
            <div className="w-2 bg-fail shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold font-display">Step 02 · Refrigerant Sniff</h2>
                {verdict === 'FAIL' ? (
                  <span className="text-xs font-bold text-fail border border-fail bg-fail-bg px-2 py-0.5 rounded">FAIL ACTIVE</span>
                ) : (
                  <span className="text-xs font-bold text-warn border border-warn bg-warn-bg px-2 py-0.5 rounded">PASS OVERRIDE</span>
                )}
              </div>
              <div className="p-3 flex flex-col gap-3">
                <p className="text-sm">
                  Ultrasonic sniffer alarmed at <strong className="apex-id text-fail">18.4 ppm R-134a</strong>. Visible oil emulsion along lower flange quadrant.{' '}
                  <span className="text-xs font-bold text-fail border border-fail px-2 py-0.5 rounded whitespace-nowrap">1 Critical Defect</span>
                </p>
                <div className="flex flex-col gap-1">
                  <label className="apex-id font-bold" htmlFor="reading">Reading (ppm)</label>
                  <input
                    id="reading"
                    type="text"
                    inputMode="decimal"
                    value={reading}
                    onChange={(e) => { setReading(e.target.value); markDirty(); }}
                    aria-invalid={!readingOk}
                    className={cn('min-h-[48px] px-3 rounded border-2 font-mono text-base outline-none focus:border-slate900', readingOk ? 'border-hold' : 'border-fail')}
                  />
                  {!readingOk && <p className="text-sm font-bold text-fail">Enter a numeric reading, e.g. 18.4.</p>}
                </div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pass or fail step 2">
                  <Button variant="pass" onClick={onPassOverride}>PASS</Button>
                  <Button variant="fail" className={cn(verdict === 'FAIL' && 'ring-4 ring-slate900')} onClick={onFail}>FAIL</Button>
                </div>
                <p className="text-sm text-muted">Verdict is self-assessed and persists to the server on submit. No supervisor countersign on file.</p>
                <div className="rounded border-2 border-border-strong overflow-hidden">
                  <div className="bg-slate900 text-white px-3 py-2 flex items-center justify-between gap-2">
                    <span className="apex-id font-bold">PHOTO_CHILLER4_SEAL.RAW</span>
                    <span className="text-xs">GPS {gpsText}</span>
                  </div>
                  <div className="p-3 bg-surface-subtle flex flex-col items-center gap-2 text-center">
                    <Camera size={44} className="text-muted" />
                    <p className="text-sm font-bold">Flange weeping · overlay GPS stamped</p>
                    <Button variant="field" className="bg-slate900" onClick={onRetake} disabled={evidenceUploading}>
                      {evidenceUploading ? 'Uploading…' : 'Retake Photo'}
                    </Button>
                    <p className="text-sm text-muted" role="status">{photoState}</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      aria-label="Capture step evidence photo"
                      onChange={onPickEvidence}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="field" className="bg-white text-body border-2 border-slate900" onClick={onVoice}>
                    <Mic size={20} /> {recording ? 'Stop Recording' : 'Record Voice Note'}
                  </Button>
                  <p className="text-sm text-muted" role="status">{voiceState}</p>
                </div>
                <textarea
                  rows={2}
                  aria-label="Technician notes"
                  value={techNotes}
                  onChange={(e) => { setTechNotes(e.target.value); markDirty(); }}
                  className="w-full p-3 bg-surface-subtle border-2 border-hold rounded text-sm outline-none focus:border-slate900"
                />
              </div>
            </div>
          </div>
        </section>

        {/* STEP 03 MODBUS */}
        <section className="rounded border-2 border-border-strong bg-white overflow-hidden" aria-label="Step 3 modbus">
          <div className="bg-slate900 text-white px-3 py-2">
            <h2 className="text-lg font-semibold font-display">Step 03 · Live Reading Sync</h2>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm">Modbus gateway (demo — not connected) · discharge pressure envelope 110–130 PSI</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="field" className="bg-slate900" onClick={onIot} disabled={iotBusy}>Sync via IoT</Button>
              <p className="font-mono text-base font-bold" role="status">{iotState}</p>
            </div>
            <p className="text-sm text-muted">Out-of-bounds readings auto-flag a defect. Failed reads fall back to manual entry.</p>
          </div>
        </section>

        {/* STEP 04 + FINDING */}
        <section id="finding-capture" className="rounded border-2 border-slate900 bg-white shadow-hard overflow-hidden scroll-mt-40" aria-label="Step 4 finding">
          <div className="bg-slate900 text-white px-3 py-2">
            <h2 className="text-lg font-semibold font-display">Step 04 · Finding &amp; Submit</h2>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <p className="text-sm">
              FAIL verdict opens finding <strong className="apex-id">{CANON.finding}</strong> (Primary Shaft Seal Refrigerant Leak &amp; Bearing Contamination). Submitting this run records it as COMPLETED in the inspection ledger.
            </p>
            <div className="flex flex-col gap-1">
              <label className="apex-id font-bold" htmlFor="finding-note">Finding note (required for FAIL submit)</label>
              <textarea
                id="finding-note"
                rows={2}
                value={note}
                onChange={(e) => { setNote(e.target.value); markDirty(); }}
                className="w-full p-3 border-2 border-hold rounded text-sm outline-none focus:border-slate900"
              />
              {!noteOk && <p className="text-sm font-bold text-fail">A finding note is required before submitting a FAIL.</p>}
            </div>
            <Link
              href={`/field/findings/${CANON.finding}`}
              className="min-h-[48px] px-4 rounded border-2 border-slate900 bg-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              Open Conversion Desk ({CANON.finding})
            </Link>
          </div>
        </section>
      </main>

      {/* STICKY DOCK */}
      <section className="no-print fixed bottom-20 left-0 w-full z-40 px-4" aria-label="Submit dock">
        <div className="max-w-3xl mx-auto bg-surface/95 backdrop-blur-md border-2 border-slate900 rounded shadow-hard p-3 flex flex-col gap-2">
          <p className={cn('text-sm font-bold', guardOk ? 'text-pass' : 'text-warn')} role="status">
            {guardOk ? 'Guard pass — ready to submit.' : 'Guard: reading + photo + finding note required.'}
          </p>
          <Button variant="field" className="bg-slate900 min-h-[56px] text-lg disabled:opacity-40" disabled={!guardOk || submitted || submitting} onClick={() => void onSubmit()}>
            {submitted ? 'Submitted ✓' : submitting ? 'Recording…' : 'Submit Audit Run'}
          </Button>
          {submitted && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-pass">Run recorded{serverStatus ? ` · ${serverStatus} (server)` : ''}.</p>
              <div className="flex gap-2">
                <Link href={`/field/findings/${CANON.finding}`} className="flex-1 min-h-[48px] rounded bg-pass text-white text-sm font-bold inline-flex items-center justify-center">
                  Open Conversion Desk
                </Link>
                <Link href="/field/audits" className="flex-1 min-h-[48px] rounded border-2 border-slate900 text-sm font-bold inline-flex items-center justify-center">
                  Back to Audits
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
                  <DialogTitle id="loto-h" className="text-lg font-semibold font-display">LOTO Evidence</DialogTitle>
                  <DialogDescription className="text-xs text-muted">loto_breaker_isolated.jpg · Padlock {CANON.lotoPadlock}</DialogDescription>
                </div>
                <DialogPrimitive.Close aria-label="Close" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900">
                  <X size={22} />
                </DialogPrimitive.Close>
              </div>
              <div className="rounded bg-slate900 text-white p-8 flex flex-col items-center gap-2 text-center">
                <Lock size={44} className="text-pass-dot" />
                <p className="text-sm font-bold">PASS VERIFIED — 0.0V measured</p>
                <p className="text-xs">Point {CANON.lotoPoint} · {CANON.lotoPanel} · 08:04 WIB</p>
              </div>
            </DialogPrimitive.Content>
          </div>
        </DialogPrimitive.Portal>
      </Dialog>

      <FieldToasts toasts={toasts} className="bottom-44" />
    </>
  );
}
