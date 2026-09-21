import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ReportDetail {
  id: string;
  title: string;
  category: string;
  generatedAt: string;
  period: string;
  kpis: {
    mttr: string;
    mtbf: string;
    slaAdherence: string;
    totalSpend: string;
  };
  rows: Array<{
    assetCode: string;
    assetName: string;
    events: number;
    downtimeHrs: number;
    slaMet: boolean;
    cost: string;
  }>;
}

const REPORTS: Record<string, ReportDetail> = {
  'RPT-2026-Q2-MTTR': {
    id: 'RPT-2026-Q2-MTTR',
    title: 'Executive MTTR & SLA Compliance Dossier (Q2 2026)',
    category: 'Operations & Reliability Engineering',
    generatedAt: '2026-05-24 12:00 UTC',
    period: '2026-04-01 to 2026-05-24',
    kpis: {
      mttr: '2.4h (Target < 4.0h)',
      mtbf: '840h Operational',
      slaAdherence: '98.2% PASS',
      totalSpend: '$14,250.00 USD',
    },
    rows: [
      { assetCode: 'AST-HVAC-004', assetName: 'Trane CVHE-500 Chiller #04', events: 2, downtimeHrs: 3.5, slaMet: true, cost: '$2,900.00' },
      { assetCode: 'AST-GEN-01', assetName: 'Cummins QSK60 Emergency Gen #01', events: 1, downtimeHrs: 1.2, slaMet: true, cost: '$850.00' },
      { assetCode: 'AST-ENV-108', assetName: 'Cleanroom ISO Class 5 AHU #12', events: 3, downtimeHrs: 4.8, slaMet: true, cost: '$1,620.00' },
      { assetCode: 'AST-ELEC-01', assetName: 'Substation HV Bus Bar #01', events: 1, downtimeHrs: 0.8, slaMet: true, cost: '$450.00' },
    ],
  },
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = REPORTS[id] || {
    id,
    title: `Analytical Performance Report ${id}`,
    category: 'Operations Analytics',
    generatedAt: '2026-05-24 00:00 UTC',
    period: 'Current Month (May 2026)',
    kpis: {
      mttr: '2.8h',
      mtbf: '720h',
      slaAdherence: '97.5%',
      totalSpend: '$8,400.00',
    },
    rows: [
      { assetCode: 'AST-HVAC-004', assetName: 'Central Chiller #04', events: 1, downtimeHrs: 2.1, slaMet: true, cost: '$1,450.00' },
    ],
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/reports">
          Reports &amp; Analytics
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">{report.id}</span>
      </nav>

      {/* Header */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-cobalt">{report.id}</span>
                <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">{report.title}</h1>
                <Badge variant="pass">COMPILED</Badge>
              </div>
              <p className="text-xs text-muted font-mono mt-0.5">
                Category: {report.category} · Period: {report.period} · Generated: {report.generatedAt}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" className="h-9 gap-1.5 text-xs">
              <FileSpreadsheet size={14} /> Export CSV
            </Button>
            <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
              <Download size={14} /> Download PDF Dossier
            </Button>
          </div>
        </div>

        {/* Executive KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-border-subtle text-xs">
          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Mean Time to Repair</span>
            <span className="text-2xl font-bold font-display text-ink tabular-nums">{report.kpis.mttr}</span>
            <span className="text-pass-ink font-semibold block text-[11px] mt-0.5">Within SLA Window</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Mean Time Between Failures</span>
            <span className="text-2xl font-bold font-display text-ink tabular-nums">{report.kpis.mtbf}</span>
            <span className="text-muted block text-[11px] mt-0.5">Reliability Baseline</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">SLA Compliance Rate</span>
            <span className="text-2xl font-bold font-display text-pass-ink tabular-nums">{report.kpis.slaAdherence}</span>
            <span className="text-muted block text-[11px] mt-0.5">Target: 95.0%</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Emergency Spend</span>
            <span className="text-2xl font-bold font-display text-ink tabular-nums">{report.kpis.totalSpend}</span>
            <span className="text-muted block text-[11px] mt-0.5">Parts + Vendor Labor</span>
          </div>
        </div>
      </section>

      {/* Breakdown Data Table */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Asset Reliability Breakdown ({report.rows.length} Units)</h2>
          <span className="text-xs text-muted font-mono">Scope: Nusantara Tower Campus</span>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-surface text-muted text-[10px] font-bold uppercase tracking-wider border-b border-border-subtle">
                <th className="py-2.5 px-3">Asset Code</th>
                <th className="py-2.5 px-3">Equipment Description</th>
                <th className="py-2.5 px-3">Dispatched Incidents</th>
                <th className="py-2.5 px-3">Total Downtime</th>
                <th className="py-2.5 px-3">SLA Threshold</th>
                <th className="py-2.5 px-3 text-right">Attributed Spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-mono">
              {report.rows.map((r) => (
                <tr key={r.assetCode} className="hover:bg-surface transition-colors">
                  <td className="py-2.5 px-3 font-bold text-cobalt">
                    <Link href={`/assets/${r.assetCode}`} className="hover:underline">
                      {r.assetCode}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 font-sans text-body font-semibold">{r.assetName}</td>
                  <td className="py-2.5 px-3 font-bold text-body">{r.events} runs</td>
                  <td className="py-2.5 px-3 text-body">{r.downtimeHrs} hrs</td>
                  <td className="py-2.5 px-3">
                    <Badge variant={r.slaMet ? 'pass' : 'fail'}>
                      {r.slaMet ? 'COMPLIANT' : 'BREACHED'}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-body">{r.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/reports">
          <Button variant="secondary" className="text-xs gap-1">
            <ArrowLeft size={14} /> Back to Reports Hub
          </Button>
        </Link>
      </div>
    </div>
  );
}
