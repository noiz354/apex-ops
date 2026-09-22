'use client';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ApiError, apiFetch } from '@/lib/api/client';

interface VendorRow {
  slug: string; name: string; tier: string;
  msaNumber: string | null; msaExpiresOn: string | null; onTimePct: number | null;
  scope: string | null; contact: string | null; phone: string | null; duns: string | null;
  msaStatus: 'ACTIVE' | 'EXPIRED' | 'NO MSA'; daysLeft: number | null;
}


export function VendorList() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('Semua Tier');
  const [status, setStatus] = useState('Semua Status');
  const { toasts, push, dismiss } = useToasts(8000);
  const [busyExport, setBusyExport] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [nwName, setNwName] = useState('');
  const [nwTier, setNwTier] = useState('TIER-3');
  const [nwDuns, setNwDuns] = useState('');
  const [nwScope, setNwScope] = useState('');
  const [nwContact, setNwContact] = useState('');
  const [nwTouched, setNwTouched] = useState(false);
  const [reV, setReV] = useState<VendorRow | null>(null);
  const [reTerm, setReTerm] = useState('24');



  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ vendors: VendorRow[] }>('/api/vendors');
      setRows(res.vendors);
      setLive(true);
    } catch (e) {
      setLive(false);
      push(false, 'Direktori vendor tidak terjangkau', e instanceof Error ? `${e.message} — tidak ada baris yang ditampilkan.` : 'Server tidak terjangkau.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tier !== 'Semua Tier' && !r.tier.startsWith(tier)) return false;
      if (status === 'Aktif saja' && r.msaStatus !== 'ACTIVE') return false;
      if (status === 'Kedaluarsa saja' && r.msaStatus !== 'EXPIRED') return false;
      return !needle || `${r.name} ${r.slug} ${r.scope ?? ''} ${r.contact ?? ''}`.toLowerCase().includes(needle);
    });
  }, [rows, q, tier, status]);

  const stats = useMemo(() => ({
    active: rows.filter((r) => r.msaStatus === 'ACTIVE').length,
    expired: rows.filter((r) => r.msaStatus === 'EXPIRED').length,
    avgSla: rows.length > 0
      ? (rows.reduce((a, r) => a + (r.onTimePct ?? 0), 0) / rows.length).toFixed(1)
      : '—',
  }), [rows]);
  const { active, expired, avgSla } = stats;

  const exportCsv = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {

    const { exportTableCsv } = await import('@/lib/csv-export');
    const table: (string | number)[][] = [
      ['company', 'slug', 'tier', 'scope', 'contact', 'msa', 'expiry', 'status', 'on_time_pct'],
      ...filtered.map((r) => [r.name, r.slug, r.tier, r.scope ?? '', r.contact ?? '', r.msaNumber ?? '', r.msaExpiresOn ?? '', r.msaStatus, r.onTimePct ?? '']),
    ];
    await exportTableCsv('vendor-directory.csv', table);
    push(true, 'Ekspor berhasil', `${filtered.length} vendor → vendor-directory.csv (${live ? 'data server' : 'data demo — server tidak terjangkau'}).`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const dunsOk = nwDuns.trim() === '' || /^\d{2}-\d{3}-\d{4}$/.test(nwDuns.trim());

  const create = async () => {
    setNwTouched(true);
    if (!nwName.trim() || !dunsOk || busyCreate) return;
    setBusyCreate(true);
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
      push(true, 'Vendor ditambahkan', `${v.name} · data direktori dibuat (format DUNS diperiksa, bukan verifikasi registry).`);
    } catch (e) {
      if (e instanceof ApiError) {
        push(false, 'Gagal menambahkan', `${e.message} (${e.code})`);
      } else {
        push(false, 'Gangguan jaringan', 'Tidak ada yang dibuat. Periksa koneksi dan coba lagi.');
      }
    } finally {
      setBusyCreate(false);
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
      push(true, 'Perpanjangan tercatat', `${v.msaNumber ?? v.slug} · kedaluarsa baru ${v.msaExpiresOn} · teraudit.`);
      setReV(null);
    } catch (e) {
      push(false, 'Perpanjangan gagal', e instanceof Error ? e.message : 'Server bermasalah.');
    }
  };

  const statusTone = (s: string) => (s === 'EXPIRED' ? 'fail' : s === 'NO MSA' ? 'warn' : 'pass');
  const statusLabel = (r: VendorRow) => {
    if (r.msaStatus === 'ACTIVE') return `AKTIF (${r.daysLeft ?? '?'} hari tersisa)`;
    if (r.msaStatus === 'EXPIRED') return 'KEDALUARSA — perlu perpanjangan';
    return 'TANPA MSA — onboarding';
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Beranda</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Vendor</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="vnd-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">
              Direktori Vendor ·{' '}
              <Badge variant={live ? 'pass' : 'warn'}>{live ? `Live · dari server (${rows.length})` : 'Demo offline — server tidak terjangkau'}</Badge>
            </p>
            <h1 id="vnd-h" className="text-2xl font-semibold tracking-tight">Vendor</h1>
            <p className="text-[13px] text-muted">Syarat MSA, skor SLA, dan status perpanjangan antar tier.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportCsv} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor (CSV)</Button>
            <Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> Muat Ulang</Button>
            <Dialog open={newOpen} onOpenChange={setNewOpen}>
              <DialogTrigger asChild>
                <Button disabled={!live}><Plus size={16} /> Vendor Baru</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="nv-h">
                <DialogTitle id="nv-h">Tambah Vendor</DialogTitle>
                <DialogDescription>Membuat data direktori (format DUNS diperiksa saja — bukan verifikasi registry).</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="nv-n">Perusahaan (wajib)</label>
                <Input id="nv-n" value={nwName} onChange={(e) => setNwName(e.target.value)} invalid={nwTouched && !nwName.trim()} placeholder="mis. Carrier Rental Systems" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="nv-t">Tier</label>
                    <select id="nv-t" value={nwTier} onChange={(e) => setNwTier(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {['TIER-1', 'TIER-2', 'TIER-3'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5 col-span-2">
                    <label className="text-xs font-semibold" htmlFor="nv-d">DUNS (opsional)</label>
                    <Input id="nv-d" value={nwDuns} onChange={(e) => setNwDuns(e.target.value)} invalid={nwTouched && !dunsOk} placeholder="00-000-0000" className="apex-id" />
                  </div>
                </div>
                <label className="text-xs font-semibold" htmlFor="nv-s">Lingkup</label>
                <Input id="nv-s" value={nwScope} onChange={(e) => setNwScope(e.target.value)} placeholder="mis. Overhaul chiller" />
                <label className="text-xs font-semibold" htmlFor="nv-c">Kontak</label>
                <Input id="nv-c" value={nwContact} onChange={(e) => setNwContact(e.target.value)} placeholder="mis. Jane Doe · Account Manager" />
                {nwTouched && (!nwName.trim() || !dunsOk) && (
                  <p className="text-[11px] font-semibold text-fail">Perusahaan wajib diisi; DUNS harus seperti ##-###-#### bila diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewOpen(false)}>Batal</Button>
                  <Button onClick={() => void create()} disabled={busyCreate}>{busyCreate ? <LoaderCircle size={16} className="animate-spin" /> : null}Tambah Vendor</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {!live && !loading && (
          <p className="rounded border border-warn bg-warn-bg text-warn-ink text-[13px] p-3" role="alert">
            Server tidak terjangkau — tidak ada baris yang ditampilkan. Perubahan dinonaktifkan saat offline.
          </p>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Vendor Aktif', v: live ? String(active) : '—', s: 'MSA berjalan' },
            { l: 'MSA Kedaluarsa', v: live ? String(expired) : '—', s: 'Perlu perpanjangan' },
            { l: 'Rata-rata Tepat Waktu', v: live ? `${avgSla}%` : '—', s: `Rata-rata skor · ${rows.length} vendor (data server)` },
            { l: 'Data Direktori', v: live ? String(rows.length) : '—', s: 'Tabel vendor' },
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
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter berdasarkan perusahaan, slug, lingkup, kontak…" aria-label="Filter vendor" />
          </div>
          <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter tier" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['Semua Tier', 'Tier-1', 'Tier-2', 'Tier-3'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['Semua Status', 'Aktif saja', 'Kedaluarsa saja'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-[13px] min-w-[1060px]">
            <thead>
              <tr className="text-left text-muted border-b border-border-subtle bg-surface">
                <th className="p-2 font-semibold">Perusahaan</th>
                <th className="font-semibold">Slug</th>
                <th className="font-semibold">Tier &amp; Lingkup</th>
                <th className="font-semibold">Kontak</th>
                <th className="font-semibold">MSA · Kedaluarsa</th>
                <th className="font-semibold">Status</th>
                <th className="font-semibold">Tepat Waktu</th>
                <th className="font-semibold">Aksi</th>
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
                      <button type="button" className="text-cobalt font-semibold hover:underline text-xs" onClick={() => setReV(r)}>Buka Perpanjangan</button>
                    ) : (
                      <Link className="text-cobalt font-semibold hover:underline text-xs" href={`/vendors/${r.slug}`}>Profil →</Link>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted">{loading ? 'Memuat direktori…' : 'Tidak ada vendor yang cocok — ubah filter.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted" role="status">
          Menampilkan {filtered.length} dari {rows.length} vendor {live ? '' : '(demo)'}.
        </p>
      </section>

      <Dialog open={reV !== null} onOpenChange={(v) => { if (!v) setReV(null); }}>
        <DialogContent aria-labelledby="rn-h">
          <DialogTitle id="rn-h">Perpanjang {reV?.msaNumber ?? reV?.slug}</DialogTitle>
          <DialogDescription>{reV?.name} · {reV?.msaExpiresOn ? `kedaluarsa ${reV.msaExpiresOn}` : 'belum ada termin'} · mencatat termin baru di server.</DialogDescription>
          <label className="text-xs font-semibold" htmlFor="rn-term">Jangka perpanjangan</label>
          <select id="rn-term" value={reTerm} onChange={(e) => setReTerm(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
            {['12', '24', '36'].map((t) => <option key={t} value={t}>{t} bulan</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReV(null)}>Batal</Button>
            <Button onClick={() => void renew()}><RefreshCw size={15} /> Catat Perpanjangan</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
