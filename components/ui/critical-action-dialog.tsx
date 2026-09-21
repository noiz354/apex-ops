'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';

export type CriticalActionVariant = 'standard' | 'reason' | 'pin' | 'spend';

export interface CriticalActionProps {
  title: string;
  description: string;
  actionLabel?: string;
  variant?: CriticalActionVariant;
  pinRequired?: string;
  spendAmount?: string;
  spendLimit?: string;
  onExecute: (data: { reason?: string; pin?: string }) => Promise<{ success: boolean; auditId?: string; error?: string }>;
  children: React.ReactNode;
}

export function CriticalActionDialog({
  title,
  description,
  actionLabel = 'Authorize Action',
  variant = 'standard',
  pinRequired = '2468',
  spendAmount,
  spendLimit,
  onExecute,
  children,
}: CriticalActionProps) {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'confirm' | 'loading' | 'success' | 'failure'>('confirm');
  const [reason, setReason] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [auditId, setAuditId] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const resetState = () => {
    setPhase('confirm');
    setReason('');
    setPin('');
    setErrorMsg('');
    setAuditId('');
    setTouched(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setTimeout(resetState, 200);
    }
  };

  const isFormValid = () => {
    if (variant === 'reason' && reason.trim().length < 8) return false;
    if (variant === 'pin' && pin.trim() !== pinRequired) return false;
    return true;
  };

  const handleAction = async () => {
    setTouched(true);
    if (!isFormValid()) return;

    setPhase('loading');
    try {
      const res = await onExecute({ reason: reason.trim(), pin: pin.trim() });
      if (res.success) {
        if (!res.auditId) {
          setErrorMsg('Action response missing audit proof — treated as NOT recorded. Retry.');
          setPhase('failure');
        } else {
          setAuditId(res.auditId);
          setPhase('success');
        }
      } else {
        setErrorMsg(res.error || 'The action was rejected by safety or governance policies.');
        setPhase('failure');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'A network or system error occurred while recording the critical action.');
      setPhase('failure');
    }
  };

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialogPrimitive.Trigger asChild>{children}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[75] bg-ink/50 backdrop-blur-sm" />
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <AlertDialogPrimitive.Content className="relative w-full max-w-md bg-card border border-border-subtle rounded-xl shadow-modal p-6 flex flex-col gap-4">
            
            
            {phase === 'confirm' && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-fail/10 text-fail flex items-center justify-center shrink-0">
                    <AlertCircle size={22} />
                  </div>
                  <div>
                    <AlertDialogPrimitive.Title className="text-base font-semibold text-ink">
                      {title}
                    </AlertDialogPrimitive.Title>
                    <AlertDialogPrimitive.Description className="text-xs text-muted mt-1 leading-relaxed">
                      {description}
                    </AlertDialogPrimitive.Description>
                  </div>
                </div>

                {variant === 'spend' && spendAmount && (
                  <div className="bg-surface-subtle border border-border-subtle rounded-lg p-3 text-xs flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Spend Commitment:</span>
                      <strong className="apex-id text-fail font-bold text-sm">{spendAmount}</strong>
                    </div>
                    {spendLimit && (
                      <div className="flex justify-between items-center text-[11px] text-muted">
                        <span>Authorized Capex Ceiling:</span>
                        <span className="apex-id">{spendLimit}</span>
                      </div>
                    )}
                    <span className="text-[11px] text-pass font-medium">✓ Within authorized operational envelope</span>
                  </div>
                )}

                {variant === 'reason' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-ink" htmlFor="crit-reason">
                      Mandatory Business Reason (min 8 chars) <span className="text-fail">*</span>
                    </label>
                    <textarea
                      id="crit-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Specify the operational necessity or override authorization..."
                      className={cn(
                        'w-full p-2.5 text-xs rounded border bg-card text-ink outline-none transition-colors',
                        touched && reason.trim().length < 8 ? 'border-fail ring-1 ring-fail' : 'border-border-strong focus:border-cobalt'
                      )}
                    />
                    {touched && reason.trim().length < 8 && (
                      <p className="text-[11px] text-fail font-semibold">Please provide at least 8 characters justifying this action.</p>
                    )}
                  </div>
                )}

                {variant === 'pin' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-ink flex items-center justify-between" htmlFor="crit-pin">
                      <span>Approver Security PIN (Demo: {pinRequired}) <span className="text-fail">*</span></span>
                      <KeyRound size={14} className="text-muted" />
                    </label>
                    <Input
                      id="crit-pin"
                      type="password"
                      inputMode="numeric"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter 4-digit security PIN"
                      invalid={touched && pin.trim() !== pinRequired}
                      className="apex-id"
                    />
                    {touched && pin.trim() !== pinRequired && (
                      <p className="text-[11px] text-fail font-semibold">Valid 4-digit PIN required for high-risk execution.</p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleAction}>
                    {actionLabel}
                  </Button>
                </div>
              </>
            )}

            
            {phase === 'loading' && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <Loader2 size={36} className="animate-spin text-cobalt" />
                <div>
                  <p className="text-sm font-semibold">Committing Critical Action</p>
                  <p className="text-xs text-muted mt-0.5">Recording cryptographic proof in audit append-only ledger...</p>
                </div>
              </div>
            )}

            
            {phase === 'success' && (
              <div className="flex flex-col gap-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-pass-bg text-pass flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">Action Executed &amp; Recorded</h3>
                  <p className="text-xs text-muted mt-1">
                    The critical operation succeeded. The returned audit ID is recorded — verify it in the audit trail.
                  </p>
                </div>
                <div className="bg-surface-subtle border border-border-subtle rounded-lg p-3 text-xs flex flex-col gap-1 text-left">
                  <div className="flex justify-between">
                    <span className="text-muted">Audit Record ID:</span>
                    <span className="apex-id font-bold text-cobalt">{auditId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Audit Proof:</span>
                    <span className="text-pass font-semibold flex items-center gap-1">
                      <ShieldCheck size={12} /> Audit ID recorded — verify in trail
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Link href={`/audit-trail?search=${auditId}`} onClick={() => handleOpenChange(false)}>
                    <Button variant="secondary">View in Audit Trail</Button>
                  </Link>
                  <Button onClick={() => handleOpenChange(false)}>Done</Button>
                </div>
              </div>
            )}

            {/* Phase: Failure */}
            {phase === 'failure' && (
              <div className="flex flex-col gap-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-fail-bg text-fail flex items-center justify-center mx-auto">
                  <XCircle size={28} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">Action Aborted</h3>
                  <p className="text-xs text-fail mt-1">{errorMsg}</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => handleOpenChange(false)}>Close</Button>
                  <Button variant="destructive" onClick={() => setPhase('confirm')}>Try Again</Button>
                </div>
              </div>
            )}

          </AlertDialogPrimitive.Content>
        </div>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
