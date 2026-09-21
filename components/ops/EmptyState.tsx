import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-card p-8 text-center flex flex-col items-center gap-2">
      <Inbox className="text-muted" size={32} />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-[13px] text-muted">{description}</p>
      {action}
    </div>
  );
}
