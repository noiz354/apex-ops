'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Phone, ShieldAlert, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { AmendDialog, CommendDialog, DispatchDialog, PdfDialog } from './dialogs';
import type { VendorRow } from './dialogs';

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 300;

interface RelatedPo { number: string; kind: string; title: string; status: string }

export function VendorDetail({ vendorSlug }: { vendorSlug?: string }) {
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [relatedPOs, setRelatedPOs] = useState<RelatedPo[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const refresh = useCallback(async () => {
    if (!vendorSlug) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch<{ vendor: VendorRow; relatedPOs: RelatedPo[] }>(
        `/api/vendors/${encodeURIComponent(vendorSlug)}`,
      );
      setVendor(res.vendor);
      setRelatedPOs(res.relatedPOs);
      setLive(true);
    } catch (e) {
      setLive(false);
      setLoadError(e instanceof Error ? e.message : 'Server unreachable.');
    } finally {
      setLoading(false);
    }
  }, [vendorSlug]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) {
    return <p className="text-sm text-muted p-6" role="status">Loading vendor dossier…</p>;
  }
  if (!live || !vendor) {
    return (
      <div className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" role="alert">
        <p className="font-bold text-sm flex items-center gap-2"><AlertCircle size={18} className="text-fail" /> Vendor dossier unavailable</p>
        <p className="text-[13px] text-muted">{loadError ?? 'Server unreachable.'} — no dossier shown rather than a fabricated profile.</p>
        <div><Button variant="secondary" onClick={() => void refresh()}>Retry</Button></div>
      </div>
    );
  }

  const v = vendor;
  const isExpired = v.msaStatus === 'EXPIRED';
  const statusLabel = isExpired
    ? 'EXPIRED — renewal overdue'
    : v.msaStatus === 'NO MSA' ? 'NO MSA — onboarding' : `ACTIVE (${v.daysLeft ?? '?'}d left)`;

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/vendors">Vendors &amp; Contractors</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">{v.name}</span>
      </nav>

      {isExpired && (
        <div className="bg-fail-bg border border-fail rounded-lg p-4 flex items-center justify-between gap-4 text-fail-ink shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldAlert size={24} className="shrink-0 text-fail" />
            <div>
              <p className="font-bold text-sm">CRITICAL: Master Service Agreement (MSA) Expired</p>
              <p className="text-xs">
                Contract {v.msaNumber ?? ''} expired {v.msaExpiresOn ?? ''}. Routine work dispatches are locked until a renewal is recorded.
              </p>
            </div>
          </div>
          <AmendDialog push={push} vendorSlug={v.slug} onSaved={(nv) => setVendor(nv)} triggerLabel="Initiate Urgent Renewal" renewMode />
        </div>
      )}

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="v-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isExpired ? 'fail' : 'pass'}>{v.tier}</Badge>
              <Badge variant={isExpired ? 'fail' : v.msaStatus === 'NO MSA' ? 'warn' : 'pass'}>{statusLabel}</Badge>
              <span className="apex-id text-xs text-muted font-bold">{v.slug}</span>
              <Badge variant="pass">Live · server-fed</Badge>
            </div>
            <h1 id="v-title" className="text-2xl font-semibold tracking-tight">{v.name}</h1>
            <p className="text-[13px] text-muted">
              {v.scope ?? 'Scope intake pending'} · MSA <span className="apex-id font-semibold text-ink">{v.msaNumber ?? '—'}</span> · Contact: <strong>{v.contact ?? '—'}</strong>
              {v.duns && <span className="apex-id"> · DUNS {v.duns} (format-checked)</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="inline-flex items-center gap-2">
                <Phone size={16} className="text-muted" />
                <span className="apex-label-caps text-muted">Dispatch desk number</span>
                <strong className="apex-id">{v.phone ?? '—'}</strong>
              </span>
              <Button
                variant="secondary"
                className="h-8 text-xs"
                title="Display number only — no telephony integration"
                onClick={() => push(true, 'Desk number (no telephony)', `${v.phone ?? 'No number on file'} · dial manually — calling is not integrated.`)}
              >
                Show Number
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <DispatchDialog push={push} vendorSlug={v.slug} vendorName={v.name} locked={isExpired} />
            <PdfDialog msaNumber={v.msaNumber} />
            <AmendDialog push={push} vendorSlug={v.slug} vendor={v} onSaved={(nv) => setVendor(nv)} />
            <CommendDialog push={push} vendorSlug={v.slug} vendorName={v.name} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="apex-label-caps text-muted">Master Service Agreement lifecycle</span>
            <span className="apex-id text-muted">
              {isExpired ? 'Renewal Overdue · Dispatches Locked' : v.msaExpiresOn ? `Active · Exp ${v.msaExpiresOn}` : 'No term on file'}
            </span>
          </div>
          <div className="w-full bg-surface-subtle h-2 rounded-full overflow-hidden flex" role="img" aria-label="MSA Progress">
            <div className={cn('h-full', isExpired ? 'bg-fail w-full' : 'bg-pass w-3/4')} />
          </div>
          <div className="flex justify-between apex-id text-muted text-xs">
            <span>Executed</span>
            <span>Mid-term review ✓</span>
            <span className={isExpired ? 'text-fail font-bold' : ''}>{v.msaExpiresOn ?? '—'}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-labelledby="open-h">
          <div className="flex items-center justify-between">
            <h2 id="open-h" className="text-base font-semibold">Open Work &amp; Linked Orders</h2>
            <span className="text-xs text-muted">{relatedPOs.length} live records</span>
          </div>
          <ul className="flex flex-col divide-y divide-surface-subtle text-[13px]">
            {relatedPOs.map((w) => (
              <li key={w.number} className="py-2.5 flex items-center justify-between gap-2">
                <span><span className="apex-id font-semibold text-cobalt">{w.number}</span> · {w.title} · {w.status}</span>
                <Link className="text-cobalt font-semibold hover:underline shrink-0" href={`/purchasing/${w.number}`}>Open</Link>
              </li>
            ))}
            {relatedPOs.length === 0 && (
              <li className="py-4 text-center text-muted text-xs">No purchase documents reference this vendor yet.</li>
            )}
          </ul>
        </section>

        <section className="xl:col-span-5 bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-labelledby="perf-h">
          <h2 id="perf-h" className="text-base font-semibold">Performance Scorecard</h2>
          <ul className="flex flex-col gap-3 text-[13px]">
            <li>
              <div className="flex justify-between"><span className="text-muted">On-time arrival (live)</span><strong>{v.onTimePct !== null ? `${v.onTimePct}%` : '—'}</strong></div>
              <div className="h-2 rounded-full bg-surface-subtle overflow-hidden mt-1">
                <div className="h-full bg-pass" style={{ width: `${v.onTimePct ?? 0}%` }} />
              </div>
            </li>
          </ul>
          <p className="apex-id text-muted text-xs">On-time: live vendor table · first-time-fix &amp; SLA breakdowns are curated reference (no source yet).</p>
        </section>
      </div>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-3 shadow-card" aria-labelledby="docs-h">
        <h2 id="docs-h" className="text-base font-semibold">Contract &amp; Compliance Documents</h2>
        <p className="text-xs text-muted">Reference excerpts — full signed documents live outside this directory (no document store yet).</p>
        <ul className="flex flex-col divide-y divide-surface-subtle text-[13px]">
          <li className="py-2.5 flex items-center justify-between gap-2">
            <span><strong>{v.msaNumber ?? 'MSA — no term on file'}</strong> · {v.msaExpiresOn ? `expires ${v.msaExpiresOn}` : 'term pending'}</span>
            <PdfDialog msaNumber={v.msaNumber} triggerLabel="View Excerpt" />
          </li>
        </ul>
      </section>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
