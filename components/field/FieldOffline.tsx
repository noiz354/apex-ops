'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OfflineBanner } from '@/components/ops/OfflineBanner';

export function FieldOffline({ queueHref = '/field/sync' }: { queueHref?: string }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const off = () => setOnline(false);
    const on = () => setOnline(true);
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);
  if (online) return null;
  return (
    <OfflineBanner>
      Offline — drafts queue locally.{' '}
      <Link className="underline font-bold" href={queueHref}>Sync queue</Link>
    </OfflineBanner>
  );
}
