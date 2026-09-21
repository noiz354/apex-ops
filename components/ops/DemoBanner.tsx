import { TriangleAlert } from 'lucide-react';

export function DemoBanner() {
  return (
    <div
      role="status"
      className="no-print fixed top-0 inset-x-0 z-[70] flex h-7 items-center justify-center gap-2 border-b border-warn-dot bg-warn-bg px-3 text-[11px] font-semibold text-warn-ink"
    >
      <TriangleAlert size={13} className="shrink-0" aria-hidden="true" />
      <p className="truncate">
        DEMO — real auth + work-order flow (Postgres) · other screens still simulated ·{' '}
        <span className="apex-id">docs/PHASE1_SLICE1.md</span>
      </p>
    </div>
  );
}
