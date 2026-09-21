'use client';

import { useState } from 'react';
import { Building, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api/client';

interface SignupResponse {
  organizationId?: string;
  orgName?: string;
  adminUserId?: string;
  adminEmail?: string;
  duplicate?: boolean;
  message?: string;
}

type Step = 'form' | 'done';

interface ErrInfo { code: string; message: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function SignupForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const [step, setStep] = useState<Step>('form');
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTitle, setAdminTitle] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrInfo | null>(null);
  const [created, setCreated] = useState<SignupResponse | null>(null);

  const orgOk = orgName.trim().length >= 3 && orgName.trim().length <= 100;
  const nameOk = adminName.trim().length >= 2 && adminName.trim().length <= 100;
  const emailOk = EMAIL_RE.test(adminEmail);
  const passOk = adminPassword.length >= 8 && adminPassword.length <= 100;
  const titleOk = adminTitle.trim().length <= 100;

  const submit = async () => {
    if (busy) return;
    setTouched(true);
    if (!orgOk || !nameOk || !emailOk || !passOk || !titleOk) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        orgName: orgName.trim(),
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim(),
        adminPassword,
      };
      if (adminTitle.trim()) body.adminTitle = adminTitle.trim();
      const data = await apiFetch<SignupResponse>('/api/auth/signup', {
        method: 'POST',
        body,
      });
      setCreated(data);
      setStep('done');
      if (!data.duplicate) {
        setTimeout(() => window.location.assign(redirectTo), 400);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({ code: 'NETWORK', message: 'Network error — server not reachable.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'h-9 px-3 border border-border-strong rounded text-sm bg-card outline-none focus:border-cobalt focus:ring-1 focus:ring-cobalt';
  const errCls = 'text-[11px] font-semibold text-fail';

  return (
    <form
      className="bg-card border border-border-subtle rounded-lg shadow-card p-8 w-full max-w-sm flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your tenant</h1>
        <p className="text-[13px] text-muted">Apex Ops CMMS · provision a new organization workspace</p>
      </div>

      {step === 'form' && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="sf-org">Organization Name</label>
            <input id="sf-org" type="text" autoComplete="organization" value={orgName} onChange={(e) => setOrgName(e.target.value)}
              className={inputCls} />
            {touched && !orgOk && <p className={errCls}>Organization name must be 3–100 characters.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="sf-name">Admin Full Name</label>
            <input id="sf-name" type="text" autoComplete="name" value={adminName} onChange={(e) => setAdminName(e.target.value)}
              className={inputCls} />
            {touched && !nameOk && <p className={errCls}>Admin name must be 2–100 characters.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="sf-email">Admin Work Email</label>
            <input id="sf-email" type="email" autoComplete="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
              className={inputCls} />
            {touched && !emailOk && <p className={errCls}>A valid work email is required.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="sf-pass">Admin Password</label>
            <input id="sf-pass" type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
              className={inputCls} />
            {touched && !passOk && <p className={errCls}>Password must be at least 8 characters.</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" htmlFor="sf-title">Admin Title <span className="font-normal text-muted">(optional)</span></label>
            <input id="sf-title" type="text" autoComplete="organization-title" value={adminTitle} onChange={(e) => setAdminTitle(e.target.value)}
              className={inputCls} />
            {touched && !titleOk && <p className={errCls}>Title must be at most 100 characters.</p>}
            {error && <p className={errCls} role="alert">{error.message} ({error.code})</p>}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Building size={16} />}
            {busy ? 'Provisioning tenant…' : 'Create organization'}
          </Button>
        </>
      )}

      {step === 'done' && created?.duplicate && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold">Account lookup complete</p>
          <p className="text-[13px] text-muted">{created.message ?? 'This email may already be registered.'}</p>
          <a className="text-cobalt hover:underline text-sm font-semibold" href="/login">Sign in →</a>
        </div>
      )}
      {step === 'done' && !created?.duplicate && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm font-semibold text-pass">
            ✓ Tenant provisioned{created ? ` — ${created.orgName} · ${created.organizationId}` : ''}
          </p>
          <p className="text-[11px] text-muted">Session cookie set (httpOnly · 7 days). Redirecting to your dashboard…</p>
        </div>
      )}

      <p className="text-[11px] text-muted">
        Already have a tenant?{' '}
        <a className="text-cobalt hover:underline" href="/login">Sign in</a>
        {' '}· Apex Ops CMMS — demo prototype · real provisioning: transactional org + admin + sequences ·{' '}
        <a className="text-cobalt hover:underline" href="https://github.com/noiz354/new-dash" target="_blank" rel="noreferrer">repo</a>
      </p>
    </form>
  );
}
