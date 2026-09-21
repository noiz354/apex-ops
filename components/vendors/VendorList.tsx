'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Plus, RefreshCw, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface VendorRow {
  slug: string; name: string; tier: string;
  msaNumber: string | null; msaExpiresOn: string | null; onTimePct: number | null;
  scope: string | null; contact: string | null; phone: string | null; duns: string | null;
  msaStatus: 'ACTIVE' | 'EXPIRED' | 'NO MSA'; daysLeft: number | null;
}

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1900;

const download = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export function VendorList() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('All Tiers');
  const [status, setStatus] = useState('All Statuses');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [nwName, setNwName] = useState('');
  const [nwTier, setNwTier] = useState('TIER-3');
  const [nwDuns, setNwDuns] = useState('');
  const [nwScope, setNwScope] = useState('');
  const [nwContact, setNwContact] = useState('');
  const [nwTouched, setNwTouched] = useState(false);
  const [reV, setReV] = useState<VendorRow | null>(null);
  const [reTerm, setReTerm] = useState('24');

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, ok, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ vendors: VendorRow[] }>('/api/vendors');
      setRows(res.vendors);
      setLive(true);
    } catch (e) {
      setLive(false);
      push(false, 'Vendor directory unreachable', e instanceof Error ? `${e.message} — showing no rows rather than estimates.` : 'Server unreachable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = rows.filter((r) => {
    if (tier !== 'All Tiers' && !r.tier.startsWith(tier)) return false;
    if (status === 'Active only' && r.msaStatus !== 'ACTIVE') return false;
    if (status === 'Expired only' && r.msaStatus !== 'EXPIRED') return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${r.name} ${r.slug} ${r.scope ?? ''} ${r.contact ?? ''}`.toLowerCase().includes(needle);
  });

  const active = rows.filter((r) => r.msaStatus === 'ACTIVE').length;
  const expired = rows.filter((r) => r.msaStatus === 'EXPIRED').length;
  const avgSla = rows.length > 0
    ? (rows.reduce((a, r) => a + (r.onTimePct ?? 0), 0) / rows.length).toFixed(1)
    : '—';

  const exportCsv = () => {
    const head = 'company,slug,tier,scope,contact,msa,expiry,status,on_time_pct';
    const body = filtered.map((r) => [`"${r.name}"`, `"${r.slug}"`, `"${r.tier}"`, `"${r.scope ?? ''}"`, `"${r.contact ?? ''}"`, `"${r.msaNumber ?? ''}"`, `"${r.msaExpiresOn ?? ''}"`, `"${r.msaStatus}"`, `"${r.onTimePct ?? ''}"`].join(','));
    download('vendor-directory.csv', [head, ...body].join('\n'));
    push(true, 'Directory exported', `${filtered.length} vendors → vendor-directory.csv (${live ? 'live server data' : 'demo data — server unreachable'}).`);
  };

  const dunsOk = nwDuns.trim() === '' || /^\d{2}-\d{3}-\d{4}$/.test(nwDuns.trim());

  const create = async () => {
    setNwTouched(true);
    if (!nwName.trim() || !dunsOk) return;
    try {
      const v = await apiFetch<VendorRow>('/api/vendors', {
        method: 'POST',
        body: {
          name: nwName.trim(), tier: nwTier,
          duns: nwDuns.trim() || null, scope: nwScope.trim() || null, contact: nwContact.trim() || null,
        },
      });
      setRows((r) => [v, ...r]);
      setNewOpen(false);
      setNwName(''); setNwDuns(''); setNwScope(''); setNwContact(''); setNwTouched(false);
      push(true, 'Vendor onboarded', `${v.name} · directory record created (DUNS format-checked, not registry-verified).`);
    } catch (e) {
      push(false, 'Onboard failed', e instanceof Error ? e.message : 'Server error.');
    }
  };

  const renew = async () => {
    if (!reV) return;
    try {
      const v = await apiFetch<VendorRow>(`/api/vendors/${reV.slug}`, {
        method: 'PATCH',
        body: { op: 'renew', termMonths: Number(reTerm) },
      });
      setRows((rs) => rs.map((r) => (r.slug === v.slug ? v : r)));
      push(true, 'Renewal recorded', `${v.msaNumber ?? v.slug} · new expiry ${v.msaExpiresOn} · audited.`);
      setReV(null);
    } catch (e) {
      push(false, 'Renewal failed', e instanceof Error ? e.message : 'Server error.');
    }
  };

  const statusTone = (s: string) => (s === 'EXPIRED' ? 'fail' : s === 'NO MSA' ? 'warn' : 'pass');
  const statusLabel = (r: VendorRow) => {
    if (r.msaStatus === 'ACTIVE') return `ACTIVE (${r.daysLeft ?? '?'}d left)`;
    if (r.msaStatus === 'EXPIRED') return 'EXPIRED — renewal overdue';
    return 'NO MSA — onboarding';
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Vendors</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="vnd-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">
              Approved Vendor Directory ·{' '}
              <Badge variant={live ? 'pass' : 'warn'}>{live ? `Live · server-fed (${rows.length})` : 'Demo offline — server unreachable'}</Badge>
            </p>
            <h1 id="vnd-h" className="text-2xl font-semibold tracking-tight">Vendors</h1>
            <p className="text-[13px] text-muted">MSA terms, SLA scorecards, and renewal posture across tiers.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Export (CSV)</Button>
            <Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> Refresh</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!live}><Plus size={16} /> New Vendor</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nv-h">
                <DialogTitle id="nv-h">Onboard Vendor</DialogTitle>
                <DialogDescription>Creates a directory record (DUNS format-checked only — not registry-verified).</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nv-n">Company (required)</label>
                <Input id="nv-n" value={nwName} onChange={(e) => setNwName(e.target.value)} invalid={nwTouched && !nwName.trim()} placeholder="e.g. Carrier Rental Systems" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nv-t">Tier</label>
                    <select id="nv-t" value={nwTier} onChange={(e) => setNwTier(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['TIER-1', 'TIER-2', 'TIER-3'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5 col-span-2">
                    <label className="text-xs font-semibold" htmlFor="nv-d">DUNS (optional)</label>
                    <Input id="nv-d" value={nwDuns} onChange={(e) => setNwDuns(e.target.value)} invalid={nwTouched && !dunsOk} placeholder="00-000-0000" className="apex-id" />
                  </div>
                </div>
                <label className="text-xs font-semibold" htmlFor="nv-s">Scope</label>
                <Input id="nv-s" value={nwScope} onChange={(e) => setNwScope(e.target.value)} placeholder="e.g. Chiller overhaul" />
                <label className="text-xs font-semibold" htmlFor="nv-c">Contact</label>
                <Input id="nv-c" value={nwContact} onChange={(e) => setNwContact(e.target.value)} placeholder="e.g. Jane Doe · Account Manager" />
                {nwTouched && (!nwName.trim() || !dunsOk) && (
                  <p className="text-[11px] font-semibold text-fail">Company is required; DUNS must look like ##-###-#### when given.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
                  <Button onClick={() => void create()}>Onboard Vendor</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {!live && !loading && (
          <p className="rounded border border-warn bg-warn-bg text-warn-ink text-[13px] p-3" role="alert">
            Server unreachable — no rows shown rather than estimates. Mutations are disabled offline.
          </p>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Active Vendors', v: live ? String(active) : '—', s: 'In-term MSAs' },
            { l: 'Expired Terms', v: live ? String(expired) : '—', s: 'Renewals overdue' },
            { l: 'Average On-Time', v: live ? `${avgSla}%` : '—', s: `Trailing scorecard mean · ${rows.length} vendors (live server data)` },
            { l: 'Directory Records', v: live ? String(rows.length) : '—', s: 'Live vendor table' },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by company, slug, scope, contact…" aria-label="Filter vendors" />
          </div>
          <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['All Tiers', 'Tier-1', 'Tier-2', 'Tier-3'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['All Statuses', 'Active only', 'Expired only'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1060px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Company</th>
                <th className="font-semibold">Slug</th>
                <th className="font-semibold">Tier &amp; Scope</th>
                <th className="font-semibold">Contact</th>
                <th className="font-semibold">MSA · Expiry</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">On-Time</th>
                <th className="font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.slug} className="border-b border-surface-subtle hover:bg-surface">
                  <td className="p-2">
                    <Link className="font-bold text-cobalt hover:underline" href={`/vendors/${r.slug}`}>{r.name}</Link>
                  </td>
                  <td><p className="apex-id font-semibold">{r.slug}</p>{r.duns && <p className="text-[10px] text-muted apex-id">DUNS {r.duns} (format)</p>}</td>
                  <td><p className="font-medium">{r.tier}</p><p className="text-xs text-muted">{r.scope ?? '—'}</p></td>
                  <td className="text-xs">{r.contact ?? '—'}</td>
                  <td><p className="apex-id text-xs font-semibold">{r.msaNumber ?? '—'}</p><p className="text-xs text-muted">{r.msaExpiresOn ? `Exp ${r.msaExpiresOn}` : 'No term on file'}</p></td>
                  <td><Badge variant={statusTone(r.msaStatus)}>{statusLabel(r)}</Badge></td>
                  <td className="apex-id text-xs font-semibold tabular-nums">{r.onTimePct !== null ? `${r.onTimePct}%` : '—'}</td>
                  <td>
                    {r.msaStatus === 'EXPIRED' ? (
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => setReV(r)}>Open Renewal</button>
                    ) : (
                      <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/vendors/${r.slug}`}>Profile →</Link>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">{loading ? 'Loading directory…' : 'No vendors match — clear filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Showing {filtered.length} of {rows.length} {live ? 'live' : 'demo'} vendors.
        </p>
      </section>

      <Dialog open={reV !== null} onOpenChange={(v) => { if (!v) setReV(null); }}>
        <DialogContent aria-labelledby="rn-h">
          <DialogTitle id="rn-h">Renew {reV?.msaNumber ?? reV?.slug}</DialogTitle>
          <DialogDescription>{reV?.name} · {reV?.msaExpiresOn ? `expired ${reV.msaExpiresOn}` : 'no term on file'} · records a fresh term server-side.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="rn-term">Renewal term</label>
          <select id="rn-term" value={reTerm} onChange={(e) => setReTerm(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['12', '24', '36'].map((t) => <option key={t} value={t}>{t} months</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReV(null)}>Cancel</Button>
            <Button onClick={() => void renew()}><RefreshCw size={15} /> Record Renewal</Button>
          </div>
        </DialogContent>
      </Dialog>

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
