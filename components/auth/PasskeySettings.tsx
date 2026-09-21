'use client';

import { useEffect, useState, useCallback } from 'react';
import { KeyRound, Plus, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { has } from '@/lib/platform/capability';
import { startRegistration } from '@simplewebauthn/browser';

interface PasskeyListEntry {
  id: string;
  friendlyName: string;
}

export function PasskeySettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [rows, setRows] = useState<PasskeyListEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/passkeys/login');
      if (!res.ok) return;
      const { data } = (await res.json()) as { data: PasskeyListEntry[] };
      setRows(data);
    } catch { }
  }, []);

  useEffect(() => {
    const ok = has.webAuthn();
    setSupported(ok);
    if (ok) load();
  }, [load]);

  if (!supported) {
    return (
      <div className="text-xs text-muted">
        Passkey tidak tersedia — browser tidak memiliki WebAuthn / PublicKeyCredential.
        Gunakan login password + TOTP.
      </div>
    );
  }

  const addPasskey = async () => {
    setErr(null);
    setBusy(true);
    try {
      const friendlyName = prompt('Nama passkey (contoh: Laptop Kantor)') ?? 'Passkey';
      const res = await fetch('/api/auth/passkeys/register');
      if (res.status === 403) {
        setForbidden(true);
        throw new Error('Role Anda tidak diizinkan passkey self-service (butuh settings.manage). Minta admin.');
      }
      if (!res.ok) throw new Error(`options HTTP ${res.status}`);
      const options = (await res.json()).data;
      const attResp = await startRegistration({ optionsJSON: options });
      const verify = await fetch('/api/auth/passkeys/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestation: attResp, friendlyName }),
      });
      if (!verify.ok) throw new Error(`verify HTTP ${verify.status}`);
      await load();
    } catch (e) {
      setErr((e as Error).message ?? 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (id: string) => {
    setErr(null);
    try {
      await fetch(`/api/auth/passkeys/login?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setErr((e as Error).message ?? 'Revoke failed');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted">
          Cadangkan identitas peripheral per device; passkey TIDAK menggantikan TOTP.
        </div>
        <Button variant="primary" onClick={addPasskey} disabled={busy}>
          <Plus size={14} /> Tambah Passkey
        </Button>
      </div>

      {forbidden && (
        <div className="flex items-start gap-2 rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>Role tidak diizinkan (butuh <code>settings.manage</code>). Minta Admin untuk menambahkan passkey melalui halaman KRITIS organisasi.</span>
        </div>
      )}
      {err && <div className="text-xs text-fail">{err}</div>}

      {rows.length === 0 ? (
        <div className="text-xs text-muted">Belum ada passkey; klik Tambah untuk mendaftarkan perangkat ini.</div>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle border border-border-subtle rounded">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-2 text-xs">
              <span className="flex items-center gap-2"><KeyRound size={14} /> {r.friendlyName}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted apex-id">{r.id.slice(0, 8)}</span>
                <button onClick={() => removePasskey(r.id)} className="opacity-70 hover:opacity-100 text-fail" aria-label="Revoke">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
