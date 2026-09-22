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

  const [asset, setAsset] = useState<string>('AST-HVAC-004');
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
      push(false, 'Pemindai tidak tersedia', 'BarcodeDetector tidak didukung browser ini — ketik tag aset manual.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      push(false, 'Kamera tidak tersedia', 'Perangkat ini tidak punya aliran kamera — ketik tag aset manual.');
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
        push(true, 'Barcode terbaca', `Format ${hit.format} · ${code} — cocokkan dengan tag fisik sebelum kirim.`);
      } else {
        push(false, 'Pindaian selesai', 'Tidak ada kode terkonfirmasi (timeout/batal) — arahkan ke tag lagi atau ketik manual.');
      }
    } catch (err) {
      stopScan();
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setScanError('Izin kamera ditolak — ketik tag aset manual.');
        push(false, 'Kamera ditolak', 'Beri izin kamera untuk memindai, atau ketik tag aset manual.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setScanError('Tidak ada kamera yang bisa dipakai — ketik tag aset manual.');
        push(false, 'Tanpa kamera', 'Perangkat ini tidak punya kamera — ketik tag aset manual.');
      } else {
        setScanError('Kamera gagal dinyalakan — ketik tag aset manual.');
        push(false, 'Kamera gagal', err instanceof Error ? err.message : 'Kesalahan kamera tak dikenal.');
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
        'Foto Terlampir',
        prep.sha256Hash
          ? `${prep.fileName} · SHA-256 terverifikasi lokal${prep.wasResized ? ' · dikecilkan ≤1600px untuk upload' : ''}.`
          : `${prep.fileName} terlampir (hash tak tersedia — server yang menghitung).`,
      );
    } catch {
      push(false, 'Foto Gagal', 'File itu tidak bisa dibaca — coba ambil lagi.');
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
      push(false, 'Validasi Gagal', 'Judul temuan wajib diisi.');
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
      push(true, 'Temuan Tercatat', `${data.id} tersimpan — via /api/findings.`);
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
        push(true, 'Offline — Temuan Diantrekan', 'Tersimpan di perangkat dengan idempotency key. Putar ulang dari tab Sinkron saat koneksi kembali.');
        if (navigator.onLine) setTimeout(() => router.push('/field/sync'), 1200);
      } else {
        push(false, 'Gagal Mencatat', err instanceof ApiError ? `${err.message} (${err.code})` : 'Gagal tak terduga — temuan TIDAK tercatat. Coba lagi.');
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
              aria-label="Kembali ke Audit"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold font-display leading-tight">Catat Temuan Lapangan</h1>
              <p className="text-xs text-muted truncate">E. Voronova · {'07:00–15:30 WIB'}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded border-2 border-fail bg-fail-bg text-fail text-[11px] font-bold">
            TANGKAP CACAT
          </span>
        </div>
      </header>

      {/* Main Form Content */}
      <main className="w-full max-w-3xl mx-auto px-4 pt-[124px] pb-8 flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Target Asset & Barcode Scan */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Aset Target</span>
              <button
                type="button"
                onClick={scanning ? stopScan : startScan}
                disabled={!hasBarcodeDetector() && !scanning}
                className="text-xs font-bold text-cobalt flex items-center gap-1 active:scale-95 disabled:text-muted"
                title={!hasBarcodeDetector() ? 'BarcodeDetector tidak didukung — ketik tag manual' : undefined}
              >
                <ScanLine size={14} /> {scanning ? 'Hentikan Pindai' : 'Pindai Barcode / QR'}
              </button>
            </div>
            {(scanning || scanError) && (
              <>
                <div ref={videoWrapRef} aria-live="polite" />
                {scanError && <p className="text-xs font-semibold text-fail" role="alert">{scanError}</p>}
                {scanning && (
                  <p className="text-xs text-muted">Arahkan ke tag aset — Code-128/QR/Data Matrix. Berhenti otomatis setelah 45 dtk.</p>
                )}
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">Tag Aset</label>
                <Input
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                  placeholder="AST-HVAC-004"
                  className="font-mono font-bold text-sm border-2 focus:border-slate900"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">Zona / Lokasi Ruangan</label>
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
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Tingkat Keparahan</span>
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
                Temuan kritis memicu eskalasi Work Order otomatis &amp; tinjauan keselamatan.
              </p>
            )}
          </div>

          {/* Finding Details */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Deskripsi Cacat</span>
            <div>
              <label className="text-[11px] font-semibold text-muted block mb-1">Judul Temuan *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="mis. Kebocoran Refrigeran pada Seal Poros Kompresor"
                className="text-base font-semibold border-2 focus:border-slate900"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted block mb-1">Observasi Detail</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Jelaskan laju bocor, bacaan gauge tekanan, desis terdengar, atau cacat visual..."
                className="w-full p-2.5 rounded border-2 border-border-strong text-sm focus:border-slate900 outline-none"
              />
            </div>
          </div>

          {/* Mandatory Photo Capture */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                Media Bukti Wajib
              </span>
              <span className="font-mono text-[10px] text-muted">
                GPS: {gpsCoords ? `${formatCoords(gpsCoords)} (perangkat)` : 'default zona — manual'}
              </span>
            </div>

            {hasPhoto ? (
              <div className="relative rounded border-2 border-pass bg-pass-bg p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded bg-pass flex items-center justify-center text-white font-bold shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold font-display truncate">{photoInfo?.name ?? 'Foto bukti'}</span>
                    <span className="text-xs font-mono text-muted truncate">
                      {photoInfo?.hash ? `SHA-256 ${photoInfo.hash.slice(0, 12)}… terverifikasi lokal` : 'server yang menghitung hash'}
                      {gpsCoords ? ` · GPS ${formatCoords(gpsCoords)}` : ''}
                      {photoInfo?.resized ? ' · dikecilkan ≤1600px' : ''}
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
                  Ambil Ulang
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
                <span className="text-sm font-bold font-display">Ambil Foto Bukti</span>
                <span className="text-xs text-muted">Buka kamera/pemilih perangkat · di-hash + dikecilkan di perangkat sebelum upload</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Ambil foto bukti"
              onChange={onPickPhoto}
            />
          </div>

          {/* Safety & Lockout Guardrails */}
          <div className="rounded border-2 border-slate900 bg-white p-4 shadow-hard flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Protokol Keselamatan</span>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lotoRequired}
                onChange={(e) => setLotoRequired(e.target.checked)}
                className="w-4 h-4 accent-slate900 rounded"
              />
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <Lock size={14} className="text-fail" /> Lockout Energi Berbahaya (LOTO #4092) Diperlukan
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
                Batal
              </button>
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[52px] rounded border-2 border-slate900 bg-fail text-white text-base font-bold shadow-hard active:scale-95 disabled:opacity-50"
            >
              {submitting ? 'Mencatat…' : 'Kirim Temuan'}
            </button>
          </div>
        </form>
      </main>

      <FieldToasts toasts={toasts} />
    </>
  );
}
