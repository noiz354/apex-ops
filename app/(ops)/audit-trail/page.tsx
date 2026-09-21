import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuditTrail } from '@/components/audit/AuditTrail';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { listAuditEvents } from '@/lib/services/audit-service';

export default async function AuditTrailPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  if (!can(ctx.role, 'audit.read')) {
    return (
      <EmptyState
        title="Audit trail requires the audit.read permission"
        description={`Your role (${ctx.role}) cannot view the ledger. Ask an Enterprise Admin, or sign in as m.vance@apexops.io for the demo.`}
        action={<Link href="/"><Button>Back to Dashboard</Button></Link>}
      />
    );
  }
  const page = await listAuditEvents(getDb(), ctx);
  return (
    <AuditTrail
      rows={page.rows}
      total={page.total}
      truncated={page.truncated}
      orgId={ctx.orgId}
    />
  );
}
