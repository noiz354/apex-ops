import { WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export function OfflineBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-3 rounded-lg bg-warn-bg border border-warn-dot text-warn-ink text-[13px] font-semibold"
    >
      <WifiOff size={18} />
      <span>{children}</span>
    </div>
  );
}
