'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CloudUpload, SignalLow, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
            'Kembali online — sinkron otomatis',
            `${res.synced} item diputar ulang dengan idempotency key aslinya${res.failed ? ` · ${res.failed} ditolak (lihat antrean)` : ''}.`,
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
      push(true, 'Item tersinkron', `${item.op} diakui — idempotency key sama, tidak duplikat.`);
    } else if (res.failed > 0) {
      push(false, 'Item ditolak', `${item.op} ditolak server (lihat pesan). Ubah & kirim ulang bila perlu.`);
    } else {
      push(false, 'Masih luring', `${item.op} tetap di antrean. Coba lagi saat koneksi pulih.`);
    }
  };

  const syncAll = async () => {
    if (busyId) return;
    setBusyId('ALL');
    push(true, 'Sinkron dimulai', 'Memutar ulang antrean dengan idempotency key aslinya…');
    const res = await flushOutbox({});
    setBusyId(null);
    push(
      res.failed === 0,
      'Sinkron selesai',
      `${res.synced} tersinkron${res.failed ? ` · ${res.failed} ditolak` : ''}${res.pending ? ` · ${res.pending} masih antre (luring)` : ''}.`,
    );
  };

  const clearSynced = async () => {
    await clearSyncedOutbox();
    push(true, 'Riwayat dibersihkan', 'Item tersinkron dihapus dari antrean perangkat.');
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
          <Link href="/field/audits" className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded border-2 border-slate900 bg-white" aria-label="Kembali ke audit">
            <ArrowLeft size={24} />
          </Link>
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-lg font-semibold font-display">Status Sinkron</h1>
            <p className="text-xs text-muted">INS-2026-0412 · 65% · E. Voronova</p>
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
            <p className="text-sm font-semibold">Luring — antrean tersimpan di perangkat. Tidak ada yang hilang; terkirim otomatis saat koneksi kembali.</p>
          </div>
        )}

        <section className="rounded border-2 border-slate900 bg-white shadow-hard p-3 flex items-center justify-between gap-2" aria-label="Queue summary">
          <div>
            <h2 className="text-lg font-semibold font-display">Antrean Outbox</h2>
            <p className="text-sm text-muted">
              {pendingItems.length === 0
                ? 'Antrean kosong'
                : `${pendingItems.length} item antre${oldest ? ` · tertua ${new Date(oldest).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
              {expiredItems.length > 0 ? ` · ${expiredItems.length} kedaluwarsa (>7 hari, tidak dikirim)` : ''}
            </p>
          </div>
          <Button
            variant="field"
            className="bg-slate900"
            onClick={syncAll}
            disabled={pendingItems.length === 0 || busyId !== null}
          >
            {busyId === 'ALL' ? 'Menyinkron…' : 'Sinkron Sekarang'}
          </Button>
        </section>

        {pendingItems.length === 0 ? (
          <div className="rounded border-2 border-dashed border-pass bg-white p-6 text-center flex flex-col items-center gap-2">
            <CloudUpload size={36} className="text-pass" />
            <p className="text-lg font-semibold font-display">Antrean kosong</p>
            <p className="text-sm text-muted">Semua item tersinkron · progres 65%.</p>
            <Link href="/field/audits" className="min-h-[48px] inline-flex items-center px-4 rounded bg-slate900 text-white text-sm font-bold">
              Kembali ke Audit
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Item antre">
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
                    {item.status === 'SENDING' ? 'Mengirim…' : 'Coba lagi'}
                  </Button>
                  <Link
                    href={'/field/audits/INS-2026-0412/run'}
                    className="flex-1 min-h-[48px] rounded bg-surface-subtle text-sm font-bold inline-flex items-center justify-center"
                  >
                    Buka Langkah
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <section className="rounded border-2 border-border-strong bg-white p-3 flex flex-col gap-1" aria-label="Synced">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold font-display">Baru Tersinkron</h2>
            {syncedItems.length > 0 && (
              <button type="button" className="text-xs font-bold text-muted hover:text-fail underline" onClick={clearSynced}>
                Bersihkan
              </button>
            )}
          </div>
          {syncedItems.length === 0 ? (
            <p className="text-sm text-muted">Belum ada yang tersinkron di perangkat ini.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {syncedItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{item.op} · replay idempoten ✓</span>
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
