'use client';

import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';
import { has } from '@/lib/platform/capability';
import { Lock, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [email, setEmail] = useState<string>('m.vance@apexops.io');
  const [pass, setPass] = useState('');
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
          message: err.code === 'RATE_LIMITED' ? `${err.message} Coba lagi sesaat.` : err.message,
        });
      } else {
        setError({ code: 'NETWORK', message: 'Gangguan jaringan — server tidak terjangkau.' });
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
      setMfaError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Gangguan jaringan — tidak ada yang diverifikasi. Coba lagi.');
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
        body: { orgId: 'APX-NUSA-01', email },
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
        message: err instanceof ApiError ? err.message : 'Passkey gagal — gunakan password + TOTP.',
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
        <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
        <p className="text-[13px] text-muted">Apex Ops CMMS · konsol operasi yang aman</p>
      </div>

      {step === 'password' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-email">Email Kerja</label>
            <input id="lf-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
            {touched && !emailOk && <p className="text-[11px] font-semibold text-fail">Email kerja yang valid wajib diisi.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-pass">Kata Sandi</label>
            <input id="lf-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt" />
            {touched && !passOk && <p className="text-[11px] font-semibold text-fail">Kata sandi minimal 8 karakter.</p>}
            {error && <p className="text-[11px] font-semibold text-fail" role="alert">{error.message} ({error.code})</p>}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? 'Memverifikasi…' : 'Lanjut'}
          </Button>

          {mounted && has.webAuthn() && (
            <Button type="button" variant="secondary" disabled={busy || !emailOk} onClick={submitPasskey}>
              <Fingerprint size={16} /> Passkey
            </Button>
          )}
          <Button type="button" variant="ghost" disabled title="SSO belum dikonfigurasi">SSO belum dikonfigurasi</Button>
        </>
      )}

      {step === 'mfa' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="lf-mfa">Kode dua faktor</label>
            <input id="lf-mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt apex-id tracking-widest" />
            <p className="text-[11px] text-muted">TOTP 6 digit dari authenticator (RFC 6238 · diverifikasi server, 5x coba).</p>
            {devHint && (
              <p className="text-[11px] font-semibold text-cobalt-deep bg-cobalt-tint rounded p-2" data-testid="dev-hint">
                Petunjuk dev (non-produksi): kode saat ini <strong className="apex-id">{devHint}</strong>
              </p>
            )}
            {mfaError && <p className="text-[11px] font-semibold text-fail" role="alert">{mfaError}</p>}
          </div>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Lock size={16} />}
            {busy ? 'Memverifikasi…' : 'Verifikasi'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setStep('password'); setCode(''); setMfaError(''); setError(null); }}>Kembali</Button>
        </>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold text-pass">✓ Berhasil masuk{user ? ` — ${user.name} · ${user.role}` : ''}</p>
          <p className="text-[11px] text-muted">Cookie sesi diset (httpOnly · 7 hari). Mengalihkan…</p>
        </div>
      )}

      <p className="text-[11px] text-muted">
        Apex Ops CMMS — prototipe demo · auth nyata: password scrypt + TOTP MFA + sesi DB ·{' '}
        <a className="text-cobalt hover:underline" href="https://github.com/noiz354/new-dash" target="_blank" rel="noreferrer">repo</a>
      </p>
    </form>
  );
}
