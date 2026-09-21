'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldToast { id: number; ok: boolean; title: string; msg: string }

let seq = 1;

export function useFieldToasts() {
  const [toasts, setToasts] = useState<FieldToast[]>([]);
  const push = useCallback((ok: boolean, title: string, msg: string) => {
    const id = seq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }, []);
  return { toasts, push };
}

export function FieldToasts({ toasts, className }: { toasts: FieldToast[]; className?: string }) {
  return (
    <div className={cn('fixed left-4 right-4 z-[90] flex flex-col gap-2 max-w-3xl mx-auto', className ?? 'bottom-24')} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.ok ? 'status' : 'alert'}
          className={cn(
            'rounded border-2 p-3 flex gap-2 items-start shadow-hard',
            t.ok ? 'bg-pass-bg border-pass text-pass-ink' : 'bg-fail-bg border-fail text-fail-ink'
          )}
        >
          {t.ok ? <CheckCircle2 size={22} className="shrink-0" /> : <XCircle size={22} className="shrink-0" />}
          <div>
            <p className="text-base font-bold">{t.title}</p>
            <p className="text-base">{t.msg}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
