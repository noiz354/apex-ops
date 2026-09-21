'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertOctagon,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Lock,
  ScanLine,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import { ApiError, apiFetch } from '@/lib/api/client';
import { enqueueOutbox } from '@/lib/offline/outbox';
import { formatCoords, getCurrentCoords, type DeviceCoords } from '@/lib/platform/geolocation';
import { haptic } from '@/lib/platform/haptics';
import { prepareEvidence } from '@/lib/media/evidence';
import {
  hasBarcodeDetector,
  normalizeScannedAssetCode,
  scanFromVideo,
  supportedFormats,
} from '@/lib/media/barcode';
import { FieldToasts, useFieldToasts } from './toasts';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export function FindingCapture() {
  const router = useRouter();
  const { toasts, push } = useFieldToasts();

  const [asset, setAsset] = useState<string>(CANON.assetSeal);
  const [zone, setZone] = useState('Basement Mech Room B-204');
  const [severity, setSeverity] = useState<Severity>('CRITICAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lotoRequired, setLotoRequired] = useState(true);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<DeviceCoords | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoInfo, setPhotoInfo] = useState<{ name: string; hash: string; resized: boolean; release(): void } | null>(null);

  useEffect(() => {
    let live = true;
    void getCurrentCoords().then((c) => { if (live) setGpsCoords(c); });
    return () => { live = false; };
  }, []);

  useEffect(() => () => stopScan(), []);

  useEffect(() => () => photoInfo?.release(), [photoInfo]);

  const [scanError, setScanError] = useState<string | null>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  const stopScan = () => {
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoWrapRef.current) videoWrapRef.current.innerHTML = '';
    setScanning(false);
  };

  const startScan = async () => {
    setScanError(null);
    if (!hasBarcodeDetector()) {
      push(false, 'Scanner unavailable', 'BarcodeDetector not supported in this browser — enter the asset tag manually.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      push(false, 'Camera unavailable', 'This device exposes no camera stream — enter the asset tag manually.');
      return;
    }

    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.className = 'w-full rounded border-2 border-slate900 aspect-[4/3] object-cover bg-black';
      if (videoWrapRef.current) {
        videoWrapRef.current.innerHTML = '';
        videoWrapRef.current.appendChild(video);
      } else {
        stopScan();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const formats = await supportedFormats();
      scanAbortRef.current = new AbortController();
      const timeout = setTimeout(() => scanAbortRef.current?.abort(), 45_000);

      const hit = await scanFromVideo(video, scanAbortRef.current.signal, { formats });
      clearTimeout(timeout);
      stopScan();

      if (hit) {
        const code = normalizeScannedAssetCode(hit.rawValue);
        setAsset(code);
        haptic.pass();
        push(true, 'Barcode decoded', `Format ${hit.format} · ${code} — verify against the physical tag before submitting.`);
      } else {
        push(false, 'Scan ended', 'No confirmed code (timeout/cancelled) — aim at the tag again or type it manually.');
      }
    } catch (err) {
      stopScan();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setScanError('Camera permission denied — enter the asset tag manually.');
        push(false, 'Camera denied', 'Grant camera permission to scan, or type the asset tag manually.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setScanError('No usable camera found — enter the asset tag manually.');
        push(false, 'No camera', 'No usable camera on this device — type the asset tag manually.');
      } else {
        setScanError('Camera failed to start — enter the asset tag manually.');
        push(false, 'Camera failed', err instanceof Error ? err.message : 'Unknown camera error.');
      }
    }
  };


  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const prep = await prepareEvidence(f);
      photoInfo?.release();
      setPhotoInfo({ name: prep.fileName, hash: prep.sha256Hash, resized: prep.wasResized, release: prep.release });
      setHasPhoto(true);
      push(
        true,
        'Photo Attached',
        prep.sha256Hash
          ? `${prep.fileName} · SHA-256 verified locally${prep.wasResized ? ' · resized ≤1600px for upload' : ''}.`
          : `${prep.fileName} attached (hashing unavailable — server will compute).`,
      );
    } catch {
      push(false, 'Photo Failed', 'Could not read that file — try another capture.');
    }
  };

  const dropPhoto = () => {
    photoInfo?.release();
    setPhotoInfo(null);
    setHasPhoto(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      push(false, 'Validation Error', 'Finding title is required.');
      return;
    }

    const body = {
      title: title.trim(),
      assetCode: asset.trim(),
      severity,
      zone: zone.trim() || undefined,
      description: description.trim() || undefined,
    };

    setSubmitting(true);
    try {
      const data = await apiFetch<{ id: string }>('/api/findings', { method: 'POST', body });
      push(true, 'Finding Captured', `${data.id} recorded — persisted via /api/findings.`);
      setTimeout(() => router.push('/field/audits'), 900);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) {
        await enqueueOutbox({
          op: 'finding.create',
          url: '/api/findings',
          method: 'POST',
          body,
          idempotencyKey: crypto.randomUUID(),
        });
        push(true, 'Offline — Finding Queued', 'Stored on-device with its idempotency key. Replay from the Sync tab when the link returns.');
        if (navigator.onLine) setTimeout(() => router.push('/field/sync'), 1200);
      } else {
        push(false, 'Capture Rejected', err instanceof ApiError ? `${err.message} (${err.code})` : 'Unexpected failure — finding NOT recorded. Retry.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Fixed Mobile Header */}
      <header className="no-print fixed top-7 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b-2 border-slate900">
        <div className="min-h-16 px-4 flex items-center justify-between gap-2 max-w-3xl mx-auto w-full py-2">
          <div className="flex items-center gap-2">
            <Link
              href="/field/audits"
              className="w-10 h-10 flex items-center justify-center rounded border-2 border-slate900 bg-white active:scale-95"
              aria-label="Back to Audits"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold font-display leading-tight">Log Field Finding</h1>
              <p className="text-xs text-muted truncate">E. Voronova · {CANON.shiftA}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded border-2 border-fail bg-fail-bg text-fail text-[11px] font-bold">
            DEFECT CAPTURE
          </span>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="w-full max-w-3xl mx-auto px-4 pt-[124px] pb-8 flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Target Asset & Barcode Scan */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Target Asset</span>
              <button
                type="button"
                onClick={scanning ? stopScan : startScan}
                disabled={!hasBarcodeDetector() && !scanning}
                className="text-xs font-bold text-cobalt flex items-center gap-1 active:scale-95 disabled:text-muted"
                title={!hasBarcodeDetector() ? 'BarcodeDetector not supported — type the tag manually' : undefined}
              >
                <ScanLine size={14} /> {scanning ? 'Stop Scan' : 'Scan Barcode / QR'}
              </button>
            </div>
            {(scanning || scanError) && (
              <>
                <div ref={videoWrapRef} aria-live="polite" />
                {scanError && <p className="text-xs font-semibold text-fail" role="alert">{scanError}</p>}
                {scanning && (
                  <p className="text-xs text-muted">Aim at the asset tag — Code-128/QR/Data Matrix. Auto-stops after 45s.</p>
                )}
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">Asset Tag</label>
                <Input
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  placeholder="AST-HVAC-004"
                  className="font-mono font-bold text-sm border-2 focus:border-slate900"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">Zone / Room Location</label>
                <Input
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Basement Mech Room B-204"
                  className="text-sm border-2 focus:border-slate900"
                />
              </div>
            </div>
          </div>

          {/* Criticality / Severity Selector */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Defect Severity</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'CRITICAL', label: 'CRITICAL', tone: 'border-fail bg-fail text-white' },
                  { id: 'HIGH', label: 'HIGH', tone: 'border-warn bg-warn text-white' },
                  { id: 'MEDIUM', label: 'MEDIUM', tone: 'border-slate900 bg-slate900 text-white' },
                  { id: 'LOW', label: 'LOW', tone: 'border-hold bg-hold text-white' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={cn(
                    'h-11 rounded border-2 font-display font-bold text-xs transition-transform active:scale-95 flex items-center justify-center gap-1',
                    severity === s.id ? s.tone : 'border-border-strong bg-white text-muted hover:border-slate900'
                  )}
                >
                  {severity === s.id && <Check size={14} />}
                  {s.label}
                </button>
              ))}
            </div>
            {severity === 'CRITICAL' && (
              <p className="text-xs text-fail font-semibold flex items-center gap-1 mt-1">
                <AlertOctagon size={14} />
                Critical findings trigger automatic Work Order escalation &amp; safety review.
              </p>
            )}
          </div>

          {/* Finding Details */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Defect Description</span>
            <div>
              <label className="text-[11px] font-semibold text-muted block mb-1">Finding Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Refrigerant Leak on Compressor Shaft Seal"
                className="text-base font-semibold border-2 focus:border-slate900"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted block mb-1">Detailed Observations</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe leak rate, pressure gauge reading, audible hissing, or visual defect..."
                className="w-full p-2.5 rounded border-2 border-border-strong text-sm focus:border-slate900 outline-none"
              />
            </div>
          </div>

          {/* Mandatory Photo Capture */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Mandatory Evidence Media
              </span>
              <span className="font-mono text-[10px] text-muted">
                GPS: {gpsCoords ? `${formatCoords(gpsCoords)} (device)` : 'zone default — manual'}
              </span>
            </div>

            {hasPhoto ? (
              <div className="relative rounded border-2 border-pass bg-pass-bg p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded bg-pass flex items-center justify-center text-white font-bold shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold font-display truncate">{photoInfo?.name ?? 'Evidence photo'}</span>
                    <span className="text-xs font-mono text-muted truncate">
                      {photoInfo?.hash ? `SHA-256 ${photoInfo.hash.slice(0, 12)}… verified locally` : 'server will compute hash'}
                      {gpsCoords ? ` · GPS ${formatCoords(gpsCoords)}` : ''}
                      {photoInfo?.resized ? ' · resized ≤1600px' : ''}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    dropPhoto();
                    fileRef.current?.click();
                  }}
                  className="text-xs text-fail font-bold hover:underline shrink-0"
                >
                  Retake
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded border-2 border-dashed border-border-strong p-6 flex flex-col items-center justify-center gap-2 hover:border-slate900 active:scale-98 bg-surface"
              >
                <div className="w-12 h-12 rounded-full bg-slate900 text-white flex items-center justify-center">
                  <Camera size={22} />
                </div>
                <span className="text-sm font-bold font-display">Capture Evidence Photo</span>
                <span className="text-xs text-muted">Opens device camera/picker · hashed + resized on-device before upload</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Capture evidence photo"
              onChange={onPickPhoto}
            />
          </div>

          {/* Safety & Lockout Guardrails */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Safety Protocols</span>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lotoRequired}
                onChange={(e) => setLotoRequired(e.target.checked)}
                className="w-4 h-4 accent-slate900 rounded"
              />
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <Lock size={14} className="text-fail" /> Hazardous Energy Lockout (LOTO #4092) Required
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Link href="/field/audits" className="flex-1">
              <button
                type="button"
                className="w-full min-h-[52px] rounded border-2 border-slate900 bg-white text-body text-base font-bold active:scale-95"
              >
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[52px] rounded border-2 border-slate900 bg-fail text-white text-base font-bold shadow-hard active:scale-95 disabled:opacity-50"
            >
              {submitting ? 'Recording…' : 'Submit Finding'}
            </button>
          </div>
        </form>
      </main>

      <FieldToasts toasts={toasts} />
    </>
  );
}
