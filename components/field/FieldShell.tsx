'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, CloudUpload, ListChecks, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subscribeAuthSignals } from '@/lib/auth/broadcast';
import { listOutbox, flushOutbox, subscribeOutbox } from '@/lib/offline/outbox';

const RUN_HREF = '/field/audits/INS-2026-0412/run';

export function FieldShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const items = await listOutbox();
      setPending(items.filter((i) => i.status !== 'SYNCED' && i.status !== 'EXPIRED').length);
    };
    const onOnline = async () => {
      try {
        await flushOutbox({});
      } catch {
        // Replay failures stay queued with FAILED status — badge still refreshes.
      }
      await refresh();
    };
    void refresh();
    const unsub = subscribeOutbox(() => void refresh());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', refresh);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  useEffect(
    () =>
      subscribeAuthSignals(() => {
        window.location.assign('/login');
      }),
    [],
  );

  const tabs = [
    { href: '/field/audits', label: 'Audits', Icon: ClipboardList, badge: 3, badgeTone: 'bg-fail', active: path === '/field/audits' },
    { href: RUN_HREF, label: 'Checklist', Icon: ListChecks, badge: 0, badgeTone: '', active: path.endsWith('/run') },
    { href: '/field/findings/new', label: 'Temuan', Icon: TriangleAlert, badge: 0, badgeTone: '', active: path.startsWith('/field/findings') },
    { href: '/field/sync', label: 'Sinkron', Icon: CloudUpload, badge: pending, badgeTone: 'bg-warn', active: path === '/field/sync' },
  ];
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 w-full pb-28">{children}</div>
      <nav className="no-print fixed bottom-0 w-full z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t-2 border-slate900" aria-label="Lapangan">
        <div className="h-20 px-4 flex items-stretch justify-around max-w-3xl mx-auto w-full">
          {tabs.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              aria-current={t.active ? 'page' : undefined}
              data-path={t.label.toLowerCase()}
              className={cn(
                'flex-1 min-w-[48px] flex flex-col items-center justify-center gap-1 active:scale-95 relative',
                t.active ? 'text-ink font-bold after:content-[""] after:absolute after:bottom-1 after:w-8 after:h-0.5 after:bg-slate900' : 'text-muted'
              )}
            >
              <span className="relative flex items-center justify-center">
                <t.Icon size={24} />
                {t.badge > 0 && (
                  <span className={cn('absolute -top-1 -right-2 px-1 rounded text-white text-[10px] leading-tight font-bold min-w-[16px] text-center', t.badgeTone)}>
                    {t.badge}
                  </span>
                )}
              </span>
              <span className="text-xs font-medium">{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
