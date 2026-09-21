import { has } from './capability';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockController {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  readonly active: boolean;
}

export function createScreenWakeLock(): WakeLockController {
  let sentinel: WakeLockSentinelLike | null = null;
  let desired = false;

  if (!has.wakeLock()) {
    return {
      acquire: async () => false,
      release: async () => {},
      get active() {
        return false;
      },
    } as WakeLockController;
  }

  const onVisible = () => {
    if (desired && document.visibilityState === 'visible') void doAcquire();
  };

  async function doAcquire(): Promise<boolean> {
    try {
      sentinel = (await (
        navigator as unknown as { wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }
      ).wakeLock.request('screen')) as WakeLockSentinelLike;
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
      return true;
    } catch {
      sentinel = null;
      return false;
    }
  }

  return {
    async acquire() {
      desired = true;
      document.removeEventListener('visibilitychange', onVisible);
      document.addEventListener('visibilitychange', onVisible);
      return doAcquire();
    },
    async release() {
      desired = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
        }
      }
      sentinel = null;
    },
    get active() {
      return sentinel !== null && !sentinel.released;
    },
  };
}
