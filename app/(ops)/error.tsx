'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="bg-card border border-fail rounded-lg p-6 flex flex-col gap-3 max-w-xl">
      <div className="flex items-center gap-2 text-fail">
        <AlertTriangle size={20} />
        <h2 className="text-base font-semibold">Something broke while loading this view</h2>
      </div>
      <p className="text-sm text-muted">
        The database may be unavailable. Run <code className="apex-id">npm run db:setup</code> (dev
        server stopped), then retry.
      </p>
      {error.digest && <p className="apex-id text-xs text-muted">trace: {error.digest}</p>}
      <div>
        <Button onClick={reset}>
          <RotateCcw size={16} /> Retry
        </Button>
      </div>
    </div>
  );
}
