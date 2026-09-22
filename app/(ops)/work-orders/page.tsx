import { redirect } from 'next/navigation';
import { WorkOrderList } from '@/components/workorders/WorkOrderList';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { listAssignableTechs, listWorkOrders } from '@/lib/services/wo-service';

export default async function WorkOrdersPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const db = getDb();
  const [rows, techs] = await Promise.all([listWorkOrders(db, ctx), listAssignableTechs(db, ctx)]);
  return (
    <WorkOrderList
      rows={rows}
      techs={techs}
      can={{ create: can(ctx.role, 'wo.create'), transition: can(ctx.role, 'wo.transition') }}
    />
  );
}
