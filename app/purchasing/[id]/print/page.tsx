import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CANON } from '@/lib/canon';
import { PrintButton } from '@/components/purchasing/PrintButton';

export function generateStaticParams() {
  return [{ id: CANON.purchaseOrder }];
}

export default async function PurchasePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^PO-\d{4}-\d{4}$/.test(id)) notFound();
  return (
    <main className="mx-auto max-w-3xl bg-white text-black p-8 print:p-0 flex flex-col gap-6">
      
      <div className="border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-bold px-3 py-2 rounded">
        SAMPLE — reference layout only. Vendor, lines and approvals below are static and NOT from the database.
      </div>
      <header className="flex items-center justify-between border-b pb-4">
        <div>
          <p className="text-xs font-bold tracking-widest">FACILITY MAINTENANCE</p>
          <h1 className="text-2xl font-bold">Purchase Order {id}</h1>
          <p className="text-sm text-gray-600">Batch dossier · printed 2026-09-13 · Harbor Office</p>
        </div>
        <Link href={`/purchasing/${id}`} className="text-sm font-semibold text-blue-700 print:hidden">← Back to PO</Link>
      </header>
      <section className="text-sm">
        <h2 className="font-bold mb-2">Vendor</h2>
        <p>Trane Supply Co · MSA {CANON.msa} · FedEx Freight Priority · Waybill FX-9920148-US</p>
      </section>
      <section className="text-sm">
        <h2 className="font-bold mb-2">Line Items</h2>
        <table className="w-full border-collapse">
          <thead><tr className="border-b"><th className="text-left py-1">SKU</th><th className="text-left py-1">Item</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b"><td className="py-1 font-mono">{CANON.sealSku}</td><td>Silicon Carbide Shaft Seal 2.5&quot; Kit</td><td className="text-right">2</td><td className="text-right font-mono">$2,900.00</td></tr>
          </tbody>
        </table>
      </section>
      <section className="text-sm">
        <h2 className="font-bold mb-2">Approvals — quorum 2 of 3</h2>
        <ul className="list-disc pl-5">
          <li>Marcus Vance · VP Operations &amp; Facilities · SIGNED</li>
          <li>{CANON.engineer} · Requesting technician · SIGNED</li>
          <li>Finance Approver · PENDING</li>
        </ul>
      </section>
      <p><PrintButton /></p>
    </main>
  );
}
