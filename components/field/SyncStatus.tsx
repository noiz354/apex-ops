'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CloudUpload, SignalLow, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';
import {
  clearSyncedOutbox,
  flushOutbox,
  listOutbox,
  subscribeOutbox,
  type OutboxItem,
} from '@/lib/offline/outbox';
import { FieldToasts, useFieldToasts } from './toasts';

type State = OutboxItem['status'];

export function SyncStatus() {
  const { toasts, push } = useFieldToasts();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [busyId, setBusyId] = useState<string | 'ALL' | null>(null);

  const refresh = useCallback(async () => setItems(await listOutbox()), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();
    const unsub = subscribeOutbox(() => void refresh());
    const on = () => {
      setOnline(true);
      setBusyId('ALL');
      void flushOutbox({}).then((res) => {
        setBusyId(null);
        if (res.synced > 0 || res.failed > 0) {
          push(
            res.failed === 0,
            'Back online — auto-sync',
            `${res.synced} item(s) replayed with their original idempotency keys${res.failed ? ` · ${res.failed} rejected (see queue)` : ''}.`,
          );
        }
      });
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      unsub();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh, push]);

  const pendingItems = items.filter((i) => i.status !== 'SYNCED' && i.status !== 'EXPIRED');
  const syncedItems = items.filter((i) => i.status === 'SYNCED').slice(-5).reverse();
  const expiredItems = items.filter((i) => i.status === 'EXPIRED');
  const oldest = pendingItems
    .map((i) => new Date(i.createdAt).getTime())
    .sort((a, b) => a - b)[0];

  const retry = async (item: OutboxItem) => {
    if (busyId || item.status === 'SENDING') return;
    setBusyId(item.id);
    const res = await flushOutbox({ onlyIds: [item.id] });
    setBusyId(null);
    if (res.synced > 0) {
      push(true, 'Item synced', `${item.op} acknowledged — same idempotency key, no duplicate.`);
    } else if (res.failed > 0) {
      push(false, 'Item rejected', `${item.op} was rejected by the server (see message). Edit & re-capture if needed.`);
    } else {
      push(false, 'Still offline', `${item.op} kept in queue. Retry when the link recovers.`);
    }
  };

  const syncAll = async () => {
    if (busyId) return;
    setBusyId('ALL');
    push(true, 'Sync started', 'Replaying queued items with their original idempotency keys…');
    const res = await flushOutbox({});
    setBusyId(null);
    push(
      res.failed === 0,
      'Sync finished',
      `${res.synced} synced${res.failed ? ` · ${res.failed} rejected` : ''}${res.pending ? ` · ${res.pending} still pending (offline)` : ''}.`,
    );
  };

  const clearSynced = async () => {
    await clearSyncedOutbox();
    push(true, 'History cleared', 'Synced items removed from the on-device queue.');
  };

  const chip = (st: State) =>
    cn(
      'text-xs font-bold border px-2 py-0.5 rounded',
      st === 'SYNCED' && 'text-pass border-pass bg-pass-bg',
      st === 'QUEUED' && 'text-warn border-warn bg-warn-bg',
      st === 'SENDING' && 'text-cobalt-deep border-cobalt-deep bg-cobalt-tint animate-pulse',
      (st === 'FAILED' || st === 'EXPIRED') && 'text-fail border-fail bg-fail-bg',
    );

  return (
    <>
      <header className="no-print fixed top-7 w-full z-50 pt-safe bg-surface/90 backdrop-blur-xl border-b-2 border-slate900">
        <div className="min-h-16 px-4 flex items-center justify-between gap-2 max-w-3xl mx-auto w-full py-2">
          <Link href="/field/audits" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Back to audits">
            <ArrowLeft size={24} />
          </Link>
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-lg font-semibold font-display">Sync Status</h1>
            <p className="text-xs text-muted">{CANON.inspection} · {CANON.inspectionProgress}% · E. Voronova</p>
          </div>
          <span className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-warn bg-warn-bg text-warn-ink" role="status" aria-label={online ? 'Online' : 'Offline'}>
            {online ? <CloudUpload size={24} /> : <SignalLow size={24} />}
          </span>
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-4 pt-[124px] flex flex-col gap-4">
        {!online && pendingItems.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-3 rounded border-2 border-warn bg-warn-bg text-warn-ink" role="alert">
            <WifiOff size={22} />
            <p className="text-sm font-semibold">Offline — queue held on-device (IndexedDB). Nothing is lost; it replays automatically when the link returns.</p>
          </div>
        )}

        <section className="rounded border-2 border-slate900 bg-white shadow-hard p-3 flex items-center justify-between gap-2" aria-label="Queue summary">
          <div>
            <h2 className="text-lg font-semibold font-display">Outbox Queue</h2>
            <p className="text-sm text-muted">
              {pendingItems.length === 0
                ? 'Queue clear'
                : `${pendingItems.length} item(s) pending${oldest ? ` · oldest ${new Date(oldest).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
              {expiredItems.length > 0 ? ` · ${expiredItems.length} expired (>7d, not replayed)` : ''}
            </p>
          </div>
          <Button
            variant="field"
            className="bg-slate900"
            onClick={syncAll}
            disabled={pendingItems.length === 0 || busyId !== null}
          >
            {busyId === 'ALL' ? 'Syncing…' : 'Sync Now'}
          </Button>
        </section>

        {pendingItems.length === 0 ? (
          <div className="rounded border-2 border-dashed border-pass bg-white p-6 text-center flex flex-col items-center gap-2">
            <CloudUpload size={36} className="text-pass" />
            <p className="text-lg font-semibold font-display">Queue clear</p>
            <p className="text-sm text-muted">All items synced · progress updated to {CANON.inspectionProgress}%.</p>
            <Link href="/field/audits" className="min-h-[48px] inline-flex items-center px-4 rounded bg-slate900 text-white text-sm font-bold">
              Back to Audits
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Pending items">
            {[...pendingItems, ...expiredItems].map((item) => (
              <li key={item.id} className="rounded border-2 border-border-strong bg-white p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="apex-id font-bold">{item.op}</span>
                  <span className={chip(item.status)}>{item.status}</span>
                </div>
                <p className="text-sm text-muted">
                  {item.method} {item.url} · key <span className="apex-id">{item.idempotencyKey.slice(0, 13)}…</span>
                  {item.attempts > 0 ? ` · ${item.attempts} attempt(s)` : ''}
                </p>
                {item.errorMessage && (
                  <p className="text-xs font-semibold text-fail" role="alert">{item.errorMessage}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="field"
                    className="flex-1 bg-white text-body border-2 border-slate900"
                    onClick={() => retry(item)}
                    disabled={busyId !== null || item.status === 'SENDING' || item.status === 'EXPIRED'}
                  >
                    {item.status === 'SENDING' ? 'Sending…' : 'Retry'}
                  </Button>
                  <Link
                    href={`/field/audits/${CANON.inspection}/run`}
                    className="flex-1 min-h-[48px] rounded bg-surface-subtle text-sm font-bold inline-flex items-center justify-center"
                  >
                    Open Step
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="rounded border-2 border-border-strong bg-white p-3 flex flex-col gap-1" aria-label="Synced">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold font-display">Recently Synced</h2>
            {syncedItems.length > 0 && (
              <button type="button" className="text-xs font-bold text-muted hover:text-fail underline" onClick={clearSynced}>
                Clear
              </button>
            )}
          </div>
          {syncedItems.length === 0 ? (
            <p className="text-sm text-muted">Nothing synced yet on this device.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {syncedItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.op} · idempotent replay ✓</span>
                  <span className="text-xs font-bold text-pass whitespace-nowrap">
                    SYNCED {item.lastAttemptAt ? new Date(item.lastAttemptAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <FieldToasts toasts={toasts} />
    </>
  );
}
