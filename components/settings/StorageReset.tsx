'use client';

import { useEffect, useState } from 'react';
import { Eraser, RefreshCw, ShieldAlert, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { has } from '@/lib/platform/capability';
import { clearSyncedOutbox, listOutbox } from '@/lib/offline/outbox';

export function StorageReset() {
  const [cacheNames, setCacheNames] = useState<string[]>([]);
  const [swCount, setSwCount] = useState<number | null>(null);
  const [outboxCount, setOutboxCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const refresh = async () => {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys().catch(() => [] as string[]);
      setCacheNames(keys);
    }
    if (has.serviceWorker()) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => [] as ServiceWorkerRegistration[]);
      setSwCount(regs.length);
    }
    const items = await listOutbox().catch(() => []);
    setOutboxCount(items.length);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const action = async (kind: string, fn: () => Promise<string>) => {
    if (busy) return;
    setBusy(kind);
    try {
      setStatus(await fn());
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const clearCaches = () =>
    action('caches', async () => {
      if (typeof caches === 'undefined') return 'Cache API not available in this browser.';
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      return `${keys.length} cache bucket(s) deleted. Reload to fetch fresh assets.`;
    });

  const unregisterSw = () =>
    action('sw', async () => {
      if (!has.serviceWorker()) return 'Service Worker API not available.';
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      return `${regs.length} service worker(s) unregistered. Offline shell disabled until next visit.`;
    });

  const clearSynced = () =>
    action('outbox', async () => {
      await clearSyncedOutbox();
      return 'Synced outbox history cleared (pending items were NOT touched).';
    });

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4 flex flex-col gap-3 shadow-card">
      <div className="flex items-center gap-2">
        <HardDrive size={18} className="text-cobalt" />
        <h2 className="text-sm font-bold uppercase tracking-wider">On-device Storage & PWA</h2>
      </div>
      <p className="text-xs text-muted">
        Honest state of this device: no hidden wipes. Use these explicit actions when the PWA cache goes stale or a
        shared field tablet changes hands.
      </p>

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded border border-border-subtle bg-surface p-2">
          <dd className="text-lg font-bold font-mono">{cacheNames.length}</dd>
          <dt className="text-muted">cache buckets<br />{cacheNames.filter((c) => c.startsWith('apex-sw-')).length > 0 ? '(SW + others)' : ''}</dt>
        </div>
        <div className="rounded border border-border-subtle bg-surface p-2">
          <dd className="text-lg font-bold font-mono">{swCount ?? '—'}</dd>
          <dt className="text-muted">SW registrations</dt>
        </div>
        <div className="rounded border border-border-subtle bg-surface p-2">
          <dd className="text-lg font-bold font-mono">{outboxCount ?? '—'}</dd>
          <dt className="text-muted">outbox items</dt>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={clearCaches} disabled={busy !== null || cacheNames.length === 0} className="text-xs">
          <Eraser size={14} /> {busy === 'caches' ? 'Clearing…' : 'Clear caches'}
        </Button>
        <Button variant="ghost" onClick={unregisterSw} disabled={busy !== null || !swCount} className="text-xs">
          <RefreshCw size={14} /> {busy === 'sw' ? 'Unregistering…' : 'Unregister SW'}
        </Button>
        <Button variant="ghost" onClick={clearSynced} disabled={busy !== null || !outboxCount} className="text-xs">
          <ShieldAlert size={14} /> {busy === 'outbox' ? 'Clearing…' : 'Clear synced outbox'}
        </Button>
      </div>
      {status && <p role="status" className="text-xs font-semibold text-pass-ink">{status}</p>}
    </div>
  );
}
