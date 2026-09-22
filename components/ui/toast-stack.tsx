'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Toast } from '@/lib/use-toasts';

/**
 * Shared floating toast stack. Success toasts use role="status",
 * failures use role="alert"; every toast can be dismissed manually.
 */
export function ToastStack({
  toasts,
  onDismiss,
  action,
  className,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  action?: (t: Toast) => ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm', className)}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.ok ? 'status' : 'alert'}
          className={cn(
            'rounded-lg shadow-modal p-4 flex gap-3 items-start',
            t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink',
          )}
        >
          {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
          <div className="flex-1">
            <p className="text-sm font-bold">{t.title}</p>
            <p className="text-xs">{t.msg}</p>
            {action?.(t)}
          </div>
          <button type="button" aria-label="Tutup notifikasi" onClick={() => onDismiss(t.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
