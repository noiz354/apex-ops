'use client';

import { useEffect, useRef, useState } from 'react';
import { has } from '@/lib/platform/capability';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { SlaNotificationItem } from '@/lib/services/notification-service';

export type SseLoadState = 'connecting' | 'live' | 'fallback-polling' | 'idle';

export interface SlaSnapshot {
  totalAtRisk: number;
  notifications: SlaNotificationItem[];
  snapshotAt: string;
}

export function useSlaStream(enabled: boolean): {
  snapshot: SlaSnapshot | null;
  state: SseLoadState;
  error: string | null;
} {
  const [snapshot, setSnapshot] = useState<SlaSnapshot | null>(null);
  const [state, setState] = useState<SseLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const failures = useRef(0);
  const stopAll = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      setState('fallback-polling');
      const tick = async () => {
        try {
          const data = await apiFetch<{ totalAtRisk: number; notifications: SlaNotificationItem[] }>('/api/notifications');
          if (cancelled) return;
          setSnapshot({ ...data, snapshotAt: new Date().toISOString() });
          setError(null);
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Poll failed.');
        }
      };
      void tick();
      pollTimer = setInterval(tick, 30_000);
    };

    const connect = (attempt: number) => {
      if (cancelled) return;
      if (!has.eventSource()) {
        startPolling();
        return;
      }
      setState('connecting');
      es = new EventSource('/api/notifications/stream');

      es.addEventListener('sla-snapshot', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data as string) as SlaSnapshot;
          if (!cancelled) {
            setSnapshot(data);
            setState('live');
            setError(null);
            failures.current = 0;
          }
        } catch {
          /* payload rusak — abaikan snapshot ini */
        }
      });

      es.addEventListener('stream-error', () => {
        if (!cancelled) setError('Server stream reported a poll failure.');
      });

      es.addEventListener('stream-end', () => {
        es?.close();
        if (!cancelled) retryTimer = setTimeout(() => connect(0), 1_000);
      });

      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        failures.current += 1;
        if (failures.current >= 3) {
          startPolling();
          setError('SSE unreachable — fell back to 30s polling (honest label).');
          return;
        }
        setError('SSE connection lost — reconnecting…');
        const backoff = Math.min(30_000, 1_000 * 2 ** attempt);
        retryTimer = setTimeout(() => connect(attempt + 1), backoff);
      };
    };

    stopAll.current = () => {
      cancelled = true;
      es?.close();
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
    };

    connect(0);

    return () => stopAll.current?.();
  }, [enabled]);

  return { snapshot, state, error };
}
