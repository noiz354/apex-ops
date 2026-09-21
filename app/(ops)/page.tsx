import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/context';
import { getDb } from '@/db/client';
import { getDashboard, type WoRow } from '@/lib/services/wo-service';
import { CANON } from '@/lib/canon';
import { redirect } from 'next/navigation';

function statusTone(row: WoRow): 'pass' | 'warn' | 'fail' | 'info' {
  if (row.slaLabel.includes('BREACH')) return 'fail';
  switch (row.status) {
    case 'ESCALATED':
    case 'ON_HOLD':
      return 'fail';
    case 'IN_PROGRESS':
    case 'DISPATCHED':
      return 'warn';
    case 'COMPLETED':
      return 'pass';
    default:
      return 'info';
  }
}

const EVENT_DOT: Record<string, string> = {
  CREATE: 'bg-cobalt', START: 'bg-pass', HOLD: 'bg-warn-dot', ESCALATE: 'bg-fail',
  COMPLETE: 'bg-pass', CANCEL: 'bg-muted', ASSIGN: 'bg-cobalt', RESUME: 'bg-pass',
};

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const data = await getDashboard(getDb(), ctx);
  const { kpis, rows, events } = data;
  const topP1 = rows.find((r) => r.priority === 'P1');

  const cards = [
    { label: 'Open Work Orders', value: String(kpis.open), delta: `tenant ${ctx.orgId}`, tone: 'info' as const },
    { label: 'P1 Critical', value: String(kpis.p1), delta: topP1 ? `${topP1.number} · ${topP1.slaLabel}` : 'no open P1', tone: kpis.p1 > 0 ? ('fail' as const) : ('pass' as const) },
    { label: 'Assigned Techs', value: String(kpis.techs), delta: 'distinct assignees on open WOs', tone: 'info' as const },
    {
      label: 'SLA Compliance',
      value: kpis.slaCompliance === null ? '—' : `${kpis.slaCompliance}%`,
      delta: kpis.slaCompliance === null ? 'no completions yet' : 'completed within SLA',
      tone: kpis.slaCompliance !== null && kpis.slaCompliance < 95 ? ('warn' as const) : ('pass' as const),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations Dashboard</h1>
          <p className="text-[13px] text-muted">
            Active dispatch line · real data from PostgreSQL · tenant {ctx.orgId}
          </p>
        </div>
        <Link href={`/work-orders/${CANON.workOrderSeal}`}>
          <Button>Open {CANON.workOrderSeal}</Button>
        </Link>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="KPIs">
        {cards.map((k) => (
          <div key={k.label} className="bg-card border border-border-subtle rounded-lg p-4 flex flex-col gap-1 shadow-card">
            <span className="apex-label-caps text-muted">{k.label}</span>
            <span className={`text-4xl font-bold tracking-tight tabular-nums ${k.tone === 'fail' ? 'text-fail' : k.tone === 'warn' ? 'text-warn-ink' : ''}`}>{k.value}</span>
            <span className="text-[11px] text-muted apex-id">{k.delta}</span>
          </div>
        ))}
      </section>

      <section className="bg-card border border-border-subtle rounded-lg shadow-card overflow-hidden" aria-label="Dispatch queue">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-base font-semibold">Dispatch Queue</h2>
          <span className="apex-id text-muted">Postgres · tenant {ctx.orgId} · {rows.length} open</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="h-9 bg-surface border-b border-border-subtle text-left">
                <th className="apex-label-caps text-muted px-4">Work Order</th>
                <th className="apex-label-caps text-muted px-4">Title</th>
                <th className="apex-label-caps text-muted px-4">Location</th>
                <th className="apex-label-caps text-muted px-4">Pri</th>
                <th className="apex-label-caps text-muted px-4">Status</th>
                <th className="apex-label-caps text-muted px-4">SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.number} className={i % 2 ? 'bg-[#FBFCFD] border-b border-surface-subtle' : 'border-b border-surface-subtle hover:bg-surface-subtle'}>
                  <td className="px-4 py-2.5">
                    <Link href={`/work-orders/${r.number}`} className="apex-id font-bold text-cobalt hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 max-w-xs">{r.title}</td>
                  <td className="px-4 py-2.5">{r.location}</td>
                  <td className="px-4 py-2.5 apex-id font-bold whitespace-nowrap">{r.priority}-CRITICAL</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusTone(r)}>{r.statusLabel}</Badge>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums apex-id">{r.slaLabel}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No open work orders — create one from <Link className="text-cobalt font-semibold hover:underline" href="/work-orders">Work Orders</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border border-border-subtle rounded-lg p-4 shadow-card">
          <h2 className="text-base font-semibold mb-2">Chiller #04 — Telemetry (simulated)</h2>
          <ul className="text-[13px] flex flex-col gap-2">
            <li className="flex justify-between"><span className="text-muted">Seal cavity temp</span><strong className="tabular-nums text-fail">84.1°C ▲</strong></li>
            <li className="flex justify-between"><span className="text-muted">Bearing vibration</span><strong className="tabular-nums text-fail">7.8 mm/s ▲</strong></li>
            <li className="flex justify-between"><span className="text-muted">Refrigerant sniff</span><strong className="tabular-nums text-warn">18.4 ppm</strong></li>
            <li className="flex justify-between"><span className="text-muted">Chilled water ΔP</span><strong className="tabular-nums text-pass">6.9 BAR ●</strong></li>
          </ul>
        </div>
        <div className="bg-card border border-border-subtle rounded-lg p-4 shadow-card">
          <h2 className="text-base font-semibold mb-2">Execution Feed <span className="text-xs font-normal text-muted">(real work-order events)</span></h2>
          <ol className="text-[13px] flex flex-col gap-2 border-l-2 border-border-subtle ml-1">
            {events.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="pl-4 relative">
                <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${EVENT_DOT[e.action] ?? 'bg-cobalt'}`} />
                <Link href={`/work-orders/${e.workOrderNumber}`} className="apex-id font-bold text-cobalt hover:underline">{e.workOrderNumber}</Link>{' '}
                {e.action.toLowerCase().replace('_', ' ')} by {e.actorName}
                {e.reason && <span className="text-muted"> — {e.reason}</span>}
              </li>
            ))}
            {events.length === 0 && <li className="pl-4 text-muted">No work-order events yet.</li>}
          </ol>
        </div>
      </section>
    </>
  );
}
