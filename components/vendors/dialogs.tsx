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

export function PdfDialog({ msaNumber, triggerLabel = 'Lihat PDF Tereksekusi' }: { msaNumber?: string | null; triggerLabel?: string }) {
  const [page, setPage] = useState(0);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><FileText size={16} /> {triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="pdf-h" className="max-w-2xl">
        <DialogTitle id="pdf-h">{msaNumber ?? 'MSA'} · Kutipan Referensi</DialogTitle>
        <DialogDescription className="apex-id">Kutipan referensi — bukan dokumen bertanda tangan · tanpa hash anchor (belum ada penyimpanan dokumen)</DialogDescription>
        <div className="rounded-lg border border-border-subtle bg-surface p-6 min-h-[220px] flex flex-col gap-2">
          <p className="text-[13px] font-bold">§4.2 Emergency Response — Chilled Water Core</p>
          <p className="text-[13px] text-muted">{PDF_PAGES[page]}</p>
          <div className="flex items-center gap-2 mt-auto pt-2">
            <Button variant="secondary" onClick={() => setPage((p) => (p + 2) % 3)}>Sebelumnya</Button>
            <span className="apex-id">{page + 1} / 3</span>
            <Button variant="secondary" onClick={() => setPage((p) => (p + 1) % 3)}>Berikutnya</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AmendDialog({ push, vendorSlug, vendor, onSaved, triggerLabel = 'Ajukan Amandemen', renewMode = false }: {
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
      push(true, renewMode ? 'Perpanjangan tercatat' : 'Amandemen tersimpan', renewMode
        ? `Berakhir baru ${v.msaExpiresOn} · diaudit.`
        : `Profil diperbarui di server · diaudit.`);
    } catch (e) {
      push(false, renewMode ? 'Perpanjangan gagal' : 'Amandemen gagal', e instanceof Error ? e.message : 'Server error.');
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
        <DialogTitle id="amd-h">{renewMode ? 'Catat Perpanjangan MSA' : 'Ubah Profil Vendor'}</DialogTitle>
        <DialogDescription>{vendorSlug} · tersimpan di server + diaudit.</DialogDescription>
        {renewMode ? (
          <>
            <label className="text-xs font-semibold" htmlFor="amd-term">Masa perpanjangan</label>
            <select id="amd-term" value={term} onChange={(e) => setTerm(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
              {['12', '24', '36'].map((t) => <option key={t} value={t}>{t} bulan</option>)}
            </select>
            <label className="text-xs font-semibold" htmlFor="amd-msa">Nomor MSA baru (opsional)</label>
            <Input id="amd-msa" value={msa} onChange={(e) => setMsa(e.target.value)} placeholder="mis. MSA-2026-ABB-01" className="apex-id" />
          </>
        ) : (
          <>
            <label className="text-xs font-semibold" htmlFor="amd-scope">Ruang lingkup</label>
            <textarea
              id="amd-scope"
              rows={2}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full p-2 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
            />
            <label className="text-xs font-semibold" htmlFor="amd-contact">Kontak</label>
            <Input id="amd-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Nama · peran" />
            {touched && !ok && <p className="text-[11px] font-semibold text-fail">Ubah ruang lingkup atau kontak — submit kosong tidak disimpan.</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="secondary">Batal</Button>
          </DialogTrigger>
          <Button onClick={() => void submit()} disabled={busy}>{renewMode ? 'Catat Perpanjangan' : 'Simpan Amandemen'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DispatchDialog({ push, vendorSlug, vendorName, locked = false }: {
  push: Push; vendorSlug: string; vendorName: string; locked?: boolean;
}) {
  const [title, setTitle] = useState('Pemeriksaan ulang vibrasi chiller setelah ganti seal');
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
      push(true, 'Work order dibuat', `${wo.number} · ${asset.trim() || 'tanpa aset'} · ${pri} · terkunci ke vendor ${vendorName}.`);
    } catch (e) {
      push(false, 'Dispatch gagal', e instanceof Error ? e.message : 'Server error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={locked} title={locked ? 'Terkunci — MSA vendor kedaluwarsa' : 'Buat work order nyata untuk vendor ini'}><Send size={16} /> Dispatch Work Order</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="dsp-h">
        <DialogTitle id="dsp-h">Dispatch Work Order</DialogTitle>
        <DialogDescription className="apex-id">Membuat WO nyata via POST /api/work-orders · vendor {vendorSlug}</DialogDescription>
        {locked && <p className="text-[13px] font-semibold text-fail" role="alert">Terkunci — MSA vendor kedaluwarsa. Catat perpanjangan dulu.</p>}
        <label className="text-xs font-semibold" htmlFor="dsp-title">Judul (wajib)</label>
        <Input id="dsp-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={touched && !ok} />
        {touched && !ok && <p className="text-[11px] font-semibold text-fail">Judul wajib diisi.</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold" htmlFor="dsp-asset">Aset (opsional)</label>
            <Input id="dsp-asset" value={asset} onChange={(e) => setAsset(e.target.value)} invalid={touched && !assetOk} className="apex-id" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold" htmlFor="dsp-pri">Prioritas</label>
            <select id="dsp-pri" value={pri} onChange={(e) => setPri(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
              <option>P2 HIGH</option>
              <option>P1 CRITICAL</option>
              <option>P3 MEDIUM</option>
            </select>
          </div>
        </div>
        {touched && !assetOk && <p className="text-[11px] font-semibold text-fail">Aset harus seperti AST-HVAC-004 atau dikosongkan.</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => void submit()} disabled={busy || locked}>Dispatch</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommendDialog({ push, vendorSlug, vendorName }: { push: Push; vendorSlug: string; vendorName: string }) {
  const [note, setNote] = useState('Respons malam 2 jam untuk kebocoran seal P1 — tanpa perpanjangan downtime.');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = note.trim().length >= 10;

  const submit = async () => {
    setTouched(true);
    if (!ok || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/vendors/${vendorSlug}`, { method: 'PATCH', body: { op: 'commend', note: note.trim() } });
      push(true, 'Apresiasi tercatat', `Kru ${vendorName} diapresiasi — catatan di audit trail (pembacaan scorecard menunggu).`);
    } catch (e) {
      push(false, 'Apresiasi gagal', e instanceof Error ? e.message : 'Server error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary"><Award size={16} /> Apresiasi</Button>
      </DialogTrigger>
      <DialogContent aria-labelledby="cmd-h">
        <DialogTitle id="cmd-h">Apresiasi</DialogTitle>
        <DialogDescription>Apresiasi kru {vendorName} — tercatat di audit trail (min 10 karakter).</DialogDescription>
        <label className="text-xs font-semibold" htmlFor="cmd-note">Catatan (wajib)</label>
        <textarea
          id="cmd-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full p-2 border border-border-strong rounded text-[13px] outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt"
        />
        {touched && !ok && <p className="text-[11px] font-semibold text-fail">Catatan minimal 10 karakter.</p>}
        <div className="flex justify-end gap-2">
          <DialogTrigger asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogTrigger>
          <Button onClick={() => void submit()} disabled={busy}>Catat</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
