'use client';

import Link from 'next/link';
import {
  ChevronRight,
  Smartphone,
  Workflow,
} from 'lucide-react';


export function FihFastNav() {
  return (
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Field Desks Fast Navigation">
        {/* Fast Link 1: Mobile Tablet Execution Desk */}
        <Link
          href="/field/audits"
          className="rounded-xl bg-card border border-border-subtle p-4 shadow-card hover:shadow-pop transition-all group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <Smartphone size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink group-hover:text-cobalt transition-colors font-display">
                  Tampilan Eksekusi Tablet Mobile
                </h4>
                <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink font-mono text-[10px] font-bold">
                  PWA Offline Siap
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Buka antarmuka inspeksi teknisi rugged dengan scan barcode &amp; log foto.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted group-hover:text-cobalt group-hover:translate-x-1 transition-all" />
        </Link>

        {/* Fast Link 2: Auto-WO Conversion Desk */}
        <Link
          href="/field/findings/FND-2026-0188"
          className="rounded-xl bg-card border border-border-subtle p-4 shadow-card hover:shadow-pop transition-all group flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-fail-bg text-fail flex items-center justify-center shrink-0">
              <Workflow size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-ink group-hover:text-fail transition-colors font-display">
                  Desk Temuan &amp; Konversi WO Otomatis
                </h4>
                <span className="px-2 py-0.5 rounded bg-fail text-white font-mono text-[10px] font-bold">
                  2 Perlu Tindakan
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Triase langkah inspeksi gagal menjadi work order prioritas dengan kru terassign.
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-muted group-hover:text-fail group-hover:translate-x-1 transition-all" />
        </Link>
      </section>
  );
}
