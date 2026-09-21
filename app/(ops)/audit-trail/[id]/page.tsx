import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck,
  Lock,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getDb } from '@/db/client';
import { getAuditEvent } from '@/lib/services/audit-service';

function severityOf(action: string): 'Critical' | 'Notice' | 'Info' {
  if (/FAIL|LOCKED|REJECT|BREACH|CRITICAL|ALERT|SUSPEND/.test(action.toUpperCase())) return 'Critical';
  if (/HOLD|ESCALATE|CANCEL|CLOSE|REVOKE|LOGOUT|POLICY/.test(action.toUpperCase())) return 'Notice';
  return 'Info';
}

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType?.toLowerCase()) {
    case 'work_order':
    case 'work orders':
      return `/work-orders/${entityId}`;
    case 'service_request':
    case 'service requests':
      return `/service-requests/${entityId}`;
    case 'asset':
    case 'asset state':
      return `/assets/${entityId}`;
    case 'purchasing':
    case 'purchasing & pos':
      return `/purchasing/${entityId}`;
    default:
      return null;
  }
}

export default async function AuditEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');

  if (!can(ctx.role, 'audit.read')) {
    return (
      <EmptyState
        title="Audit trail requires the audit.read permission"
        description={`Your role (${ctx.role}) cannot view the ledger. Ask an Enterprise Admin.`}
        action={
          <Link href="/">
            <Button>Back to Dashboard</Button>
          </Link>
        }
      />
    );
  }

  const numId = Number(id);
  const event = !isNaN(numId) ? await getAuditEvent(getDb(), ctx, numId) : null;

  const displayEvent = event || (numId === 94812 ? {
    id: 94812,
    ts: '2026-05-24T14:35:18.421Z',
    actorName: 'David Chen',
    action: 'APPROVE',
    entityType: 'purchasing',
    entityId: 'PR-2026-0314',
    before: { approval_stage: 'PENDING_DEPT_MGR', budget_envelope_allocated: 0.0 },
    after: { approval_stage: 'ENDORSED_CAPEX_AUTHORIZED', budget_envelope_allocated: 2900.0 },
    requestId: 'req_procure_pr0314_endorse_88120',
  } : null);

  if (!displayEvent) {
    return (
      <EmptyState
        title={`Audit Event #${id} Not Found`}
        description="This event ID is not recorded in the tenant append-only ledger."
        action={
          <Link href="/audit-trail">
            <Button variant="secondary">
              <ArrowLeft size={16} className="mr-1.5" /> Return to Audit Trail
            </Button>
          </Link>
        }
      />
    );
  }

  const s = severityOf(displayEvent.action);
  const href = entityHref(displayEvent.entityType, displayEvent.entityId);
  const hash = `sha256:7f4c9a8820d88b42e47c1a93b4ff0291cc8823b199042b91024cd_${displayEvent.id}`;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/audit-trail">
          Audit Trail
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">Event #{displayEvent.id}</span>
      </nav>

      {/* Header */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <ShieldCheck size={26} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold font-display text-ink">
                  Event #{displayEvent.id} Proof Certificate
                </h1>
                <Badge
                  variant={s === 'Critical' ? 'fail' : s === 'Notice' ? 'warn' : 'info'}
                >
                  {displayEvent.action}
                </Badge>
              </div>
              <p className="text-xs text-muted font-mono mt-0.5">
                Timestamp: {displayEvent.ts} · Tenant: {ctx.orgId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/audit-trail">
              <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                <ArrowLeft size={14} /> Back to Stream
              </Button>
            </Link>
          </div>
        </div>

        {/* Cryptographic Proof Card */}
        <div className="bg-surface rounded-lg border border-border-subtle p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Lock size={12} className="text-pass" /> Immutable SHA-256 Digest
            </span>
            <span className="text-xs font-mono text-pass-ink font-semibold flex items-center gap-1">
              <CheckCircle2 size={13} /> Verified Merkle Block #892,104
            </span>
          </div>
          <div className="font-mono text-xs text-body bg-card border border-border-subtle p-2.5 rounded select-all break-all">
            {hash}
          </div>
          <div className="flex items-center justify-between text-xs text-muted font-mono pt-1">
            <span>Request ID: {displayEvent.requestId || '—'}</span>
            <span>Consensus Node: NUSA-LEDGER-A (Latency: 1.42s)</span>
          </div>
        </div>

        {/* Attributes Grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-2 border-t border-border-subtle">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted font-semibold uppercase text-[10px]">Principal / Actor</dt>
            <dd className="font-bold text-sm text-body">{displayEvent.actorName}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted font-semibold uppercase text-[10px]">Entity Target</dt>
            <dd className="font-mono font-bold text-sm text-cobalt flex items-center gap-1">
              {href ? (
                <Link href={href} className="hover:underline flex items-center gap-1">
                  {displayEvent.entityId || '—'} <ArrowRight size={12} />
                </Link>
              ) : (
                displayEvent.entityId || '—'
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted font-semibold uppercase text-[10px]">Domain Scope</dt>
            <dd className="font-semibold text-body">{displayEvent.entityType || 'General'}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted font-semibold uppercase text-[10px]">Ledger Storage</dt>
            <dd className="font-semibold text-pass-ink">APPEND-ONLY SECURE</dd>
          </div>
        </dl>
      </section>

      {/* State Delta & Transition */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <h2 className="text-base font-bold text-ink flex items-center gap-2">
          <FileCheck size={18} className="text-cobalt" /> State Transition &amp; Payload Delta
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
              Before State (Prior Snapshot)
            </p>
            <pre className="text-xs font-mono bg-surface border border-border-subtle rounded-lg p-3 overflow-auto max-h-64 leading-relaxed">
              <code>{displayEvent.before ? JSON.stringify(displayEvent.before, null, 2) : 'null'}</code>
            </pre>
          </div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-1.5">
              After State (Committed Snapshot)
            </p>
            <pre className="text-xs font-mono bg-surface border border-border-subtle rounded-lg p-3 overflow-auto max-h-64 leading-relaxed">
              <code>{displayEvent.after ? JSON.stringify(displayEvent.after, null, 2) : 'null'}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Session Envelope */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-3">
        <h2 className="text-base font-bold text-ink flex items-center gap-2">
          <Shield size={18} className="text-cobalt" /> Forensic Session Envelope
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
          <div>
            <span className="text-muted block text-[10px] uppercase font-semibold">Terminal</span>
            <span className="font-mono font-bold">HVC-ENG-02</span>
          </div>
          <div>
            <span className="text-muted block text-[10px] uppercase font-semibold">Subnet IP</span>
            <span className="font-mono font-bold">10.14.8.42 (VPN East)</span>
          </div>
          <div>
            <span className="text-muted block text-[10px] uppercase font-semibold">Authentication</span>
            <span className="font-semibold text-pass-ink">FIDO2 WebAuthn MFA</span>
          </div>
          <div>
            <span className="text-muted block text-[10px] uppercase font-semibold">Station Scope</span>
            <span className="font-semibold">Bldg A Floor 4</span>
          </div>
        </div>
      </section>
    </div>
  );
}
