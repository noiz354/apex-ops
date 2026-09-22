import { useCallback, useEffect, useRef, useState } from 'react';

export interface Toast {
  id: number;
  ok: boolean;
  title: string;
  msg: string;
  retry?: boolean;
}

let toastSeq = 1;

/**
 * Shared toast state with self-cleaning timers.
 * Keeps at most the last 3 toasts; every timer is tracked and cleared on unmount
 * so no setState fires after the component is gone.
 */
export function useToasts(timeoutMs = 8000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);

  const push = useCallback(
    (ok: boolean, title: string, msg: string, retry = false) => {
      const id = toastSeq++;
      setToasts((t) => [...t.slice(-2), { id, ok, title, msg, retry }]);
      const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeoutMs);
      toastTimers.current.push(timer);
    },
    [timeoutMs],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /** Register an arbitrary timer that is also cleared on unmount. */
  const defer = useCallback((fn: () => void, ms: number) => {
    const timer = window.setTimeout(fn, ms);
    toastTimers.current.push(timer);
  }, []);

  useEffect(
    () => () => {
      toastTimers.current.forEach((t) => window.clearTimeout(t));
      toastTimers.current = [];
    },
    [],
  );

  return { toasts, push, dismiss, defer };
}
