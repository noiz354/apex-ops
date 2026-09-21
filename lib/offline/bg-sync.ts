import { has } from '../platform/capability';

const SYNC_TAG = 'apex-outbox-flush';

interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> };
}

export async function registerOutboxSync(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!has.serviceWorker() || !('sync' in ServiceWorkerRegistration.prototype)) {
    return false;
  }
  try {
    const reg = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
    await reg.sync?.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

export async function updateOutboxBadge(count: number): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof n.setAppBadge !== 'function') return false;
  try {
    if (count > 0) await n.setAppBadge(count);
    else if (typeof n.clearAppBadge === 'function') await n.clearAppBadge();
    else await n.setAppBadge(0);
    return true;
  } catch {
    return false;
  }
}
