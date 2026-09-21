'use client';

import { useState } from 'react';
import { Award, FileText, Send, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api/client';

export type Push = (ok: boolean, title: string, msg: string) => void;

export interface VendorRow {
  slug: string; name: string; tier: string;
  msaNumber: string | null; msaExpiresOn: string | null; onTimePct: number | null;
  scope: string | null; contact: string | null; phone: string | null; duns: string | null;
  msaStatus: 'ACTIVE' | 'EXPIRED' | 'NO MSA'; daysLeft: number | null;
}

const PDF_PAGES = [
  'Page 1 of 3 (reference excerpt): Tier-1 response within 2h for P1 chiller events at HQ Campus East Wing…',
  'Page 2 of 3: Rate card reference — after-hours multiplier 1.5×, parts at cost +12% handling…',
  'Page 3 of 3: Signatories on file with Legal — excerpt only, not the signed instrument.',
];

export function PdfDialog({ msaNumber, triggerLabel = 'View Executed PDF' }: { msaNumber?: string | null; triggerLabel?: string }) {
  const [page, setPage] = useState(0);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><FileText size={16} /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="pdf-h" className="max-w-2xl">
        <DialogTitle id="pdf-h">{msaNumber ?? 'MSA'} · Reference Excerpt</DialogTitle>
        <DialogDescription className="apex-id">Reference excerpt — not the signed document · no hash anchor (no document store yet)</DialogDescription>
        <div className="rounded-lg border border-border-subtle bg-surface p-6 min-h-[220px] flex flex-col gap-2">
          <p className="text-[13px] font-bold">§4.2 Emergency Response — Chilled Water Core</p>
          <p className="text-[13px] text-muted">{PDF_PAGES[page]}</p>
          <div className="flex items-center gap-2 mt-auto pt-2">
            <Button variant="secondary" onClick={() => setPage((p) => (p + 2) % 3)}>Prev</Button>
            <span className="apex-id">{page + 1} / 3</span>
            <Button variant="secondary" onClick={() => setPage((p) => (p + 1) % 3)}>Next</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AmendDialog({ push, vendorSlug, vendor, onSaved, triggerLabel = 'Initiate Amendment', renewMode = false }: {
  push: Push; vendorSlug: string; vendor?: VendorRow | null; onSaved: (v: VendorRow) => void; triggerLabel?: string; renewMode?: boolean;
}) {
  const [scope, setScope] = useState(vendor?.scope ?? '');
  const [contact, setContact] = useState(vendor?.contact ?? '');
  const [term, setTerm] = useState('24');
  const [msa, setMsa] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = renewMode ? true : (scope.trim() !== '' || contact.trim() !== '');

  const submit = async () => {
    setTouched(true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      const body = renewMode
        ? { op: 'renew', termMonths: Number(term), msaNumber: msa.trim() || null }
        : { op: 'amend', scope: scope.trim() || null, contact: contact.trim() || null };
      const v = await apiFetch<VendorRow>(`/api/vendors/${vendorSlug}`, { method: 'PATCH', body });
      onSaved(v);
      push(true, renewMode ? 'Renewal recorded' : 'Amendment saved', renewMode
        ? `New expiry ${v.msaExpiresOn} · audited.`
        : `Profile updated server-side · audited.`);
    } catch (e) {
      push(false, renewMode ? 'Renewal failed' : 'Amendment failed', e instanceof Error ? e.message : 'Server error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><SquarePen size={16} /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="amd-h">
        <DialogTitle id="amd-h">{renewMode ? 'Record MSA Renewal' : 'Amend Vendor Profile'}</DialogTitle>
        <DialogDescription>{vendorSlug} · saved server-side + audited.</DialogDescription>
        {renewMode ? (
          <>
            <label className="text-xs font-semibold" htmlFor="amd-term">Renewal term</label>
            <select id="amd-term" value={term} onChange={(e) => setTerm(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
              {['12', '24', '36'].map((t) => <option key={t} value={t}>{t} months</option>)}
            </select>
            <label className="text-xs font-semibold" htmlFor="amd-msa">New MSA number (optional)</label>
            <Input id="amd-msa" value={msa} onChange={(e) => setMsa(e.target.value)} placeholder="e.g. MSA-2026-ABB-01" className="apex-id" />
          </>
        ) : (
          <>
            <label className="text-xs font-semibold" htmlFor="amd-scope">Scope</label>
            <textarea
              id="amd-scope"
              rows={2}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full p-2 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
            />
            <label className="text-xs font-semibold" htmlFor="amd-contact">Contact</label>
            <Input id="amd-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name · role" />
            {touched && !ok && <p className="text-[11px] font-semibold text-fail">Change scope or contact — empty submit is not saved.</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogTrigger>
          <Button onClick={() => void submit()} disabled={busy}>{renewMode ? 'Record Renewal' : 'Save Amendment'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DispatchDialog({ push, vendorSlug, vendorName, locked = false }: {
  push: Push; vendorSlug: string; vendorName: string; locked?: boolean;
}) {
  const [title, setTitle] = useState('Chiller vibration re-check after seal replacement');
  const [asset, setAsset] = useState<string>('AST-HVAC-004');
  const [pri, setPri] = useState('P2 HIGH');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = title.trim().length > 0;
  const assetOk = asset.trim() === '' || /^AST-[A-Z]+-\d{3}$/.test(asset.trim());

  const submit = async () => {
    setTouched(true);
    if (!ok || !assetOk || busy || locked) return;
    setBusy(true);
    try {
      const wo = await apiFetch<{ number: string }>(`/api/work-orders`, {
        method: 'POST',
        body: {
          title: `${title.trim()} [vendor: ${vendorSlug}]`.slice(0, 200),
          priority: pri.split(' ')[0],
          assetCode: asset.trim() || null,
        },
      });
      push(true, 'Work order created', `${wo.number} · ${asset.trim() || 'no asset'} · ${pri} · vendor-locked to ${vendorName}.`);
    } catch (e) {
      push(false, 'Dispatch failed', e instanceof Error ? e.message : 'Server error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={locked} title={locked ? 'Locked — vendor MSA expired' : 'Create a real work order for this vendor'}><Send size={16} /> Dispatch Work Order</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="dsp-h">
        <DialogTitle id="dsp-h">Dispatch Work Order</DialogTitle>
        <DialogDescription className="apex-id">Creates a real WO via POST /api/work-orders · vendor {vendorSlug}</DialogDescription>
        {locked && <p className="text-[13px] font-semibold text-fail" role="alert">Locked — vendor MSA is expired. Record a renewal first.</p>}
        <label className="text-xs font-semibold" htmlFor="dsp-title">Title (required)</label>
        <Input id="dsp-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={touched && !ok} />
        {touched && !ok && <p className="text-[11px] font-semibold text-fail">Title is required.</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold" htmlFor="dsp-asset">Asset (optional)</label>
            <Input id="dsp-asset" value={asset} onChange={(e) => setAsset(e.target.value)} invalid={touched && !assetOk} className="apex-id" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold" htmlFor="dsp-pri">Priority</label>
            <select id="dsp-pri" value={pri} onChange={(e) => setPri(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
              <option>P2 HIGH</option>
              <option>P1 CRITICAL</option>
              <option>P3 MEDIUM</option>
            </select>
          </div>
        </div>
        {touched && !assetOk && <p className="text-[11px] font-semibold text-fail">Asset must look like AST-HVAC-004 or be left empty.</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => void submit()} disabled={busy || locked}>Dispatch</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommendDialog({ push, vendorSlug, vendorName }: { push: Push; vendorSlug: string; vendorName: string }) {
  const [note, setNote] = useState('2h night response on P1 seal leak — zero downtime extension.');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = note.trim().length >= 10;

  const submit = async () => {
    setTouched(true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/vendors/${vendorSlug}`, { method: 'PATCH', body: { op: 'commend', note: note.trim() } });
      push(true, 'Commendation recorded', `${vendorName} crew recognized — note in audit trail (scorecard readout pending).`);
    } catch (e) {
      push(false, 'Commendation failed', e instanceof Error ? e.message : 'Server error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><Award size={16} /> Commendation</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="cmd-h">
        <DialogTitle id="cmd-h">Commendation</DialogTitle>
        <DialogDescription>Recognize {vendorName} crew — recorded in the audit trail (min 10 chars).</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="cmd-note">Note (required)</label>
        <textarea
          id="cmd-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {touched && !ok && <p className="text-[11px] font-semibold text-fail">Note must be at least 10 characters.</p>}
        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogTrigger>
          <Button onClick={() => void submit()} disabled={busy}>Record</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
