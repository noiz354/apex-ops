'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { subscribeAuthSignals } from '@/lib/auth/broadcast';

function activeFromPath(pathname: string): string {
  if (pathname.startsWith('/work-orders')) return 'work-orders';
  if (pathname.startsWith('/service-requests')) return 'service-requests';
  if (pathname.startsWith('/preventive-maintenance')) return 'preventive-maintenance';
  if (pathname.startsWith('/field')) return 'field-inspections';
  if (pathname.startsWith('/assets')) return 'asset-registry';
  if (pathname.startsWith('/facilities')) return 'facility-locations';
  if (pathname.startsWith('/inventory')) return 'inventory-and-parts-ledger';
  if (pathname.startsWith('/purchasing')) return 'purchasing-and-pos';
  if (pathname.startsWith('/vendors')) return 'vendors-and-contractors';
  if (pathname.startsWith('/reports')) return 'reports-and-analytics';
  if (pathname.startsWith('/audit-trail')) return 'audit-trail-and-logs';
  if (pathname.startsWith('/notifications')) return 'notifications-and-sla-alerts';
  if (pathname.startsWith('/organization')) return 'organization-and-rbac';
  if (pathname.startsWith('/settings')) return 'settings-and-system-config';
  return 'operations-dashboard';
}

export interface SessionUserView {
  name: string;
  initials: string;
  role: string;
  title: string;
  email: string;
  orgId: string;
  orgName: string;
}

export function OpsShell({ children, user }: { children: React.ReactNode; user: SessionUserView }) {
  const [palette, setPalette] = useState(false);
  const pathname = usePathname();
  const open = useCallback(() => setPalette(true), []);
  const close = useCallback(() => setPalette(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () =>
      subscribeAuthSignals(() => {
        window.location.assign('/login');
      }),
    [],
  );

  return (
    <>
      <SideNav active={activeFromPath(pathname)} />
      <div className="desktop:pl-72">
        <TopBar onPalette={open} user={user} />
        <main className="relative pt-[92px] min-h-screen px-4 py-6">
          <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
      <CommandPalette open={palette} onClose={close} />
    </>
  );
}
