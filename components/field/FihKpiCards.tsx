'use client';

import {
  AlertOctagon,
  CheckCircle2,
  ClipboardCheck,
  CloudCog,
  Smartphone,
  TrendingUp,
} from 'lucide-react';


export function FihKpiCards() {
  return (
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Inspection KPIs">
        {/* KPI 1 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Protokol Inspeksi Aktif</span>
            <ClipboardCheck size={18} className="text-cobalt" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-ink tabular-nums">24</span>
            <span className="text-xs text-muted font-medium">Protokol</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span className="flex items-center gap-1 text-body">
              <span className="w-1.5 h-1.5 rounded-full bg-cobalt" />
              100% Terpetakan
            </span>
            <span className="text-pass-ink font-semibold">+2 Baru (Bln-Berjalan)</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">SLA Kepatuhan Inspeksi</span>
            <CheckCircle2 size={18} className="text-pass" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-pass-ink tabular-nums">98.2%</span>
            <span className="text-xs font-semibold text-pass-ink">LULUS</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>Target: <strong className="text-body font-mono">95.0%</strong></span>
            <span className="text-pass-ink font-semibold flex items-center gap-0.5">
              <TrendingUp size={12} /> Sesuai Jalur (+3,2%)
            </span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Defek / Cek Gagal (7hr)</span>
            <AlertOctagon size={18} className="text-fail" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-fail tabular-nums">08</span>
            <span className="text-xs font-medium text-fail-ink">Temuan Kritis</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>6 Terkonversi Otomatis</span>
            <span className="px-1.5 py-0.5 rounded-full bg-fail-bg text-fail-ink font-semibold">2 Menunggu Triase</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Submisi Mobile Hari Ini</span>
            <Smartphone size={18} className="text-cobalt-deep" />
          </div>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-display text-ink tabular-nums">14</span>
            <span className="text-xs text-muted font-medium">Run Selesai</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-muted border-t border-border-subtle">
            <span>Shift A: <strong className="text-body font-mono">9</strong> | B: <strong className="text-body font-mono">5</strong></span>
            <span className="text-pass-ink font-semibold flex items-center gap-1">
              <CloudCog size={12} /> Sinkron: KPI demo (tidak tersambung)
            </span>
          </div>
        </div>
      </section>
  );
}
