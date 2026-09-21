import { ApiError, apiFetch } from '../api/client';
import { has } from '../platform/capability';
import { idbGetAll, idbSaveAll } from './db';

export interface OutboxItem {
  id: string;
  op: string;
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body: unknown;
  idempotencyKey: string;
  status: 'QUEUED' | 'SENDING' | 'FAILED' | 'SYNCED' | 'EXPIRED';
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  errorMessage: string | null;
}

const LEGACY_STORAGE_KEY = 'apexops_field_outbox_v1';
const LEGACY_CORRUPT_KEY = 'apexops_field_outbox_v1_corrupt';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHANNEL = 'apex-outbox';

let memoryItems: OutboxItem[] | null = null;
let migrated = false;

export function isPersistent(): boolean {
  return has.indexedDb() && memoryItems === null;
}

function broadcastUpdate(): void {
  const msg = { kind: 'OUTBOX_UPDATED' as const, at: Date.now() };
  if (has.broadcastChannel()) {
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage(msg);
      ch.close();
      return;
    } catch {
    }
  }
  try {
    localStorage.setItem('apex_outbox_signal', JSON.stringify(msg));
  } catch {
  }
}

export function subscribeOutbox(cb: () => void): () => void {
  if (has.broadcastChannel()) {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => cb();
    return () => ch.close();
  }
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'apex_outbox_signal') cb();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function isValidItem(x: unknown): x is OutboxItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.url === 'string' &&
    typeof o.idempotencyKey === 'string' &&
    typeof o.method === 'string'
  );
}

async function migrateLegacy(): Promise<void> {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isValidItem)) {
      if (parsed.length > 0) await idbSaveAll(parsed);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LEGACY_CORRUPT_KEY, raw);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {
    try {
      window.localStorage.setItem(LEGACY_CORRUPT_KEY, raw);
    } catch {
    }
  }
}

async function load(): Promise<OutboxItem[]> {
  await migrateLegacy();
  const fromDb = await idbGetAll<OutboxItem>();
  if (fromDb !== null) {
    memoryItems = null;
    return applyTtl(fromDb);
  }
  if (memoryItems === null) memoryItems = [];
  return applyTtl(memoryItems);
}

async function save(items: OutboxItem[]): Promise<void> {
  if (memoryItems !== null) {
    memoryItems = items;
    broadcastUpdate();
    return;
  }
  const ok = await idbSaveAll(items);
  if (!ok) memoryItems = items;
  broadcastUpdate();
}

function applyTtl(items: OutboxItem[]): OutboxItem[] {
  const now = Date.now();
  return items.map((i) =>
    i.status !== 'SYNCED' && i.status !== 'EXPIRED' && now - new Date(i.createdAt).getTime() > TTL_MS
      ? { ...i, status: 'EXPIRED' as const }
      : i,
  );
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return load();
}

export async function enqueueOutbox(
  item: Omit<OutboxItem, 'id' | 'attempts' | 'status' | 'createdAt' | 'lastAttemptAt' | 'errorMessage'>,
): Promise<OutboxItem> {
  const items = await load();
  const id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: OutboxItem = {
    ...item,
    id,
    attempts: 0,
    status: 'QUEUED',
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    errorMessage: null,
  };
  items.push(record);
  await save(items);
  void syncHelpers()
    .then((h) => {
      h.register();
      h.badge(items.filter((i) => i.status === 'QUEUED' || i.status === 'FAILED').length);
    })
    .catch(() => undefined);
  return record;
}

async function syncHelpers() {
  const { registerOutboxSync, updateOutboxBadge } = await import('./bg-sync');
  return {
    register: () => {
      void registerOutboxSync();
    },
    badge: (n: number) => {
      void updateOutboxBadge(n);
    },
  };
}

export interface FlushOptions {
  onlyIds?: string[];
  onProgress?: (item: OutboxItem, state: 'SENDING' | 'SYNCED' | 'FAILED' | 'RETRY') => void;
}

export async function flushOutbox(opts: FlushOptions = {}): Promise<{ synced: number; failed: number; pending: number }> {
  const items = await load();
  let synced = 0;
  let failed = 0;
  let pending = 0;

  for (const item of items) {
    if (item.status === 'SYNCED' || item.status === 'EXPIRED') continue;
    if (opts.onlyIds && !opts.onlyIds.includes(item.id)) continue;

    item.status = 'SENDING';
    item.lastAttemptAt = new Date().toISOString();
    item.attempts += 1;
    await save(items);
    opts.onProgress?.(item, 'SENDING');

    try {
      await apiFetch<unknown>(item.url, {
        method: item.method,
        body: item.body,
        idempotencyKey: item.idempotencyKey, // preserved — dedup server
        timeoutMs: 30_000,
      });
      item.status = 'SYNCED';
      item.errorMessage = null;
      synced++;
      opts.onProgress?.(item, 'SYNCED');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        item.status = 'SYNCED';
        item.errorMessage = null;
        synced++;
        opts.onProgress?.(item, 'SYNCED');
      } else if (err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) {
        item.status = 'QUEUED';
        item.errorMessage = err.message;
        pending++;
        opts.onProgress?.(item, 'RETRY');
        await save(items);
        break;
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        item.status = 'FAILED';
        item.errorMessage = `${err.code}: ${err.message}`;
        failed++;
        opts.onProgress?.(item, 'FAILED');
      } else {
        item.status = 'QUEUED';
        item.errorMessage = err instanceof Error ? err.message : 'Unknown send failure';
        pending++;
        opts.onProgress?.(item, 'RETRY');
        await save(items);
        break;
      }
    }

    await save(items);
  }

  void syncHelpers()
    .then((h) => h.badge(pending))
    .catch(() => undefined);

  return { synced, failed, pending };
}

export async function clearSyncedOutbox(): Promise<void> {
  const items = await load();
  const rest = items.filter((i) => i.status !== 'SYNCED');
  await save(rest);
  void syncHelpers()
    .then((h) => h.badge(rest.filter((i) => i.status === 'QUEUED' || i.status === 'FAILED').length))
    .catch(() => undefined);
}
