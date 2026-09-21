import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, QrCode } from 'lucide-react';
import { PrintButton } from '@/components/print/PrintButton';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.workOrderSeal },
    { id: 'WO-2026-0881' },
    { id: 'WO-2026-0895' },
    { id: 'WO-2026-0898' },
  ];
}

const CHECKLIST_STEPS = [
  '01. Apply LOTO Padlock #4092 & verify zero electrical/hydraulic potential.',
  '02. Recover refrigerant R-134a to holding cylinder (weigh container).',
  '03. Disassemble mechanical seal casing & clean shaft seating surface.',
  '04. Mount Silicon Carbide Mechanical Seal 2.5" kit & torque to 85 Nm.',
  '05. Perform dry Nitrogen pressure hold test (150 PSI for 30 minutes).',
  '06. Deep vacuum evacuation < 500 microns & recharge refrigerant.',
  '07. Perform post-repair baseline vibration and thermal test run.',
];

const BOM_PARTS = [
  { sku: CANON.sealSku, desc: 'Silicon Carbide Mechanical Seal 2.5" Kit', qty: '1 pc', bin: 'CRIB-B / Bay 01' },
  { sku: 'PART-LUB-09', desc: 'POE Lubricant ISO 68 5-Gal Pail', qty: '1 pc', bin: 'CRIB-B / Bay 01' },
  { sku: 'PART-FLTR-401', desc: 'MERV 14 Chilled Water Filter', qty: '2 pc', bin: 'Locker 4B' },
];

export default async function WorkOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^WO-\d{4}-\d{4}$/.test(id)) notFound();

  return (
    <main className="mx-auto max-w-3xl bg-white text-black p-8 print:p-0 flex flex-col gap-6 font-sans">
      
      <div className="border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-bold px-3 py-2 rounded">
        SAMPLE — reference layout only. Checklist, BOM and history below are static and NOT from the database.
      </div>
      
      <header className="flex items-center justify-between border-b-2 border-black pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase bg-black text-white px-2 py-0.5">
              APEX OPS CMMS
            </span>
            <span className="text-xs font-semibold text-gray-600">FIELD EXECUTION TRAVEL PACK</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">WORK ORDER {id}</h1>
          <p className="text-xs text-gray-700 font-mono">
            Priority 1 Emergency · SLA: 4 Hours · Padang Data Center CUP Campus
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 print:hidden">
          <Link href={`/work-orders/${id}`} className="text-xs font-semibold text-blue-700 flex items-center gap-1">
            <ArrowLeft size={14} /> Back to Work Order
          </Link>
          <PrintButton
            label="Print Travel Pack"
            className="h-8 px-3 rounded bg-black text-white text-xs font-bold flex items-center gap-1.5"
          />
        </div>
      </header>

      {/* Target Asset & Work Summary */}
      <section className="grid grid-cols-2 gap-4 border border-gray-400 p-4 text-xs">
        <div>
          <p className="text-gray-600 font-bold">WORK LOCATION / FACILITY:</p>
          <p className="font-semibold text-sm">Chiller Plant Room B-204</p>
          <p className="text-gray-600 font-bold mt-2">TARGET ASSET:</p>
          <p className="font-semibold font-mono text-sm">{CANON.assetSeal} · Trane Centrifugal Chiller #4</p>
        </div>
        <div>
          <p className="text-gray-600 font-bold">ASSIGNED LEAD TECHNICIAN:</p>
          <p className="font-semibold text-sm">Marcus Kowalski (Shift A Lead)</p>
          <p className="text-gray-600 font-bold mt-2">SAFETY &amp; ISOLATION:</p>
          <p className="font-bold text-red-700 text-sm">LOTO #{CANON.lotoPadlock} · Zero Potential Verified</p>
        </div>
      </section>

      {/* Checklist Protocol */}
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-2">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Field Checklist Steps &amp; Signoff
        </h2>
        <div className="flex flex-col divide-y divide-gray-200">
          {CHECKLIST_STEPS.map((step, idx) => (
            <div key={idx} className="py-2 flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{step}</span>
              </div>
              <div className="border border-gray-300 w-28 h-6 shrink-0 flex items-center justify-center text-[10px] text-gray-400 font-mono">
                Initial: _______
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bill of Materials (BOM) */}
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-2">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Required Parts &amp; Consumables
        </h2>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-gray-600">
              <th className="py-1">SKU</th>
              <th className="py-1">Description</th>
              <th className="py-1">Qty</th>
              <th className="py-1 text-right">Staged Bin Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {BOM_PARTS.map((p) => (
              <tr key={p.sku}>
                <td className="py-1 font-mono font-bold">{p.sku}</td>
                <td className="py-1">{p.desc}</td>
                <td className="py-1 font-mono">{p.qty}</td>
                <td className="py-1 text-right font-mono">{p.bin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Physical Signoff Gate */}
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-4">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Work Completion Signoff Gate
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-300 p-3 h-24 flex flex-col justify-between">
            <span className="text-gray-600 font-bold text-[10px]">EXECUTING TECHNICIAN:</span>
            <div className="font-script text-lg text-blue-900 italic font-serif">Marcus Kowalski</div>
            <span className="border-t border-gray-400 pt-1 text-[10px] text-gray-500 font-mono">Sign Date: 2026-09-16</span>
          </div>
          <div className="border border-gray-300 p-3 h-24 flex flex-col justify-between">
            <span className="text-gray-600 font-bold text-[10px]">SUPERVISOR / QA ACCEPTANCE:</span>
            <div className="font-script text-lg text-blue-900 italic font-serif">David Chen</div>
            <span className="border-t border-gray-400 pt-1 text-[10px] text-gray-500 font-mono">Sign Date: 2026-09-16</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-400 pt-3 text-[10px] text-gray-500 flex justify-between items-center">
        <span>Apex Ops Production Travel Pack · Electronic Audit Permalink: /work-orders/{id}</span>
        <div className="flex items-center gap-1 font-mono">
          <QrCode size={16} /> Scan QR on mobile tablet to sync progress
        </div>
      </footer>
    </main>
  );
}
