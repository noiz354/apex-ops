import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'critical';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn(
        'px-4 py-3 rounded-lg border text-[13px] font-semibold flex items-center gap-2',
        tone === 'info' && 'bg-cobalt-tint border-cobalt-bright text-cobalt-deep',
        tone === 'warn' && 'bg-warn-bg border-warn-dot text-warn-ink',
        tone === 'critical' && 'bg-fail-bg border-fail-dot text-fail-ink'
      )}
    >
      {children}
    </div>
  );
}
