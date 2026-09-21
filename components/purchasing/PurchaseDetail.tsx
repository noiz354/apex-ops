'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { AuthDialog, DisputeDialog, RejectDialog, RfqDialog, type DisputeKind } from './dialogs';
import type { ServerDoc } from './PurchaseList';
import { ApiError, apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

export type PurchaseTab = 'review' | 'receiving' | 'match' | 'signatures';
const TABS: { id: PurchaseTab; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'receiving', label: 'Receiving · GRN' },
  { id: 'match', label: '3-Way Match' },
  { id: 'signatures', label: 'Signatures' },
];

interface Toast { id: number; ok: boolean; title: string; msg: string; retry?: boolean }
let toastSeq = 1;

interface GrnRow {
  number: string;
  poNumber: string;
  waybill: string;
  dockLocation: string;
  status: 'RECEIVED' | 'DISPUTED';
  verifiedBy: string;
  createdAt: string;
}

const statusTone = (s: string) =>
  (s.startsWith('REJECTED') ? 'fail'
    : s === 'PARTIAL' || s === 'PENDING_APPROVAL' || s === 'CREATED' ? 'warn'
    : s === 'APPROVED' ? 'info' : 'pass') as 'pass' | 'warn' | 'fail' | 'info' | 'hold';

export function PurchaseDetail({ initialTab, docId }: { initialTab: PurchaseTab; docId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<PurchaseTab>(initialTab);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [doc, setDoc] = useState<ServerDoc | null>(null);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [slaLeft, setSlaLeft] = useState<number | null>(null);

  const [waybill, setWaybill] = useState('');
  const [grnSku, setGrnSku] = useState('');
  const [grnQty, setGrnQty] = useState('1');
  const [grnDock, setGrnDock] = useState('Dock Bay 02');
  const [stepUp, setStepUp] = useState('');
  const [grnBusy, setGrnBusy] = useState(false);
  const [convertBusy, setConvertBusy] = useState(false);
  const [lastGrn, setLastGrn] = useState<GrnRow | null>(null);
  const [grnTouched, setGrnTouched] = useState(false);

  interface MatchedInvoice { number: string; poNumber: string; status: string; paymentHold: boolean; invoiceDate: string; createdAt: string }
  const [matched, setMatched] = useState<MatchedInvoice[] | null>(null);

  const push = useCallback((ok: boolean, title: string, msg: string, retry = false) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg, retry }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000);
  }, []);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const errMsg = (e: unknown) =>
    e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing was posted.';

  const load = useCallback(async () => {
    setState('loading');
    setLoadError('');
    try {
      const list = await apiFetch<ServerDoc[]>(`/api/purchasing?number=${encodeURIComponent(docId)}`);
      const d = list[0] ?? null;
      if (!d) {
        setState('error');
        setLoadError(`Document ${docId} not found on this tenant.`);
        return;
      }
      setDoc(d);
      setState('live');
      if (d.kind === 'PO') {
        try {
          const inv = await apiFetch<{ rows: MatchedInvoice[] }>(`/api/purchasing/invoices?poNumber=${encodeURIComponent(d.number)}`);
          setMatched(inv.rows ?? []);
        } catch {
          setMatched(null);
        }
      } else {
        setMatched([]);
      }
      if (!grnSku && d.lineItems[0]) setGrnSku(d.lineItems[0].sku);
      setSlaLeft(d.slaDueAt ? Math.max(0, Math.floor((new Date(d.slaDueAt).getTime() - Date.now()) / 1000)) : null);
    } catch (e) {
      setState('error');
      setLoadError(errMsg(e));
    }
  }, [docId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (slaLeft === null) return;
    const t = setInterval(() => setSlaLeft((s) => (s !== null && s > 0 ? s - 1 : s)), 1000);
    return () => clearInterval(t);
  }, [slaLeft === null]);

  const breached = slaLeft !== null && slaLeft === 0;

  const showTab = (t: PurchaseTab) => {
    setTab(t);
    router.replace(`/purchasing/${docId}?tab=${t}`, { scroll: false });
  };

  const qtyNum = parseInt(grnQty, 10);
  const grnOk = waybill.trim().length > 0 && grnSku.trim().length > 0
    && Number.isInteger(qtyNum) && qtyNum > 0 && /^\d{6}$/.test(stepUp);

  const postGrn = async () => {
    setGrnTouched(true);
    if (!grnOk || grnBusy || !doc || doc.kind !== 'PO') return;
    setGrnBusy(true);
    try {
      const grn = await apiFetch<GrnRow>('/api/purchasing/grn', {
        method: 'POST',
        body: {
          poNumber: doc.number,
          waybill: waybill.trim(),
          dockLocation: grnDock.trim() || undefined,
          skuReceived: grnSku.trim(),
          qtyReceived: qtyNum,
          stepUpCode: stepUp,
        },
      });
      setLastGrn(grn);
      setStepUp('');
      push(true, 'GRN posted', `${grn.number} VERIFIED · ${qtyNum} ea ${grnSku.trim()} → stock · PO ${grn.poNumber} RECEIVED.`);
      await load();
    } catch (e) {
      push(false, 'GRN failed', errMsg(e));
    } finally {
      setGrnBusy(false);
    }
  };

  const onDisputed = (_kind: DisputeKind) => {
    push(false, 'Discrepancy logged locally', 'No dispute endpoint — GRN state unchanged.');
  };

  const postConvert = async () => {
    if (!doc || doc.kind !== 'PR' || doc.status !== 'APPROVED' || convertBusy) return;
    setConvertBusy(true);
    try {
      const res = await apiFetch<{ pr: { poNumber: string; alreadyConverted: boolean } }>(
        `/api/purchasing/${encodeURIComponent(doc.number)}/convert`,
        { method: 'POST', body: {} },
      );
      push(true, 'PR converted to PO',
        `${doc.number} → ${res.pr.poNumber}${res.pr.alreadyConverted ? ' (already converted — existing PO returned)' : ''}. Lines copied; PR is CONVERTED.`);
      await load();
    } catch (e) {
      push(false, 'Convert failed', errMsg(e));
    } finally {
      setConvertBusy(false);
    }
  };

  const exportLines = () => {
    if (!doc) return;
    const head = 'sku,description,quantity,unit_price,total';
    const body = doc.lineItems.map((l) => [`"${l.sku}"`, `"${l.description}"`, l.quantity, `"${l.priceFormatted}"`, `"${l.totalFormatted}"`].join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
    a.download = `${doc.number}-lines.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    push(true, 'Lines exported', `${doc.lineItems.length} line items → ${doc.number}-lines.csv (live server data).`);
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/purchasing">Purchasing &amp; POs</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{docId}</span>
      </nav>

      {state === 'loading' && <TableSkeleton rows={8} />}

      {state === 'error' && (
        <section className="bg-card border border-fail rounded-lg p-6 flex flex-col gap-2" role="alert">
          <h1 className="text-lg font-semibold text-fail-ink">Document unavailable</h1>
          <p className="text-sm text-muted">{loadError}</p>
          <div><Button variant="secondary" onClick={() => void load()}>Retry</Button></div>
        </section>
      )}

      {state === 'live' && doc && (
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="po-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusTone(doc.status)}>{doc.status}</Badge>
              <Badge variant="pass">Live server record</Badge>
              {slaLeft !== null && (breached ? (
                <Badge variant="fail" pulse>SLA BREACH — escalate to VP Operations</Badge>
              ) : (
                <Badge variant="warn">SLA · <span className="tabular-nums">{Math.floor(slaLeft / 60)}m {String(slaLeft % 60).padStart(2, '0')}s</span> left</Badge>
              ))}
            </div>
            <h1 id="po-title" className="text-2xl font-semibold tracking-tight">
              {doc.number} <span className="text-base font-normal text-muted">· {doc.title}</span>
            </h1>
            <p className="text-[13px] text-muted">
              Vendor slug <span className="apex-id font-semibold">{doc.vendorSlug ?? '—'}</span>
              {' '}· Created <span className="apex-id">{new Date(doc.createdAt).toLocaleString()}</span>
            </p>
            <p className="text-[13px]">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-surface-subtle">
                Amount: <strong className="apex-id text-cobalt">{doc.totalFormatted}</strong>
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <AuthDialog push={push} docId={doc.number} amount={doc.totalFormatted} status={doc.status} onDecided={() => void load()} />
            <RfqDialog push={push} sku={doc.lineItems[0]?.sku ?? doc.number} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={exportLines}>Export lines</Button>
              {doc.kind === 'PO' && <Link href={`/purchasing/${doc.number}/print`}><Button variant="secondary">Print PO Batch</Button></Link>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-border-subtle" role="tablist" aria-label="Purchase tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => showTab(t.id)}
              className={cn(
                'h-10 px-4 text-[13px] font-semibold border-b-2',
                tab === t.id ? 'border-cobalt-deep text-cobalt' : 'border-transparent text-muted hover:text-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'review' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Document Details — {doc.number}</h2>
                <Badge variant={statusTone(doc.status)}>{doc.status}</Badge>
              </div>
              <div className="overflow-x-auto rounded border border-border-subtle mt-2">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-subtle text-muted">
                    <tr>
                      <th className="p-2">Line Item / SKU</th>
                      <th className="p-2">Description</th>
                      <th className="p-2">Quantity</th>
                      <th className="p-2">Unit Price</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {doc.lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2 apex-id font-bold text-cobalt">
                          <Link href={`/inventory/${item.sku}`} className="hover:underline">{item.sku}</Link>
                        </td>
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 apex-id">{item.quantity}</td>
                        <td className="p-2 apex-id">{item.priceFormatted}</td>
                        <td className="p-2 text-right apex-id font-bold">{item.totalFormatted}</td>
                      </tr>
                    ))}
                    {doc.lineItems.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted">No line items recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm mt-2">
                <span>Total Amount <strong className="apex-id">{doc.totalFormatted}</strong></span>
                <span className="flex gap-2 ml-auto">
                  <RejectDialog push={push} docId={doc.number} onDecided={() => void load()} />
                </span>
              </div>
              <p className="text-xs text-muted" role="status">
                {doc.status === 'APPROVED' && `${doc.number} approved — recorded in audit trail. Dispatch stays manual (no EDI integration).`}
                {doc.status === 'CONVERTED' && `${doc.number} converted to PO — see audit trail for the PO number.`}
                {doc.status === 'REJECTED' && `${doc.number} rejected — reason recorded in audit trail.`}
                {(doc.status === 'PENDING_APPROVAL' || doc.status === 'CREATED') && 'Awaiting procurement decision (approve or reject with reason).'}
                {['DISPATCHED', 'RECEIVED', 'PARTIAL'].includes(doc.status) && `${doc.number} is ${doc.status} — decision is terminal.`}
              </p>
              {doc.kind === 'PR' && doc.status === 'APPROVED' && (
                <div className="mt-2">
                  <Button onClick={postConvert} disabled={convertBusy}>
                    {convertBusy ? 'Converting…' : 'Convert to Purchase Order'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'receiving' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Goods Receipt — Dock Bay 02</h2>
                {lastGrn && <Badge variant="pass">{lastGrn.number} VERIFIED</Badge>}
              </div>
              {doc.kind !== 'PO' ? (
                <p className="text-[13px] text-muted" role="status">Goods receipt applies to purchase orders — {doc.number} is a {doc.kind}.</p>
              ) : (
                <>
                  <p className="text-[13px] text-muted">Posting is idempotent (same key on retry, double-post blocked). Requires your 6-digit approver code — GRN mutates stock.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-wb">Waybill (required)</label>
                      <Input id="grn-wb" value={waybill} onChange={(e) => setWaybill(e.target.value)} invalid={grnTouched && !waybill.trim()} placeholder="e.g. FX-9920148-US" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-dock">Dock location</label>
                      <Input id="grn-dock" value={grnDock} onChange={(e) => setGrnDock(e.target.value)} placeholder="Dock Bay 02" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-sku">SKU received (required)</label>
                      <Input id="grn-sku" value={grnSku} onChange={(e) => setGrnSku(e.target.value)} invalid={grnTouched && !grnSku.trim()} placeholder="e.g. PART-SEAL-8821" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-qty">Qty (required)</label>
                      <Input id="grn-qty" value={grnQty} onChange={(e) => setGrnQty(e.target.value)} invalid={grnTouched && !(Number.isInteger(qtyNum) && qtyNum > 0)} placeholder="1" className="apex-id" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs font-semibold" htmlFor="grn-step">Approver code — your authenticator, 6 digits (required)</label>
                      <Input id="grn-step" value={stepUp} onChange={(e) => setStepUp(e.target.value)} invalid={grnTouched && !/^\d{6}$/.test(stepUp)} placeholder="••••••" className="apex-id" inputMode="numeric" maxLength={6} />
                    </div>
                  </div>
                  {grnTouched && !grnOk && (
                    <p className="text-[11px] font-semibold text-fail">Waybill + SKU + qty ≥ 1 + 6-digit approver code are required.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void postGrn()} disabled={grnBusy}>{grnBusy ? 'Posting…' : 'Post GRN'}</Button>
                    <DisputeDialog push={push} onDisputed={onDisputed} docId={doc.number} />
                  </div>
                  {lastGrn && (
                    <p className="text-[13px] text-muted" role="status">
                      {lastGrn.number} · {lastGrn.status} · waybill {lastGrn.waybill} · verified by {lastGrn.verifiedBy} · {new Date(lastGrn.createdAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'match' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">3-Way Match — PO · GRN · Invoice</h2>
                <Badge variant="pass">ENGINE LIVE</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">{doc.number}</p>
                  <p className="apex-id font-bold">{doc.totalFormatted} · {doc.lineItems.length} line items</p>
                  <p className="text-pass font-semibold">Order on record ✓</p>
                </div>
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">GRN Status</p>
                  <p className="apex-id font-bold">{lastGrn ? `${lastGrn.number} · ${lastGrn.status}` : doc.status === 'RECEIVED' ? 'Received (prior GRN)' : 'No GRN posted yet'}</p>
                  <p className="text-muted text-xs">Post a GRN in the Receiving tab.</p>
                </div>
                <div className="rounded border border-border-subtle p-3">
                  <p className="apex-label-caps text-muted">Invoice</p>
                  {matched === null && <p className="text-muted text-xs">Could not load invoices — retry via reload.</p>}
                  {matched !== null && matched.length === 0 && (
                    <>
                      <p className="apex-id font-bold">No invoice registered yet</p>
                      <p className="text-muted text-xs">Register via POST /api/purchasing/invoices (step-up required) — the engine verdict lands in the invoice dossier.</p>
                    </>
                  )}
                  {matched !== null && matched.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {matched.map((m) => (
                        <li key={m.number} className="flex items-center justify-between gap-2">
                          <Link className="apex-id font-bold text-cobalt hover:underline" href={`/purchasing/invoices/${m.number}`}>{m.number}</Link>
                          <Badge variant={m.status === 'MATCHED' ? 'pass' : 'fail'}>{m.status}{m.paymentHold ? ' · HOLD' : ''}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {matched && matched.length > 0 ? (
                  <Link href={`/purchasing/invoices/${matched[0].number}`}><Button>Open invoice dossier</Button></Link>
                ) : (
                  <Button disabled title="Register an invoice first — the verdict appears in its dossier">Run Match (needs invoice)</Button>
                )}
                <DisputeDialog push={push} onDisputed={onDisputed} docId={doc.number} />
              </div>
            </div>
          </div>
        )}

        {tab === 'signatures' && (
          <div role="tabpanel" className="flex flex-col gap-4">
            <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
              <h2 className="text-base font-semibold">Approval State</h2>
              <p className="text-sm">Current status: <Badge variant={statusTone(doc.status)}>{doc.status}</Badge></p>
              <p className="text-xs text-muted">Per-signer quorum has no backend — the full decision chain (who, when, why) is recorded in the audit trail. Query the audit trail for <span className="apex-id">PO_APPROVE / PO_REJECT · {doc.number}</span>.</p>
            </div>
          </div>
        )}
      </section>
      )}

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1">
              <p className="text-sm font-bold">{t.title}</p>
              <p className="text-xs">{t.msg}</p>
              {t.retry && (
                <button type="button" onClick={() => push(true, 'Retry queued', 'Same Idempotency-Key — no duplicate.')} className="mt-1 h-8 px-3 rounded bg-card/60 text-xs font-bold">
                  Retry
                </button>
              )}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
