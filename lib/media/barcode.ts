
export type BarcodeScanResult = {
  rawValue: string;
  format: string;
  cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
};

export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<BarcodeScanResult[]>;
}

export interface DetectedBarcodeCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function getCtor(): DetectedBarcodeCtor | null {
  if (typeof globalThis !== 'undefined' && 'BarcodeDetector' in globalThis) {
    const ctor = (globalThis as { BarcodeDetector?: DetectedBarcodeCtor }).BarcodeDetector;
    if (typeof ctor === 'function') return ctor;
  }
  return null;
}

export function hasBarcodeDetector(): boolean {
  const Ctor = getCtor();
  if (!Ctor) return false;
  try {
    new Ctor();
    return true;
  } catch {
    return false;
  }
}

export const PREFERRED_FORMATS = ['code_128', 'qr_code', 'data_matrix', 'code_39', 'ean_13'] as const;

export async function supportedFormats(): Promise<string[]> {
  const Ctor = getCtor();
  if (!Ctor) return [];
  if (typeof Ctor.getSupportedFormats === 'function') {
    try {
      const supported = await Ctor.getSupportedFormats();
      const hit = PREFERRED_FORMATS.filter((f) => supported.includes(f));
      return hit.length > 0 ? hit : supported;
    } catch {
      /* fallthrough ke preferred */
    }
  }
  return [...PREFERRED_FORMATS];
}

export function createBarcodeDetector(formats?: string[]): BarcodeDetectorLike | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    return formats && formats.length > 0 ? new Ctor({ formats }) : new Ctor();
  } catch {
    return null;
  }
}

export async function scanFromVideo(
  video: HTMLVideoElement,
  signal: AbortSignal,
  opts: { confirmFrames?: number; intervalMs?: number; formats?: string[] } = {},
): Promise<BarcodeScanResult | null> {
  const detector = createBarcodeDetector(opts.formats);
  if (!detector) return null;

  const confirmFrames = opts.confirmFrames ?? 2;
  const intervalMs = opts.intervalMs ?? 250;
  let lastValue: string | null = null;
  let streak = 0;

  while (!signal.aborted) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      try {
        const hits = await detector.detect(video);
        const hit = hits.find((h) => h.rawValue && h.rawValue.trim().length >= 4);
        if (hit) {
          if (hit.rawValue === lastValue) {
            streak += 1;
            if (streak >= confirmFrames) return hit;
          } else {
            lastValue = hit.rawValue;
            streak = 1;
          }
        } else {
          lastValue = null;
          streak = 0;
        }
      } catch {
        lastValue = null;
        streak = 0;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export function normalizeScannedAssetCode(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const seg = u.pathname.split('/').filter(Boolean).pop();
      return (seg || trimmed).toUpperCase();
    } catch {
      return trimmed.toUpperCase();
    }
  }
  const seg = trimmed.split(/[/\s]+/).filter(Boolean).pop() || trimmed;
  return seg.toUpperCase();
}
