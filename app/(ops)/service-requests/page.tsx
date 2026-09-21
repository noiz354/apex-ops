import { redirect } from 'next/navigation';
import { ServiceRequestList } from '@/components/requests/ServiceRequestList';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { listServiceRequests } from '@/lib/services/sr-service';

export default async function ServiceRequestsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const rows = await listServiceRequests(getDb(), ctx);
  return (
    <ServiceRequestList
      rows={rows}
      can={{ create: can(ctx.role, 'sr.create'), transition: can(ctx.role, 'sr.transition') }}
      orgId={ctx.orgId}
    />
  );
}
