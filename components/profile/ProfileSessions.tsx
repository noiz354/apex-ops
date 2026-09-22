'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON } from '@/lib/canon';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';

interface LiveSession {
  idHashPrefix: string;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  last4: string;
  createdBy: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function ProfileSessions() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessState, setSessState] = useState('Memuat sesi live…');
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [freshSecret, setFreshSecret] = useState<{ id: string; secret: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const { toasts, push: basePush, dismiss } = useToasts(7000);
  const push = (title: string, msg: string) => basePush(true, title, msg);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/auth/sessions', { credentials: 'same-origin' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      const rows: LiveSession[] = body.data.sessions ?? [];
      setSessions(rows);
      const others = rows.filter((r) => !r.current).length;
      setSessState(
        rows.length === 0
          ? 'Tidak ada sesi aktif (janggal — Anda sedang masuk).'
          : `${rows.length} sesi aktif · ${others} perangkat lain · revoke per-sesi tidak tersedia (hanya prefix hash).`,
      );
    } catch (err) {
      setSessions(null);
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Gagal memuat sesi: ${msg}`);
      setSessState('Daftar sesi tidak tersedia — aksi dinonaktifkan sampai server merespons.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshKeys = useCallback(async () => {
    setKeysError(null);
    try {
      const res = await fetch('/api/settings/api-keys', { credentials: 'same-origin' });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      setKeys(body.data ?? []);
    } catch (err) {
      setKeys(null);
      setKeysError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshKeys();
  }, [refreshKeys]);

  const issueKey = async () => {
    if (!keyName.trim()) {
      push('Nama kunci wajib', 'Beri nama kunci (mis. "scada-exporter") sebelum diterbitkan.');
      return;
    }
    setKeyBusy(true);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      setFreshSecret({ id: body.data.id, secret: body.data.secret });
      setKeyName('');
      push('Kunci API diterbitkan', `${body.data.id} dibuat — salin secret sekarang, tidak akan ditampilkan lagi.`);
      await refreshKeys();
    } catch (err) {
      push('Penerbitan gagal', err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  };

  const revokeKey = async (id: string) => {
    setKeyBusy(true);
    try {
      const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}/revoke`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      push('Kunci API dicabut', `${id} tidak bisa lagi autentikasi.`);
      await refreshKeys();
    } catch (err) {
      push('Pencabutan gagal', err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  };

  const revokeOthers = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'others' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      const n: number = body.data.revokedCount ?? 0;
      setSessState(`Keluar dari ${n} perangkat lain · perangkat ini tetap masuk.`);
      push('Sesi lain dicabut', `${n} perangkat keluar.`);
      await refresh();
    } catch (err) {
      push('Pencabutan gagal', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error?.code ? `${body.error.code}: ${body.error.message}` : `HTTP ${res.status}`);
      }
      window.location.href = '/login';
    } catch (err) {
      push('Keluar semua gagal', err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const others = sessions?.filter((s) => !s.current).length ?? 0;

  return (
    <>
      <div className="no-print max-w-[900px] w-full flex flex-col gap-4">
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <Link className="text-muted hover:text-cobalt font-medium" href={`/work-orders/${CANON.workOrderSeal}`}>{CANON.workOrderSeal}</Link>
          <span className="text-muted">/</span>
          <span className="font-semibold text-xl tracking-tight">Profil &amp; Sesi</span>
        </nav>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-wrap items-center gap-4" aria-label="Identity">
          <span className="w-16 h-16 rounded-full bg-cobalt-deep text-white text-xl font-bold flex items-center justify-center">{CANON.sessionInitials}</span>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-semibold">{CANON.sessionUser}</h2>
            <p className="text-sm text-muted">{CANON.sessionRole} · <span className="apex-id">{CANON.sessionEmail}</span> · RFID-7714</p>
            <p className="text-sm text-muted">Peran: <strong className="text-ink">Ops Admin</strong> (1 dari {CANON.roles} Peran) · Shift A · Tenant {CANON.tenant}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href="/badges/RFID-7714/print">
              <Button variant="secondary">
                <Printer size={16} /> Cetak Badge (CR80)
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              <BadgeCheck size={16} /> Cetak Cepat
            </Button>
            <Link href="/organization">
              <Button variant="secondary">Buka Org &amp; RBAC</Button>
            </Link>
          </div>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-col gap-3" aria-labelledby="sess-h">
          <div className="flex items-center justify-between">
            <h2 id="sess-h" className="font-semibold">Sesi Aktif</h2>
            <span className="text-xs text-muted">Sesi server live · MFA: TOTP asli</span>
          </div>
          {loadError ? (
            <p className="text-sm rounded border border-fail bg-fail-bg text-fail-ink p-3" role="alert">
              {loadError}
            </p>
          ) : sessions === null ? (
            <p className="text-sm text-muted" role="status">Memuat sesi…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted" role="status">Tidak ada sesi aktif.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-subtle text-sm">
              {sessions.map((s) => (
                <li key={s.idHashPrefix} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong className="apex-id">sess:{s.idHashPrefix}</strong> · {s.userAgent ?? 'perangkat tak dikenal'}{' '}
                    {s.current && <span className="text-xs text-pass font-bold">PERANGKAT INI</span>}
                    <span className="block text-xs text-muted">terakhir terlihat {fmtDate(s.lastSeenAt)} · kedaluwarsa {fmtDate(s.expiresAt)}</span>
                  </span>
                  {s.current ? (
                    <span className="text-xs text-muted">dilindungi</span>
                  ) : (
                    <span className="text-xs text-muted">gunakan “Keluar dari perangkat lain” di bawah</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted" role="status">{sessState}</p>
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              title="Keluar dari perangkat lain?"
              description={`${others} sesi lain akan segera keluar. Perangkat ini tetap masuk. Draf lapangan tetap di outbox lokal tiap perangkat.`}
              confirmLabel="Keluarkan Lainnya"
              onConfirm={() => revokeOthers()}
            >
              <button
                type="button"
                disabled={busy || sessions === null || others === 0}
                className="h-8 px-3 rounded bg-fail-bg text-fail border border-[#FECACA] text-xs font-bold hover:bg-fail hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keluarkan Perangkat Lain
              </button>
            </ConfirmDialog>
            <ConfirmDialog
              title="Keluar dari SEMUA perangkat?"
              description="Semua sesi termasuk perangkat ini dicabut dan Anda kembali ke layar masuk."
              confirmLabel="Keluar di Semua Tempat"
              onConfirm={() => revokeAll()}
            >
              <button
                type="button"
                disabled={busy || sessions === null}
                className="h-8 px-3 rounded border border-border-subtle text-xs font-bold text-muted hover:text-fail disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keluar di Semua Tempat
              </button>
            </ConfirmDialog>
          </div>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-col gap-3" aria-label="API access">
          <h2 className="font-semibold">Akses API</h2>
          <p className="text-sm text-muted">
            Kunci programmatic diterbitkan dan dicabut di sini — server hanya menyimpan
            hash, jadi secret ditampilkan sekali saat dibuat dan tidak pernah lagi.
            Enforcement bearer di API gateway menyusul;
            lifecycle (terbit / cabut) live.
          </p>
          {keysError && (
            <p className="text-[12px] font-semibold text-fail bg-fail-bg rounded px-2 py-1" role="alert">
              Gagal memuat kunci API: {keysError}
            </p>
          )}
          {keys !== null && keys.length > 0 && (
            <ul className="flex flex-col gap-1 text-[13px]">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle px-2 py-1.5">
                  <span className="min-w-0">
                    <strong className="apex-id">{k.id}</strong> · {k.name} · <span className="apex-id">…{k.last4}</span>
                    <span className="block text-[11px] text-muted apex-id">diterbitkan {fmtDate(k.createdAt)}</span>
                  </span>
                  <ConfirmDialog
                    title={`Cabut ${k.id}?`}
                    description="Kunci berhenti autentikasi segera. Ini tidak bisa dibatalkan — terbitkan kunci baru bila akses masih dibutuhkan."
                    confirmLabel="Cabut Kunci"
                    onConfirm={() => revokeKey(k.id)}
                  >
                    <button
                      type="button"
                      disabled={keyBusy}
                      className="h-8 px-3 rounded border border-border-subtle text-xs font-bold text-muted hover:text-fail disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cabut
                    </button>
                  </ConfirmDialog>
                </li>
              ))}
            </ul>
          )}
          {keys !== null && keys.length === 0 && (
            <p className="text-[13px] text-muted" role="status">Tidak ada kunci API aktif.</p>
          )}
          {freshSecret && (
            <div className="rounded border border-warn bg-warn-bg p-3 text-[13px]" role="alert">
              <p className="font-bold">Salin secret ini sekarang — tidak akan ditampilkan lagi.</p>
              <p className="apex-id break-all font-mono mt-1">{freshSecret.secret}</p>
              <button
                type="button"
                className="mt-2 h-8 px-3 rounded border border-border-subtle text-xs font-bold"
                onClick={() => setFreshSecret(null)}
              >
                Sudah disimpan — sembunyikan
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Nama kunci (mis. scada-exporter)"
              maxLength={80}
              aria-label="Nama kunci API baru"
              className="h-9 flex-1 min-w-[200px] rounded border border-border-subtle bg-surface px-3 text-sm"
            />
            <Button variant="secondary" onClick={() => void issueKey()} disabled={keyBusy}>
              {keyBusy ? '…' : 'Buat Kunci Baru'}
            </Button>
            <Link href="/settings">
              <Button variant="secondary">Buka Pengaturan</Button>
            </Link>
          </div>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-col gap-2" aria-label="Impersonation">
          <h2 className="font-semibold">Audit Impersonate</h2>
          <p className="text-sm text-muted">
            Requires a server-issued impersonation session. Not available in
            this build — the action is disabled rather than simulated, so no
            fake audit claims are shown.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              title="Requires a server-issued impersonation session (not available in this build)"
              className="h-9 px-4 rounded bg-surface border border-border-subtle text-sm font-bold text-muted cursor-not-allowed"
            >
              Impersonasi Field Tech (nonaktif)
            </button>
            <Link href="/audit-trail" className="h-9 px-4 rounded bg-cobalt-tint text-sm font-semibold inline-flex items-center">
              Buka Audit Trail
            </Link>
          </div>
        </section>
      </div>

      {/* L3: badge print view — screen-hidden, print-only */}
      <section className="only-print p-8 bg-white text-black flex-col items-center gap-2 text-center" aria-label="Tampilan cetak badge">
        <svg className="h-10 w-auto" viewBox="0 0 160 40" fill="none" role="img" aria-label="Logo Apex Ops">
          <rect width="36" height="36" rx="8" fill="#1E40AF" />
          <path d="M18 8L27 24H9L18 8Z" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="18" cy="20" r="2.5" fill="#FFFFFF" />
          <path d="M12 28H24" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
          <text x="44" y="23" fontFamily="system-ui" fontWeight="700" fontSize="15" fill="#0F172A">APEXOPS</text>
        </svg>
        <h2 className="text-xl font-bold">{CANON.sessionUser}</h2>
        <p className="text-sm">{CANON.sessionRole} · RFID-7714 · {CANON.tenant}</p>
        <svg width="120" height="120" viewBox="0 0 25 25" role="img" aria-label="QR code badge">
          <rect width="25" height="25" fill="#fff" />
          <g fill="#000">
            <rect x="1" y="1" width="7" height="7" /><rect x="3" y="3" width="3" height="3" fill="#fff" />
            <rect x="17" y="1" width="7" height="7" /><rect x="19" y="3" width="3" height="3" fill="#fff" />
            <rect x="1" y="17" width="7" height="7" /><rect x="3" y="19" width="3" height="3" fill="#fff" />
            <rect x="10" y="4" width="2" height="2" /><rect x="13" y="7" width="2" height="2" />
            <rect x="10" y="10" width="2" height="2" /><rect x="4" y="11" width="2" height="2" />
            <rect x="14" y="12" width="2" height="2" /><rect x="18" y="11" width="2" height="2" />
            <rect x="11" y="15" width="2" height="2" /><rect x="15" y="17" width="2" height="2" />
            <rect x="20" y="18" width="2" height="2" /><rect x="12" y="20" width="2" height="2" />
            <rect x="17" y="21" width="2" height="2" />
          </g>
        </svg>
        <p className="text-xs font-mono">SK · RFID-7714 · Shift A · {CANON.shiftA}</p>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismiss} className="no-print" />
    </>
  );
}
