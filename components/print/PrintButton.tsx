'use client';

import { Printer } from 'lucide-react';

export function PrintButton({
  label,
  className = 'h-8 px-3 rounded bg-black text-white text-xs font-bold flex items-center gap-1.5',
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => window.print()}
    >
      <Printer size={14} /> {label}
    </button>
  );
}
