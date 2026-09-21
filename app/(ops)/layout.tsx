import { redirect } from 'next/navigation';
import { OpsShell } from '@/components/ops/OpsShell';
import { RumInit } from '@/components/telemetry/RumInit';
import { SwRegister } from '@/components/pwa/SwRegister';
import { getSessionContext } from '@/lib/auth/context';

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return (
    <OpsShell
      user={{
        name: ctx.name,
        initials: ctx.initials,
        role: ctx.role,
        title: ctx.title,
        email: ctx.email,
        orgId: ctx.orgId,
        orgName: ctx.orgName,
      }}
    >
      <RumInit />
      <SwRegister />
      {children}
    </OpsShell>
  );
}
