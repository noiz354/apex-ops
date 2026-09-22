'use client';

import * as React from 'react';
import { CheckCircle2, Download, FileText, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ProcessedEvent } from './audit-model';
import type { HashChainVerificationResult } from '@/lib/services/audit-service';

export function AuditHeader({
  dateFilter,
  expOpen,
  setExpOpen,
  format,
  setFormat,
  pdfOpen,
  setPdfOpen,
  verifyRootOpen,
  setVerifyRootOpen,
  verifying,
  verifyResult,
  verifyError,
  runVerifyChain,
  filtered,
  total,
  orgId,
  busyExport,
  exportLog,
}: {
  dateFilter: string;
  expOpen: boolean;
  setExpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  format: 'csv' | 'json';
  setFormat: React.Dispatch<React.SetStateAction<'csv' | 'json'>>;
  pdfOpen: boolean;
  setPdfOpen: React.Dispatch<React.SetStateAction<boolean>>;
  verifyRootOpen: boolean;
  setVerifyRootOpen: React.Dispatch<React.SetStateAction<boolean>>;
  verifying: boolean;
  verifyResult: HashChainVerificationResult | null;
  verifyError: string | null;
  runVerifyChain: (open: boolean) => Promise<void>;
  filtered: ProcessedEvent[];
  total: number;
  orgId: string;
  busyExport: boolean;
  exportLog: () => Promise<void>;
}) {
  return (
      <section className="flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Home
          </Link>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Governance &amp; System</span>
          <span>/</span>
          <span className="font-semibold text-body">Audit Trail &amp; System Logs</span>
        </nav>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cobalt-deep flex items-center justify-center text-white shadow-card">
              <ShieldCheck size={22} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display">
                  System Audit Trail &amp; Immutable Event Ledger
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-pass-bg text-pass-ink text-[11px] font-mono font-semibold flex items-center gap-1 shadow-xs border border-pass/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass" />
                  AUDIT LEDGER • APPEND-ONLY
                </span>
              </div>
              <div className="flex items-center gap-3 text-muted text-xs font-mono mt-0.5 flex-wrap">
                <span className="flex items-center gap-1">
                  Tenant ID: <span className="text-body font-bold">{orgId || 'APX-NUSA-01'}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Chain: <span className="text-body font-bold">SHA-256 hash chain (server)</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Tip:{' '}
                  <span
                    className="text-body font-bold"
                    title={verifyResult ? `Root hash: ${verifyResult.rootHash}` : 'Run Verify Cryptographic Root to compute the chain tip'}
                  >
                    {verifyResult ? `${verifyResult.rootHash.slice(0, 12)}…` : 'unverified'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Export Modal */}
            <Dialog open={expOpen} onOpenChange={setExpOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                  <Download size={14} /> Ekspor Log CSV / JSON
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Ekspor Ledger Audit</DialogTitle>
                <DialogDescription>
                  Download {filtered.length} filtered events as raw forensic records.
                </DialogDescription>
                <div className="flex gap-2 my-2">
                  {(['csv', 'json'] as const).map((f) => (
                    <Button
                      key={f}
                      variant={format === f ? 'primary' : 'secondary'}
                      onClick={() => setFormat(f)}
                      className="flex-1"
                    >
                      {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setExpOpen(false)}>
                    Batal
                  </Button>
                  <Button onClick={exportLog} disabled={busyExport}>Unduh {format.toUpperCase()}</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Compliance PDF Dialog */}
            <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                  <FileText size={14} /> Compliance PDF Report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Generate ISO / SOC-2 Compliance Dossier</DialogTitle>
                <DialogDescription>
                  Compiles verified hash-chain events, RBAC approvals, and sign-offs for auditor review.
                </DialogDescription>
                <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-1.5 my-2">
                  <div className="flex justify-between">
                    <span className="text-muted">Standard:</span>
                    <span className="font-semibold">SOC-2 Type II / ISO 55001 Asset Mgmt</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Scope Window:</span>
                    <span className="font-semibold">{dateFilter}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Server Rows Loaded:</span>
                    <span className="font-mono font-bold text-pass-ink">{total.toLocaleString('en-US')} events</span>
                  </div>
                </div>
                <p className="rounded border border-warn/40 bg-warn-bg px-2.5 py-1.5 text-[11px] text-warn-ink my-2">
                  Ekspor PDF belum tersedia — gunakan Ekspor Log CSV / JSON untuk data nyata.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setPdfOpen(false)}>
                    Close
                  </Button>
                  <Button disabled title="PDF export is not implemented">
                    Generate &amp; Download PDF
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Verify Cryptographic Root Dialog */}
            <Dialog open={verifyRootOpen} onOpenChange={runVerifyChain}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                  <CheckCircle2 size={14} className="text-pass" /> Verify Cryptographic Root
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogTitle className="flex items-center gap-2">
                  {verifyResult?.valid ? (
                    <ShieldCheck className="text-pass" size={20} />
                  ) : (
                    <ShieldAlert className={verifyResult && !verifyResult.valid ? 'text-fail' : 'text-warn'} size={20} />
                  )}{' '}
                  Hash-Chain Verification (server)
                </DialogTitle>
                <DialogDescription>
                  Full SHA-256 chain recomputed over all {orgId}-scoped ledger events — on request, no client-side claims.
                </DialogDescription>
                {verifying && (
                  <p className="text-xs font-mono text-muted py-6 text-center" role="status">
                    Recomputing chain server-side…
                  </p>
                )}
                {verifyError && (
                  <div className="p-2.5 rounded bg-fail-bg border border-fail text-xs font-mono text-fail-ink my-2" role="alert">
                    {verifyError}
                  </div>
                )}
                {!verifying && verifyResult && (
                  <div className="space-y-2 text-xs font-mono my-2">
                    <div className="p-2.5 rounded bg-surface border border-border-subtle flex flex-col gap-1">
                      <span className="text-muted">Root Hash (SHA-256 chain tip):</span>
                      <span className="text-cobalt-deep font-bold break-all">{verifyResult.rootHash}</span>
                    </div>
                    <div className="p-2.5 rounded bg-surface border border-border-subtle flex flex-col gap-1">
                      <span className="text-muted">Genesis Hash (org-scoped):</span>
                      <span className="text-body break-all">{verifyResult.genesisHash}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded bg-surface border border-border-subtle">
                        <span className="text-muted block">Events Verified:</span>
                        <span className="font-bold text-body">{verifyResult.verifiedCount.toLocaleString('en-US')}</span>
                      </div>
                      <div className="p-2.5 rounded bg-surface border border-border-subtle">
                        <span className="text-muted block">Chain Status:</span>
                        <span className={cn('font-bold', verifyResult.valid ? 'text-pass-ink' : 'text-fail')}>
                          {verifyResult.valid ? 'VALID — no mismatch' : `TAMPERED @ event #${verifyResult.tamperedEventId}`}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-surface border border-border-subtle col-span-2">
                        <span className="text-muted block">Verified At (server clock):</span>
                        <span className="font-bold text-body">{new Date(verifyResult.verificationTimestamp).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => runVerifyChain(true)} disabled={verifying}>
                    Re-run
                  </Button>
                  <Button onClick={() => setVerifyRootOpen(false)}>Done</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>
  );
}
