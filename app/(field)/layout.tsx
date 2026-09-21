import { redirect } from 'next/navigation';
import { FieldShell } from '@/components/field/FieldShell';
import { RumInit } from '@/components/telemetry/RumInit';
import { SwRegister } from '@/components/pwa/SwRegister';
import { getSessionContext } from '@/lib/auth/context';

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  return (
    <FieldShell>
      <RumInit />
      <SwRegister />
      {children}
    </FieldShell>
  );
}
