
export interface Capability {
  readonly id: string;
  isSupported(): boolean;
}

export interface Provider<TArgs, TResult> {
  isSupported(): boolean;
  run(args: TArgs): Promise<TResult>;
}

export function withFallback<A, R>(primary: Provider<A, R>, fallback: Provider<A, R>): Provider<A, R> {
  return {
    isSupported: () => primary.isSupported() || fallback.isSupported(),
    run: (args: A) => (primary.isSupported() ? primary.run(args) : fallback.run(args)),
  };
}

export const has = {
  indexedDb: () => typeof globalThis !== 'undefined' && 'indexedDB' in globalThis,
  broadcastChannel: () => typeof globalThis !== 'undefined' && 'BroadcastChannel' in globalThis,
  sendBeacon: () => typeof navigator !== 'undefined' && 'sendBeacon' in navigator,
  geolocation: () => typeof navigator !== 'undefined' && 'geolocation' in navigator,
  wakeLock: () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  vibration: () => typeof navigator !== 'undefined' && 'vibrate' in navigator,
  barcodeDetector: () => typeof window !== 'undefined' && 'BarcodeDetector' in window,
  serviceWorker: () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  eventSource: () => typeof window !== 'undefined' && 'EventSource' in window,
  worker: () => typeof window !== 'undefined' && 'Worker' in window,
  performanceObserver: (entryType?: string) => {
    if (typeof PerformanceObserver === 'undefined') return false;
    if (!entryType) return true;
    return PerformanceObserver.supportedEntryTypes?.includes(entryType) ?? false;
  },
  showSaveFilePicker: () => typeof window !== 'undefined' && 'showSaveFilePicker' in window,
  setAppBadge: () => typeof navigator !== 'undefined' && 'setAppBadge' in navigator,
  webAuthn: () => typeof window !== 'undefined' && 'PublicKeyCredential' in window,
} as const;
