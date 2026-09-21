import { SettingsHub } from '@/components/settings/SettingsHub';
import { StorageReset } from '@/components/settings/StorageReset';
import { PushOptIn } from '@/components/pwa/PushOptIn';
import { PasskeySettings } from '@/components/auth/PasskeySettings';

export default function SettingsPage() {
  return (
    <>
      <SettingsHub />
      <section className="apex-card">
        <div className="apex-card-head"><h2 className="text-sm font-semibold">Push Notifications & Passkeys</h2></div>
        <div className="apex-card-body flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold tracking-wider uppercase text-muted">Web Push (FP-18 / TASK-27)</p>
            <PushOptIn />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold tracking-wider uppercase text-muted">Passkey Self-Service (FP-19 / TASK-28)</p>
            <PasskeySettings />
          </div>
        </div>
      </section>
      <StorageReset />
    </>
  );
}
