'use client';

import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';
import { has } from '@/lib/platform/capability';
import { Lock, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { AuthContext } from '@/lib/auth/session';

interface LoginResponse {
  status?: string;
  challengeId?: string;
  devHint?: string;
  redirect?: string;
  user?: AuthContext;
}

type Step = 'password' | 'mfa' | 'done';

interface ErrInfo { code: string; message: string }

export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState<string>(CANON.sessionEmail);
  const [pass, setPass] = useState('demo-pass-4821');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrInfo | null>(null);
  const [challengeId, setChallengeId] = useState('');
  const [devHint, setDevHint] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [user, setUser] = useState<AuthContext | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const passOk = pass.length >= 8;

  const submitLogin = async () => {
    if (busy) return;
    setTouched(true);
    if (!emailOk || !passOk) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password: pass },
      });
      if (data.status === 'mfa_required') {
        setChallengeId(data.challengeId ?? '');
        setDevHint(data.devHint ?? null);
        setStep('mfa');
      } else {
        setUser(data.user ?? null);
        setStep('done');
        setTimeout(() => window.location.assign(data.redirect || redirectTo), 400);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError({
          code: err.code,
          message: err.code === 'RATE_LIMITED' ? `${err.message} Try again shortly.` : err.message,
        });
      } else {
        setError({ code: 'NETWORK', message: 'Network error — server not reachable.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const verifyMfa = async () => {
    if (busy || code.length !== 6) return;
    setBusy(true);
    setMfaError('');
    try {
      const data = await apiFetch<LoginResponse>('/api/auth/mfa', {
        method: 'POST',
        body: { challengeId, code },
      });
      setUser(data.user ?? null);
      setStep('done');
      setTimeout(() => window.location.assign(data.redirect || redirectTo), 400);
    } catch (err) {
      setMfaError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Network error — nothing verified. Retry.');
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submitPasskey = async () => {
    if (busy || !emailOk) return;
    setBusy(true);
    setError(null);
    try {
      const options = (await apiFetch<{ challenge: string; rpId: string; allowCredentials: { type: string; id: string }[] }>('/api/auth/passkeys/login', {
        method: 'POST',
        body: { orgId: CANON.tenant, email },
      })) as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'];
      const assertion = await startAuthentication({ optionsJSON: options });
      const data = await apiFetch<LoginResponse>('/api/auth/passkeys/login', {
        method: 'PUT',
        body: { assertion },
      });
      if (data.status === 'mfa_required') {
        setChallengeId(data.challengeId ?? '');
        setStep('mfa');
      } else if (data.status === 'ok') {
        window.location.href = redirectTo;
      }
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.code : 'PASSKEY_ERROR',
        message: err instanceof ApiError ? err.message : 'Passkey assertion failed — use password + TOTP.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="bg-card border border-border-subtle rounded-lg shadow-card p-8 w-full max-w-sm flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); if (step === 'password') submitLogin(); else if (step === 'mfa') verifyMfa(); }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-[13px] text-muted">Apex Ops CMMS · secure ops console · tenant {CANON.tenant}</p>
      </div>

      {step === 'password' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-email">Work Email</label>
            <input id="lf-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
            {touched && !emailOk && <p className="text-[11px] font-semibold text-fail">A valid work email is required.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-pass">Password</label>
            <input id="lf-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
            {touched && !passOk && <p className="text-[11px] font-semibold text-fail">Password must be at least 8 characters.</p>}
            {error && <p className="text-[11px] font-semibold text-fail" role="alert">{error.message} ({error.code})</p>}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? 'Verifying credentials…' : 'Continue'}
          </Button>

          {mounted && has.webAuthn() && (
            <Button type="button" variant="secondary" disabled={busy || !emailOk} onClick={submitPasskey}>
              <Fingerprint size={16} /> Passkey
            </Button>
          )}
          <Button type="button" variant="ghost" disabled title="SSO is not configured yet (Phase 1b)">SSO not configured (Phase 1b)</Button>
        </>
      )}

      {step === 'mfa' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-mfa">Two-factor code</label>
            <input id="lf-mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt apex-id tracking-widest" />
            <p className="text-[11px] text-muted">6-digit TOTP from your authenticator (RFC 6238 · server-verified, 5 attempts).</p>
            {devHint && (
              <p className="text-[11px] font-semibold text-cobalt-deep bg-cobalt-tint rounded p-2" data-testid="dev-hint">
                Dev hint (non-production): current code <strong className="apex-id">{devHint}</strong>
              </p>
            )}
            {mfaError && <p className="text-[11px] font-semibold text-fail" role="alert">{mfaError}</p>}
          </div>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? 'Verifying code…' : 'Verify'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setStep('password'); setCode(''); setMfaError(''); setError(null); }}>Back</Button>
        </>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold text-pass">✓ Signed in{user ? ` — ${user.name} · ${user.role} · ${user.orgId}` : ''}</p>
          <p className="text-[11px] text-muted">Session cookie set (httpOnly · 7 days). Redirecting…</p>
        </div>
      )}

      <p className="text-[11px] text-muted">
        Apex Ops CMMS — demo prototype · real auth: scrypt password + TOTP MFA + DB sessions ·{' '}
        <a className="text-cobalt hover:underline" href="https://github.com/noiz354/new-dash" target="_blank" rel="noreferrer">repo</a>
      </p>
    </form>
  );
}
