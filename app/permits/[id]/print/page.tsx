import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PrintButton } from '@/components/print/PrintButton';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: 'PTW-2026-0814' },
    { id: 'PTW-2026-0801' },
    { id: 'PTW-2026-0792' },
  ];
}

export default async function PermitPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^PTW-\d{4}-\d{4}$/.test(id)) notFound();

  return (
    <main className="mx-auto max-w-3xl bg-white text-black p-8 print:p-0 flex flex-col gap-6 font-sans">
      
      <div className="border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-bold px-3 py-2 rounded">
        SAMPLE — reference layout only. Room, asset, LOTO and signatures below are static and NOT from the database.
      </div>
      
      <header className="flex items-center justify-between border-b-2 border-black pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-widest uppercase bg-black text-white px-2 py-0.5">
              APEX OPS SAFETY
            </span>
            <span className="text-xs font-semibold text-gray-600">FORM SAF-04A · OSHA / K3 COMPLIANT</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">PERMIT TO WORK (PTW)</h1>
          <p className="text-xs text-gray-700 font-mono">Permit ID: {id} · Valid for Shift A &amp; B only</p>
        </div>
        <div className="flex flex-col items-end gap-2 print:hidden">
          <Link href="/work-orders" className="text-xs font-semibold text-blue-700 flex items-center gap-1">
            <ArrowLeft size={14} /> Back to Operations
          </Link>
          <PrintButton
            label="Print Permit"
            className="h-8 px-3 rounded bg-black text-white text-xs font-bold flex items-center gap-1.5"
          />
        </div>
      </header>

      
      <section className="grid grid-cols-2 gap-4 border border-gray-400 p-4 text-xs">
        <div>
          <p className="text-gray-600 font-bold">WORK LOCATION / FACILITY:</p>
          <p className="font-semibold text-sm">Chiller Plant Room B-204 (Padang Campus)</p>
          <p className="text-gray-600 font-bold mt-2">LINKED ASSET &amp; CODE:</p>
          <p className="font-semibold font-mono text-sm">{CANON.assetSeal} · Trane Centrifugal Chiller #4</p>
        </div>
        <div>
          <p className="text-gray-600 font-bold">LINKED WORK ORDER:</p>
          <p className="font-semibold font-mono text-sm">{CANON.workOrderSeal}</p>
          <p className="text-gray-600 font-bold mt-2">PERMIT CLASSIFICATION:</p>
          <p className="font-bold text-red-700 text-sm">LEVEL 1 HOT WORK &amp; HIGH PRESSURE HAZARD</p>
        </div>
      </section>

      
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-2">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Lockout / Tagout (LOTO) Padlock Isolation Log
        </h2>
        <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
          <div>
            <span className="text-gray-600 block">LOTO Padlock No:</span>
            <strong className="text-sm">{CANON.lotoPadlock}</strong>
          </div>
          <div>
            <span className="text-gray-600 block">Isolation Point:</span>
            <strong>MCC-CUP-BKR-04 (Main 480V Breaker)</strong>
          </div>
          <div>
            <span className="text-gray-600 block">Zero-Energy Check:</span>
            <strong className="text-green-700">VERIFIED (0.00V Multi-meter)</strong>
          </div>
        </div>
      </section>

      
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-2">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Mandatory Safety Checklist Verification
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Dual Padlocks Applied (Padlock #{CANON.lotoPadlock})</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Refrigerant R-134a Recovered to Holding Tank</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Sniff Detector Calibration (&lt; 5 ppm verified)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Full PPE Worn: Arc Flash Shield, Nitrile &amp; Safety Boots</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Fire Extinguisher Station (CO2 20lb) Positioned &lt; 5m</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="w-4 h-4" />
            <span>Emergency Exhaust Ventilation Active (Zone B-2)</span>
          </label>
        </div>
      </section>

      
      <section className="border border-gray-400 p-4 text-xs flex flex-col gap-4">
        <h2 className="font-black text-sm uppercase tracking-wider border-b border-gray-300 pb-1">
          Tri-Party Physical Signoff &amp; Authorization
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-gray-300 p-3 h-24 flex flex-col justify-between">
            <span className="text-gray-600 font-bold text-[10px]">LEAD TECHNICIAN:</span>
            <div className="font-script text-lg text-blue-900 italic font-serif">Marcus Kowalski</div>
            <span className="border-t border-gray-400 pt-1 text-[10px] text-gray-500 font-mono">Date: 2026-09-16 07:15 WIB</span>
          </div>
          <div className="border border-gray-300 p-3 h-24 flex flex-col justify-between">
            <span className="text-gray-600 font-bold text-[10px]">FACILITIES SAFETY OFFICER:</span>
            <div className="font-script text-lg text-blue-900 italic font-serif">Sarah Al-Mansoor</div>
            <span className="border-t border-gray-400 pt-1 text-[10px] text-gray-500 font-mono">Date: 2026-09-16 07:22 WIB</span>
          </div>
          <div className="border border-gray-300 p-3 h-24 flex flex-col justify-between">
            <span className="text-gray-600 font-bold text-[10px]">FACILITIES DIRECTOR / MANAGER:</span>
            <div className="font-script text-lg text-blue-900 italic font-serif">David Chen</div>
            <span className="border-t border-gray-400 pt-1 text-[10px] text-gray-500 font-mono">Date: 2026-09-16 07:30 WIB</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-400 pt-3 text-[10px] text-gray-500 flex justify-between">
        <span>Apex Ops Physical Safety Artifact · Cryptographic Hash: 0x9e88fa2b104c</span>
        <span>Original copy must be pinned at LOTO lockbox station.</span>
      </footer>
    </main>
  );
}
