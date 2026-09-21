'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { has } from '@/lib/platform/capability';

export function PushOptIn() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!has.serviceWorker() || !('PushManager' in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, []);

  if (supported === false || supported === null) {
    return (
      <div className="text-xs text-muted">
        Push notifications tidak tersedia di browser ini — fitur hanya aktif jika
        PushManager & serviceWorker didukung.
      </div>
    );
  }

  const toggle = async () => {
    setErr(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
      } else {
        const res = await fetch('/api/push/subscribe');
        if (!res.ok) throw new Error(`fetch VAPID failed: HTTP ${res.status}`);
        const { data: { publicKey } } = (await res.json()) as { data: { publicKey: string } };

        const key = (function urlBase64ToUint8Array(base64String: string) {
          const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const raw = atob(base64);
          const out = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
          return out;
        })(publicKey) as BufferSource;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        const json = sub.toJSON();
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          }),
        });
        setSubscribed(true);
      }
    } catch (e) {
      setErr((e as Error).message ?? 'Subscription failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant={subscribed ? 'secondary' : 'primary'} onClick={toggle} disabled={busy}>
        {subscribed ? <BellOff size={16} /> : <Bell size={16} />} {busy ? '…' : subscribed ? 'Matikan P1 Push' : 'Aktifkan P1 Push'}
      </Button>
      {err && <div className="text-xs text-fail">{err}</div>}
      <div className="text-[11px] text-muted">
        Dikirim hanya untuk eskalasi SLA-P1 (server-authoritative). Format notifikasi
        menghormati Settings &gt; Notifications; mark-read / silencing masih manual.
      </div>
    </div>
  );
}
