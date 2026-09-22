'use client';

import { Activity, Check, Flag, History, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HashChainVerificationResult } from '@/lib/services/audit-service';
import type { ProcessedEvent } from './audit-model';

export function AuditKpiCards({ total, truncated, allEvents, orgId, criticalCount, verifyResult, demoCount }: {
  total: number;
  truncated: boolean;
  allEvents: ProcessedEvent[];
  orgId: string;
  criticalCount: number;
  verifyResult: HashChainVerificationResult | null;
  demoCount: number;
}) {
  return (
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Governance KPIs">
        {/* KPI 1 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Total Ledger Events (server)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-ink tabular-nums">
                  {total.toLocaleString('en-US')}
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-cobalt">
              <History size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-pass-ink font-semibold flex items-center gap-1">
              <Activity size={12} /> {truncated ? 'Window truncated — more on server' : `${allEvents.length} loaded in view`}
            </span>
            <span className="text-muted font-mono">{orgId}</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Critical Events (in view)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-fail tabular-nums">{criticalCount}</span>
                <span className="text-xs font-semibold text-fail-ink">Flagged</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-fail-bg flex items-center justify-center text-fail">
              <ShieldAlert size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-fail-ink font-medium truncate">Severity derived from action code</span>
            <span className="text-muted">{allEvents.length} loaded</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Tamper-Proof Integrity
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={cn('text-2xl font-bold font-display tabular-nums', verifyResult?.valid === false ? 'text-fail' : 'text-pass-ink')}>
                  {verifyResult ? (verifyResult.valid ? '100%' : 'FAIL') : '—'}
                </span>
                <span className="text-xs font-medium text-muted">{verifyResult ? (verifyResult.valid ? 'Verified clean' : 'Mismatch found') : 'Not verified'}</span>
              </div>
            </div>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', verifyResult?.valid === false ? 'bg-fail-bg text-fail' : 'bg-pass-bg text-pass')}>
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-pass-ink font-semibold font-mono flex items-center gap-1">
              <Check size={12} /> {verifyResult ? `${verifyResult.verifiedCount.toLocaleString('en-US')} events checked` : 'Run Verify Cryptographic Root'}
            </span>
            <span className="text-muted font-mono">{verifyResult ? (verifyResult.valid ? '0 Hash Mismatch' : `tamper@#${verifyResult.tamperedEventId}`) : 'on demand'}</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Fallback Demo Rows
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-display text-ink tabular-nums">{demoCount}</span>
                <span className="text-xs font-medium text-muted">Badged DEMO</span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-cobalt-tint flex items-center justify-center text-cobalt">
              <Flag size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle text-[11px]">
            <span className="text-muted flex items-center gap-1">
              Shown only while the server ledger is sparse
            </span>
            <span className="text-pass-ink font-semibold">{demoCount === 0 ? 'Pure ledger' : 'Mixed view'}</span>
          </div>
        </div>
      </section>
  );
}
