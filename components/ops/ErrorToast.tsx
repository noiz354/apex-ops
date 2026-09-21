'use client';

import { useState } from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

export function ErrorToast({
  title,
  trace,
  onRetry,
}: {
  title: string;
  trace: string;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="alert" className="rounded-lg shadow-modal p-4 flex gap-3 items-start bg-fail-bg border border-fail text-fail-ink max-w-sm">
      <AlertCircle size={20} className="shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="apex-id mt-0.5">{trace}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 h-8 px-3 rounded bg-card/60 text-xs font-bold inline-flex items-center gap-1"
        >
          <RotateCcw size={14} /> Retry
        </button>
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => setOpen(false)} className="font-bold">
        <X size={16} />
      </button>
    </div>
  );
}
