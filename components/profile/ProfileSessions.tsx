'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, CheckCircle2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { CANON } from '@/lib/canon';
import { cn } from '@/lib/utils';

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

interface Toast { id: number; title: string; msg: string }
let toastSeq = 500;

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
  const [sessState, setSessState] = useState('Loading live sessions…');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [freshSecret, setFreshSecret] = useState<{ id: string; secret: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const push = (title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, title, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  };

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
          ? 'No active sessions found (unexpected — you are signed in).'
          : `${rows.length} active session${rows.length === 1 ? '' : 's'} · ${others} other device${others === 1 ? '' : 's'} · per-session revoke unavailable (hash prefixes only).`,
      );
    } catch (err) {
      setSessions(null);
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(`Could not load sessions: ${msg}`);
      setSessState('Session list unavailable — actions disabled until the server responds.');
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
      push('Key name required', 'Give the key a name (e.g. "scada-exporter") before issuing.');
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
      push('API key issued', `${body.data.id} created — copy the secret now, it will never be shown again.`);
      await refreshKeys();
    } catch (err) {
      push('Issue failed', err instanceof Error ? err.message : String(err));
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
      push('API key revoked', `${id} can no longer authenticate.`);
      await refreshKeys();
    } catch (err) {
      push('Revoke failed', err instanceof Error ? err.message : String(err));
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
      setSessState(`Signed out ${n} other device${n === 1 ? '' : 's'} · this device stays signed in.`);
      push('Other sessions revoked', `${n} device(s) signed out.`);
      await refresh();
    } catch (err) {
      push('Revoke failed', err instanceof Error ? err.message : String(err));
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
      push('Sign-out-all failed', err instanceof Error ? err.message : String(err));
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
          <span className="font-semibold text-xl tracking-tight">Profile &amp; Sessions</span>
        </nav>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-wrap items-center gap-4" aria-label="Identity">
          <span className="w-16 h-16 rounded-full bg-cobalt-deep text-white text-xl font-bold flex items-center justify-center">{CANON.sessionInitials}</span>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-lg font-semibold">{CANON.sessionUser}</h2>
            <p className="text-sm text-muted">{CANON.sessionRole} · <span className="apex-id">{CANON.sessionEmail}</span> · RFID-7714</p>
            <p className="text-sm text-muted">Role: <strong className="text-ink">Ops Admin</strong> (1 of {CANON.roles} Roles) · Shift A · Tenant {CANON.tenant}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link href="/badges/RFID-7714/print">
              <Button variant="secondary">
                <Printer size={16} /> Print Badge (CR80)
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              <BadgeCheck size={16} /> Quick Print
            </Button>
            <Link href="/organization">
              <Button variant="secondary">Open Org &amp; RBAC</Button>
            </Link>
          </div>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-col gap-3" aria-labelledby="sess-h">
          <div className="flex items-center justify-between">
            <h2 id="sess-h" className="font-semibold">Active Sessions</h2>
            <span className="text-xs text-muted">Live server sessions · MFA: real TOTP</span>
          </div>
          {loadError ? (
            <p className="text-sm rounded border border-fail bg-fail-bg text-fail-ink p-3" role="alert">
              {loadError}
            </p>
          ) : sessions === null ? (
            <p className="text-sm text-muted" role="status">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted" role="status">No active sessions found.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-subtle text-sm">
              {sessions.map((s) => (
                <li key={s.idHashPrefix} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong className="apex-id">sess:{s.idHashPrefix}</strong> · {s.userAgent ?? 'unknown device'}{' '}
                    {s.current && <span className="text-xs text-pass font-bold">THIS DEVICE</span>}
                    <span className="block text-xs text-muted">last seen {fmtDate(s.lastSeenAt)} · expires {fmtDate(s.expiresAt)}</span>
                  </span>
                  {s.current ? (
                    <span className="text-xs text-muted">protected</span>
                  ) : (
                    <span className="text-xs text-muted">use “Sign out other devices” below</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted" role="status">{sessState}</p>
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              title="Sign out other devices?"
              description={`${others} other session(s) will be signed out immediately. This device stays signed in. Field drafts stay in each device's local outbox.`}
              confirmLabel="Sign Out Others"
              onConfirm={() => revokeOthers()}
            >
              <button
                type="button"
                disabled={busy || sessions === null || others === 0}
                className="h-8 px-3 rounded bg-fail-bg text-fail border border-[#FECACA] text-xs font-bold hover:bg-fail hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign Out Other Devices
              </button>
            </ConfirmDialog>
            <ConfirmDialog
              title="Sign out ALL devices?"
              description="Every session including this device is revoked and you return to the login screen."
              confirmLabel="Sign Out Everywhere"
              onConfirm={() => revokeAll()}
            >
              <button
                type="button"
                disabled={busy || sessions === null}
                className="h-8 px-3 rounded border border-border-subtle text-xs font-bold text-muted hover:text-fail disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign Out Everywhere
              </button>
            </ConfirmDialog>
          </div>
        </section>

        <section className="bg-card border border-border-subtle rounded-lg p-5 flex flex-col gap-3" aria-label="API access">
          <h2 className="font-semibold">API Access</h2>
          <p className="text-sm text-muted">
            Programmatic keys are issued and revoked here — the server stores
            only hashes, so a secret is shown once at creation and never again.
            Bearer enforcement at the API gateway lands in a follow-up slice;
            lifecycle (issue / revoke) is live.
          </p>
          {keysError && (
            <p className="text-[12px] font-semibold text-fail bg-fail-bg rounded px-2 py-1" role="alert">
              Could not load API keys: {keysError}
            </p>
          )}
          {keys !== null && keys.length > 0 && (
            <ul className="flex flex-col gap-1 text-[13px]">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle px-2 py-1.5">
                  <span className="min-w-0">
                    <strong className="apex-id">{k.id}</strong> · {k.name} · <span className="apex-id">…{k.last4}</span>
                    <span className="block text-[11px] text-muted apex-id">issued {fmtDate(k.createdAt)}</span>
                  </span>
                  <ConfirmDialog
                    title={`Revoke ${k.id}?`}
                    description="The key stops authenticating immediately. This cannot be undone — issue a new key if access is still needed."
                    confirmLabel="Revoke Key"
                    onConfirm={() => revokeKey(k.id)}
                  >
                    <button
                      type="button"
                      disabled={keyBusy}
                      className="h-8 px-3 rounded border border-border-subtle text-xs font-bold text-muted hover:text-fail disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Revoke
                    </button>
                  </ConfirmDialog>
                </li>
              ))}
            </ul>
          )}
          {keys !== null && keys.length === 0 && (
            <p className="text-[13px] text-muted" role="status">No active API keys.</p>
          )}
          {freshSecret && (
            <div className="rounded border border-warn bg-warn-bg p-3 text-[13px]" role="alert">
              <p className="font-bold">Copy this secret now — it will never be shown again.</p>
              <p className="apex-id break-all font-mono mt-1">{freshSecret.secret}</p>
              <button
                type="button"
                className="mt-2 h-8 px-3 rounded border border-border-subtle text-xs font-bold"
                onClick={() => setFreshSecret(null)}
              >
                I saved it — hide
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g. scada-exporter)"
              maxLength={80}
              aria-label="New API key name"
              className="h-9 flex-1 min-w-[200px] rounded border border-border-subtle bg-surface px-3 text-sm"
            />
            <Button variant="secondary" onClick={() => void issueKey()} disabled={keyBusy}>
              {keyBusy ? '…' : 'Generate New Key'}
            </Button>
            <Link href="/settings">
              <Button variant="secondary">Open Settings</Button>
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
              Impersonate Field Tech (disabled)
            </button>
            <Link href="/audit-trail" className="h-9 px-4 rounded bg-cobalt-tint text-sm font-semibold inline-flex items-center">
              Open Audit Trail
            </Link>
          </div>
        </section>
      </div>

      {/* L3: badge print view — screen-hidden, print-only */}
      <section className="only-print p-8 bg-white text-black flex-col items-center gap-2 text-center" aria-label="Badge print view">
        <svg className="h-10 w-auto" viewBox="0 0 160 40" fill="none" role="img" aria-label="Apex Ops logo">
          <rect width="36" height="36" rx="8" fill="#1E40AF" />
          <path d="M18 8L27 24H9L18 8Z" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="18" cy="20" r="2.5" fill="#FFFFFF" />
          <path d="M12 28H24" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
          <text x="44" y="23" fontFamily="system-ui" fontWeight="700" fontSize="15" fill="#0F172A">APEXOPS</text>
        </svg>
        <h2 className="text-xl font-bold">{CANON.sessionUser}</h2>
        <p className="text-sm">{CANON.sessionRole} · RFID-7714 · {CANON.tenant}</p>
        <svg width="120" height="120" viewBox="0 0 25 25" role="img" aria-label="Badge QR code">
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

      <div className="no-print fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cn('rounded-lg shadow-modal p-3 flex gap-2 items-start text-sm bg-pass-bg border border-pass text-pass-ink')}>
            <CheckCircle2 size={20} className="shrink-0" />
            <div className="flex-1"><p className="font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
