'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  PackageCheck, 
  ShieldAlert, 
  SlidersHorizontal, 
  Sparkles, 
  WifiOff, 
  XCircle,
  FileCheck2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SlaCountdown, LaborStopwatch } from '@/components/ops/WoTimers';
import { CriticalActionDialog } from '@/components/ui/critical-action-dialog';

export default function UiPatternsGalleryPage() {
  const [toastVisible, setToastVisible] = useState(false);
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [inputVal, setInputVal] = useState('Marcus Kowalski (ID: TECH-094)');
  const [inputError, setInputError] = useState(true);

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Design System &amp; UI State Matrix</span>
      </nav>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="pass">DESIGN SYSTEM A</Badge>
              <Badge variant="info">WORKSPACE RUNTIME</Badge>
              <span className="text-xs font-mono text-muted">Apex Ops Pattern Spec v2.4</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Interactive UI State Matrix &amp; Component Gallery</h1>
            <p className="text-sm text-muted">
              Live specification and QA harness for asynchronous micro-frontends: empty states, form validation topography, loading skeletons, timers, and critical action dialogs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOfflineVisible(!offlineVisible)}>
              <WifiOff size={16} /> Toggle Offline Banner
            </Button>
            <Button variant="secondary" onClick={() => setToastVisible(!toastVisible)}>
              <AlertCircle size={16} /> Toggle Error Toast
            </Button>
          </div>
        </div>
      </section>

      
      {offlineVisible && (
        <div className="bg-fail-bg border border-fail rounded-lg p-3 text-fail-ink flex items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <WifiOff size={18} className="text-fail shrink-0" />
            <span>
              <strong>OFFLINE NETWORK DISCONNECTED:</strong> Background SCADA telemetry suspended. Local mutations queued to IndexedDB outbox with idempotent retry keys.
            </span>
          </div>
          <Button variant="secondary" className="h-7 text-xs bg-white text-fail border-fail" onClick={() => setOfflineVisible(false)}>
            Dismiss
          </Button>
        </div>
      )}

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Layers size={18} className="text-cobalt" /> §01 Zero-State &amp; Clean Queue Patterns
          </h2>
          <span className="text-xs text-muted font-mono">Component: &lt;EmptyState /&gt;</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-dashed border-border-subtle rounded-lg p-6 bg-surface flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-pass-bg text-pass flex items-center justify-center mb-3">
              <FileCheck2 size={24} />
            </div>
            <Badge variant="pass" className="mb-2">STATUS: CLEAN QUEUE · SLA RISK 0.0%</Badge>
            <h3 className="text-base font-bold text-ink">All Caught Up! No Pending Service Requests</h3>
            <p className="text-xs text-muted max-w-sm mt-1">
              Building automation systems (BMS) and emergency hotlines report nominal baseline. Dispatch team is fully available for proactive rounds.
            </p>
            <div className="flex gap-2 mt-4">
              <Link href="/service-requests"><Button variant="secondary" className="text-xs">View Archived</Button></Link>
              <Link href="/service-requests/new"><Button className="text-xs">Create Request</Button></Link>
            </div>
          </div>

          <div className="border border-dashed border-border-subtle rounded-lg p-6 bg-surface flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-pass-bg text-pass flex items-center justify-center mb-3">
              <PackageCheck size={24} />
            </div>
            <Badge variant="pass" className="mb-2">WAREHOUSE HEALTH: 100% NOMINAL</Badge>
            <h3 className="text-base font-bold text-ink">Optimal Stock Levels · Zero Critical Shortages</h3>
            <p className="text-xs text-muted max-w-sm mt-1">
              All 1,420 active SKU inventory bins meet minimum buffer requirements. Chiller mechanical seals and MERV 14 filters are staged in local lockers.
            </p>
            <div className="flex gap-2 mt-4">
              <Link href="/inventory"><Button variant="secondary" className="text-xs">Review Par Levels</Button></Link>
              <Link href="/purchasing"><Button className="text-xs">Create Requisition</Button></Link>
            </div>
          </div>
        </div>
      </section>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ShieldAlert size={18} className="text-fail" /> §02 Validation Architecture &amp; Error Topography
          </h2>
          <Badge variant="fail">2 ERRORS DETECTED</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink" htmlFor="err-tech">
              Assigned Lead Technician <span className="text-fail">*</span>
            </label>
            <Input
              id="err-tech"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                setInputError(e.target.value.includes('TECH-094'));
              }}
              invalid={inputError}
            />
            {inputError && (
              <p className="text-xs text-fail font-medium flex items-center gap-1 mt-0.5">
                <AlertCircle size={14} /> Over-allocation warning: Technician currently leads WO-2026-0894 (P1 active stopwatch).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink" htmlFor="err-sku">
              Staged Spare Part SKU <span className="text-fail">*</span>
            </label>
            <Input
              id="err-sku"
              value="PART-SEAL-8821"
              readOnly
              className="apex-id"
            />
            <p className="text-xs text-pass font-medium flex items-center gap-1 mt-0.5">
              <CheckCircle2 size={14} /> Verified in stock: 145 pcs available at CRIB-B / Bay 01.
            </p>
          </div>
        </div>
      </section>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock size={18} className="text-cobalt" /> §03 Real-Time Timer &amp; Stopwatch Components
          </h2>
          <span className="text-xs text-muted font-mono">&lt;SlaCountdown /&gt; · &lt;LaborStopwatch /&gt;</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-border-subtle rounded-lg p-4 bg-surface flex flex-col gap-1">
            <span className="apex-label-caps text-muted">SLA Active Countdown</span>
            <SlaCountdown startSec={7245} breached={false} />
            <span className="text-[11px] text-muted">Priority 1 Window · 2h 00m Remaining</span>
          </div>

          <div className="border border-border-subtle rounded-lg p-4 bg-surface flex flex-col gap-1">
            <span className="apex-label-caps text-muted">SLA Breached State</span>
            <SlaCountdown startSec={0} breached={true} />
            <span className="text-[11px] text-fail font-semibold">Automatic VP Operations Escalation Triggered</span>
          </div>

          <div className="border border-border-subtle rounded-lg p-4 bg-surface flex flex-col gap-1">
            <span className="apex-label-caps text-muted">Technician Labor Stopwatch</span>
            <LaborStopwatch startSec={6138} isRunning={true} />
            <span className="text-[11px] text-pass font-medium">Running Clock: Marcus Kowalski</span>
          </div>
        </div>
      </section>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles size={18} className="text-cobalt" /> §04 Critical Action &amp; Consensus Dialogs
          </h2>
          <span className="text-xs text-muted font-mono">&lt;CriticalActionDialog /&gt;</span>
        </div>

        <div className="flex flex-wrap gap-4">
          <CriticalActionDialog
            title="Authorize Emergency High-Voltage Breaker Trip?"
            description="Tripping breaker MCC-CUP-BKR-04 cuts power to Chiller Plant #4 immediately. Requires mandatory business justification and approver PIN."
            variant="reason"
            onExecute={async () => {
              await new Promise((r) => setTimeout(r, 1200));
              return { success: true, auditId: 'EVT-HV-991204' };
            }}
          >
            <Button variant="destructive">Test Reason-Gated Action</Button>
          </CriticalActionDialog>

          <CriticalActionDialog
            title="Safety Officer Lockout/Tagout (LOTO) Signoff"
            description="Approver security PIN verification required to release high-pressure refrigerant circuit."
            variant="pin"
            pinRequired="2468"
            onExecute={async () => {
              await new Promise((r) => setTimeout(r, 1200));
              return { success: true, auditId: 'EVT-LOTO-4092' };
            }}
          >
            <Button variant="secondary">Test PIN-Gated Authorization</Button>
          </CriticalActionDialog>

          <CriticalActionDialog
            title="Procurement Commitment Approval ($28,400.00)"
            description="Commitment exceeds department discretionary envelope. Requires VP Operations authorization."
            variant="spend"
            spendAmount="$28,400.00"
            spendLimit="$64,200.00"
            onExecute={async () => {
              await new Promise((r) => setTimeout(r, 1200));
              return { success: true, auditId: 'EVT-PO-0285-AUTH' };
            }}
          >
            <Button>Test Spend Ceiling Gate</Button>
          </CriticalActionDialog>
        </div>
      </section>

      
      <section className="bg-card border border-border-subtle rounded-lg p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-cobalt" /> §05 Table Skeleton &amp; Streaming Previews
          </h2>
          <span className="text-xs text-muted font-mono">&lt;TableSkeleton rows=&#123;3&#125; /&gt;</span>
        </div>

        <TableSkeleton rows={3} />
      </section>

      
      {toastVisible && (
        <div className="fixed bottom-4 right-4 z-[90] max-w-sm w-full bg-fail-bg border border-fail text-fail-ink rounded-lg shadow-modal p-4 flex gap-3 items-start animate-in fade-in slide-in-from-bottom-2">
          <XCircle size={20} className="shrink-0 text-fail" />
          <div className="flex-1">
            <p className="text-sm font-bold">503 Service Unavailable: Modbus Gateway Timeout</p>
            <p className="text-xs mt-0.5">
              SCADA broker at 10.240.12.10:502 did not respond within 3000ms. Retrying with exponential backoff...
            </p>
          </div>
          <button type="button" aria-label="Dismiss toast" onClick={() => setToastVisible(false)} className="text-fail-ink hover:opacity-75">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
