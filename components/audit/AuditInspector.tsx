'use client';

import * as React from 'react';
import { AlertTriangle, Check, Copy, FileDown, Flag, History, KeyRound, Lock, Network, Shield, ShieldCheck, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ProcessedEvent, ViewMode } from './audit-model';
import type { HashChainVerificationResult } from '@/lib/services/audit-service';

export function AuditInspector({
  viewMode,
  setViewMode,
  copiedHash,
  verifyResult,
  rollbackOpen,
  setRollbackOpen,
  flagOpen,
  setFlagOpen,
  flagReason,
  setFlagReason,
  flagNotes,
  setFlagNotes,
  sel,
  copyHash,
  submitFlag,
  downloadEvidence,
  push,
}: {
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  copiedHash: boolean;
  verifyResult: HashChainVerificationResult | null;
  rollbackOpen: boolean;
  setRollbackOpen: React.Dispatch<React.SetStateAction<boolean>>;
  flagOpen: boolean;
  setFlagOpen: React.Dispatch<React.SetStateAction<boolean>>;
  flagReason: string;
  setFlagReason: React.Dispatch<React.SetStateAction<string>>;
  flagNotes: string;
  setFlagNotes: React.Dispatch<React.SetStateAction<string>>;
  sel: ProcessedEvent | null;
  copyHash: (text: string) => void;
  submitFlag: () => void;
  downloadEvidence: (e: ProcessedEvent) => void;
  push: (ok: boolean, title: string, msg: string) => void;
}) {
  return (
        <div className="lg:col-span-5 flex flex-col gap-4 sticky top-12">
          {sel ? (
            <div className="bg-card rounded-xl border border-border-subtle shadow-card overflow-hidden flex flex-col">
              {/* Context Header */}
              <div className="p-4 bg-surface border-b border-border-subtle flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Shield className="text-cobalt" size={16} />
                    <h3 className="text-sm font-bold text-ink">
                      State Transition &amp; Diff Inspector
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink text-[10px] font-mono font-bold flex items-center gap-1 border border-pass/30">
                    <Lock size={10} /> APPEND-ONLY
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-muted uppercase">Entity:</span>
                    <span className="font-mono text-xs font-bold text-cobalt">
                      {sel.entityId}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-surface border border-border-subtle text-muted text-[10px] font-semibold">
                      {sel.entityType}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted flex items-center gap-1.5">
                    <span>Event #{sel.id}</span>
                    {sel.demo && (
                      <span
                        className="px-1.5 py-0.2 rounded bg-warn-bg border border-warn/40 text-warn-ink text-[10px] font-bold uppercase"
                        title="Demonstration row — not part of the server ledger"
                      >
                        Demo
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cryptographic Proof Bar */}
              <div className="px-4 py-2.5 bg-cobalt-tint/40 border-b border-border-subtle flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted uppercase">
                    Cryptographic Event Hash (server):
                  </span>
                  {sel.hash ? (
                    <button
                      type="button"
                      onClick={() => copyHash(sel.hash)}
                      className="text-[11px] font-mono text-cobalt hover:underline flex items-center gap-1"
                    >
                      {copiedHash ? <Check size={12} className="text-pass" /> : <Copy size={12} />}
                      {copiedHash ? 'Copied' : 'Copy Full Hash'}
                    </button>
                  ) : null}
                </div>
                {sel.hash ? (
                  <div className="font-mono text-[11px] text-body bg-card border border-border-subtle px-2 py-1 rounded truncate select-all">
                    {sel.hash}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted bg-card border border-dashed border-border-subtle px-2 py-1 rounded">
                    No chain-hash recorded for this event (fallback/demo entry). Open <strong>Verify Cryptographic Root</strong> to run the server-side chain check over all real ledger rows.
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] text-muted font-mono pt-0.5">
                  <span className="flex items-center gap-1">
                    <Terminal size={11} className="text-cobalt" />
                    <span>POST /api/audit-trail/verify-chain</span>
                  </span>
                  <span className="text-muted flex items-center gap-1">
                    <ShieldCheck size={11} className="text-cobalt" /> Chain verified on request — not continuous
                  </span>
                </div>
              </div>

              {/* Diff View Mode Selector */}
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center p-0.5 bg-surface border border-border-subtle rounded-lg">
                    <button
                      type="button"
                      onClick={() => setViewMode('diff')}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
                        viewMode === 'diff'
                          ? 'bg-card text-body shadow-xs'
                          : 'text-muted hover:text-body'
                      )}
                    >
                      Formatted Diff (Field-by-Field)
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      className={cn(
                        'px-2.5 py-1 rounded text-xs font-semibold transition-colors',
                        viewMode === 'raw'
                          ? 'bg-card text-body shadow-xs'
                          : 'text-muted hover:text-body'
                      )}
                    >
                      Raw JSON Payload
                    </button>
                  </div>
                  <span className="text-[11px] font-mono text-muted">
                    {sel.diffs.length} Fields Mutated
                  </span>
                </div>

                {/* Formatted Diff Table */}
                {viewMode === 'diff' ? (
                  <div className="flex flex-col gap-2 rounded-lg bg-surface border border-border-subtle p-2">
                    {sel.diffs.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-card border border-border-subtle rounded flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-body">
                            field: {d.field}
                          </span>
                          <span className="text-[10px] font-bold text-muted uppercase">
                            {d.tag}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <div className="p-2 rounded bg-fail-bg/70 border border-fail/20 text-fail-ink line-through break-all">
                            - {d.oldVal}
                          </div>
                          <div className="p-2 rounded bg-pass-bg/70 border border-pass/20 text-pass-ink font-semibold break-all">
                            + {d.newVal}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate900 p-3 overflow-x-auto text-white">
                    <pre className="font-mono text-[11px] leading-relaxed">
                      <code>
                        {JSON.stringify(
                          {
                            event_id: `EVT-${sel.id}`,
                            action: sel.action,
                            entity: {
                              type: sel.entityType,
                              id: sel.entityId,
                            },
                            actor: {
                              name: sel.actorName,
                              role: sel.actorRole,
                            },
                            before: sel.before,
                            after: sel.after,
                            hash: sel.hash,
                            request_id: sel.requestId,
                            session: sel.session,
                          },
                          null,
                          2
                        )}
                      </code>
                    </pre>
                  </div>
                )}
              </div>

              {/* Actor & Session Metadata Sub-Card */}
              <div className="p-4 bg-surface border-t border-b border-border-subtle flex flex-col gap-2 text-xs">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                  Authentication &amp; Session Envelope
                </span>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Verified Identity</span>
                    <span className="font-semibold text-body">
                      {sel.actorName}
                      {sel.session.badge ? ` (${sel.session.badge})` : ''}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">IP &amp; Subnet</span>
                    <span className="font-mono text-body text-[11px]" title={sel.session.ip ? undefined : 'Not recorded by the server'}>
                      {sel.session.ip ?? '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Client Environment</span>
                    <span className="text-body font-mono text-[11px] truncate" title={sel.session.env ?? 'Not recorded by the server'}>
                      {sel.session.env ?? '—'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted">Physical Station</span>
                    <span className="text-body" title={sel.session.location ? undefined : 'Not recorded by the server'}>
                      {sel.session.location ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="mt-1 pt-1.5 flex items-center justify-between bg-card border border-border-subtle px-2.5 py-1.5 rounded">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <KeyRound size={12} className="text-pass" /> Two-Factor Auth:
                  </span>
                  <span
                    className="font-mono text-[11px] text-pass-ink font-bold"
                    title={sel.session.mfa ? undefined : 'Not recorded by the server'}
                  >
                    {sel.session.mfa ?? '—'}
                  </span>
                </div>
              </div>

              {/* Forensic Action Buttons */}
              <div className="p-3 bg-card flex items-center justify-between gap-2 flex-wrap">
                <Button
                  variant="secondary"
                  onClick={() => downloadEvidence(sel)}
                  className="h-8 px-2.5 text-xs gap-1"
                  title="Unsigned JSON snapshot of this event plus chain status"
                >
                  <FileDown size={13} /> Download Event Evidence (JSON)
                </Button>

                <div className="flex items-center gap-1.5">
                  {/* Rollback Simulation Dialog */}
                  <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" className="h-8 px-2.5 text-xs gap-1">
                        <History size={13} /> Rollback Simulation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="text-warn" size={18} /> Rollback Dry-Run Simulation
                      </DialogTitle>
                      <DialogDescription>
                        Evaluate compensating transaction impact for Event #{sel.id} ({sel.entityId}).
                      </DialogDescription>
                      <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-2 my-2">
                        <div className="flex justify-between">
                          <span className="text-muted">Target Entity:</span>
                          <span className="font-mono font-bold text-cobalt">{sel.entityId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Target Action:</span>
                          <span className="font-mono font-bold">{sel.action}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Ledger Guard:</span>
                          <span className="font-semibold text-pass-ink">APPEND-ONLY (no update API)</span>
                        </div>
                        <p className="text-[11px] text-muted pt-2 border-t border-border-subtle">
                          <strong>Note:</strong> this is a dry-run simulation — it writes nothing to the ledger. A real reversal would issue a new compensating audit block with <span className="font-mono">action: REVERT_{sel.action}</span> and cross-reference block #{sel.id}.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setRollbackOpen(false)}>
                          Batal
                        </Button>
                        <Button
                          onClick={() => {
                            setRollbackOpen(false);
                            push(true, 'Dry-Run Rollback Selesai', 'Hanya simulasi — tidak ada tulis ke ledger.');
                          }}
                        >
                          Acknowledge Dry-Run
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  {/* Flag Review Dialog */}
                  <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="h-8 px-2.5 text-xs gap-1">
                        <Flag size={13} /> Flag Review
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="flex items-center gap-2">
                        <Flag className="text-fail" size={18} /> Flag Event for Compliance Review
                      </DialogTitle>
                      <DialogDescription>
                        Escalates Event #{sel.id} ({sel.entityId}) to the Security &amp; Audit Committee.
                      </DialogDescription>
                      <p className="rounded border border-warn/40 bg-warn-bg px-2.5 py-1.5 text-[11px] text-warn-ink my-2">
                        Server-side escalation is not implemented — confirming records nothing on the server.
                      </p>
                      <div className="space-y-3 my-2 text-xs">
                        <div>
                          <label className="font-semibold block mb-1">Flag Category</label>
                          <select
                            value={flagReason}
                            onChange={(e) => setFlagReason(e.target.value)}
                            className="w-full h-8 px-2 border border-border-strong rounded text-xs bg-card"
                          >
                            <option>Suspicious Privilege Escalation</option>
                            <option>Off-hours Threshold Breach</option>
                            <option>Unusual Asset State Modification</option>
                            <option>Fiscal Cap Deviation</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Investigation Notes (Optional)</label>
                          <textarea
                            value={flagNotes}
                            onChange={(e) => setFlagNotes(e.target.value)}
                            placeholder="Jelaskan alasan eskalasi keamanan..."
                            rows={3}
                            className="w-full p-2 border border-border-strong rounded text-xs bg-card"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setFlagOpen(false)}>
                          Batal
                        </Button>
                        <Button variant="destructive" onClick={submitFlag}>
                          Konfirmasi Eskalasi Flag
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border-subtle p-8 text-center text-muted">
              Select an event from the activity stream to inspect its cryptographic state transition.
            </div>
          )}

          {/* Cryptographic Ledger Health Widget — honest: state hanya dari verify-chain nyata */}
          <div className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Network className="text-pass" size={16} />
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Ledger Integrity
                </h4>
              </div>
              <span className={cn(
                'font-mono text-[10px] font-bold px-2 py-0.5 rounded border',
                verifyResult
                  ? verifyResult.valid
                    ? 'text-pass-ink bg-pass-bg border-pass/30'
                    : 'text-fail bg-fail-bg border-fail/30'
                  : 'text-muted bg-surface border-border-subtle',
              )}>
                {verifyResult ? (verifyResult.valid ? 'VALID' : 'MISMATCH') : 'UNVERIFIED'}
              </span>
            </div>

            {verifyResult ? (
              <div className="grid grid-cols-3 gap-2 text-center pt-1 text-xs">
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Events
                  </span>
                  <span className="font-mono font-bold text-body">{verifyResult.verifiedCount.toLocaleString('en-US')}</span>
                </div>
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Root Hash
                  </span>
                  <span className="font-mono font-bold text-body" title={verifyResult.rootHash}>{verifyResult.rootHash.slice(0, 8)}…</span>
                </div>
                <div className="p-2 bg-surface rounded border border-border-subtle">
                  <span className="text-[10px] text-muted uppercase font-bold block">
                    Checked At
                  </span>
                  <span className="font-mono font-bold text-pass-ink">
                    {new Date(verifyResult.verificationTimestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted leading-snug">
                Integrity is computed on demand by the server — this panel shows no claim until <strong>Verify Cryptographic Root</strong> is run.
              </p>
            )}
          </div>
        </div>
  );
}
