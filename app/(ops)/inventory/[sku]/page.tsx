import Link from 'next/link';
import { ArrowLeft, History, Package, ShoppingCart } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { getDb } from '@/db/client';
import { getSessionContext } from '@/lib/auth/context';
import { getPart, listMovements } from '@/lib/services/inventory-service';
import { DomainError } from '@/lib/domain/errors';

export default async function InventorySkuDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const decodedSku = decodeURIComponent(sku);

  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const db = getDb();

  let part = null;
  try {
    part = await getPart(db, ctx, decodedSku);
  } catch (e) {
    if (!(e instanceof DomainError) || e.status !== 404) throw e;
  }

  if (!part) {
    return (
      <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Home
          </Link>
          <span>/</span>
          <Link className="hover:text-cobalt transition-colors" href="/inventory">
            Inventory Ledger
          </Link>
          <span>/</span>
          <span className="font-semibold text-body">{decodedSku}</span>
        </nav>
        <EmptyState
          title={`Part ${decodedSku} not found`}
          description="No part with this SKU exists on your tenant. Quantities shown elsewhere come from live stock rows only."
          action={<Link href="/inventory"><Button variant="secondary">Back to Parts Ledger</Button></Link>}
        />
      </div>
    );
  }

  const moves = await listMovements(db, ctx, { sku: decodedSku, limit: 20 });

  const refHref = (ref: string | null) => {
    if (!ref) return null;
    if (/^WO-\d{4}-\d{4}$/.test(ref)) return `/work-orders/${ref}`;
    if (/^PO-\d{4}-\d{4}$/.test(ref)) return `/purchasing/${ref}`;
    if (/^PR-\d{4}-\d{4}$/.test(ref)) return `/purchasing/${ref}`;
    return null;
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/inventory">
          Inventory Ledger
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">{part.sku}</span>
      </nav>

      {/* Header — live DB row */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cobalt-deep text-white flex items-center justify-center shrink-0">
              <Package size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-cobalt">{part.sku}</span>
                <h1 className="text-xl sm:text-2xl font-bold font-display text-ink">{part.name}</h1>
                <Badge variant={part.isLowStock ? 'warn' : 'pass'}>
                  {part.isLowStock ? 'REORDER REQUIRED' : 'IN STOCK'}
                </Badge>
              </div>
              <p className="text-xs text-muted font-mono mt-0.5">
                Unit Cost: {part.priceFormatted} USD · Live stock row
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/purchasing">
              <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                <ShoppingCart size={14} /> Initiate Reorder PO
              </Button>
            </Link>
          </div>
        </div>

        {/* Stock Balance Cards — live */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-border-subtle text-xs">
          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Total On-Hand</span>
            <span className="text-2xl font-bold font-display text-ink tabular-nums">{part.onHand}</span>
            <span className="text-muted block text-[11px] mt-0.5">Physically in Crib</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Allocated / Reserved</span>
            <span className="text-2xl font-bold font-display text-warn tabular-nums">{part.reserved}</span>
            <span className="text-muted block text-[11px] mt-0.5">Staged for WOs</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Net Available</span>
            <span className="text-2xl font-bold font-display text-pass-ink tabular-nums">
              {part.available}
            </span>
            <span className="text-muted block text-[11px] mt-0.5">Free for Dispatch</span>
          </div>

          <div className="p-3 bg-surface rounded-lg border border-border-subtle">
            <span className="text-[10px] font-bold text-muted uppercase block">Storage Bin</span>
            <span className="text-sm font-bold font-mono text-body block truncate mt-1">{part.bin}</span>
            <span className="text-muted block text-[11px] mt-0.5">Reorder at: {part.minStock}</span>
          </div>
        </div>
      </section>

      {/* Movement Ledger History — live DB rows */}
      <section className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <History size={18} className="text-cobalt" /> SKU Transaction &amp; Movement Ledger
          </h2>
          <span className="text-xs text-muted font-mono">{moves.length} Recent Movements</span>
        </div>

        {moves.length === 0 ? (
          <EmptyState
            title="No movements recorded"
            description="This part has no stock movements on your tenant yet. Receive or issue stock to populate this ledger."
            action={<Link href="/inventory"><Button variant="secondary">Back to Parts Ledger</Button></Link>}
          />
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-surface text-muted text-[10px] font-bold uppercase tracking-wider border-b border-border-subtle">
                  <th className="py-2.5 px-3">Movement ID</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Movement Type</th>
                  <th className="py-2.5 px-3">Reference Document</th>
                  <th className="py-2.5 px-3">Quantity</th>
                  <th className="py-2.5 px-3">Balance After</th>
                  <th className="py-2.5 px-3 text-right">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-mono">
                {moves.map((m) => {
                  const href = refHref(m.refNumber);
                  return (
                    <tr key={m.id} className="hover:bg-surface transition-colors">
                      <td className="py-2.5 px-3 font-bold text-body">{m.id}</td>
                      <td className="py-2.5 px-3 text-muted">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface text-muted">
                          {m.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {href && m.refNumber ? (
                          <Link href={href} className="text-cobalt font-bold hover:underline">
                            {m.refNumber}
                          </Link>
                        ) : (
                          <span>{m.refNumber ?? '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold">{m.qty}</td>
                      <td className="py-2.5 px-3 font-bold text-body">{m.afterOnHand}</td>
                      <td className="py-2.5 px-3 text-right font-sans text-body">{m.actorName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/inventory">
          <Button variant="secondary" className="text-xs gap-1">
            <ArrowLeft size={14} /> Back to Parts Ledger
          </Button>
        </Link>
      </div>
    </div>
  );
}
