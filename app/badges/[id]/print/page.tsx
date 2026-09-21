import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck, QrCode } from 'lucide-react';
import { PrintButton } from '@/components/print/PrintButton';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: 'RFID-9021' },
    { id: 'RFID-7714' },
    { id: 'RFID-4402' },
    { id: 'RFID-1001' },
    { id: 'RFID-2004' },
  ];
}

interface BadgeData {
  badgeId: string;
  name: string;
  title: string;
  role: string;
  dept: string;
  clearance: string;
  exp: string;
  emergencyContact: string;
}

const BADGES: Record<string, BadgeData> = {
  'RFID-9021': {
    badgeId: 'RFID-9021',
    name: 'Marcus Kowalski',
    title: 'HVAC Lead Specialist',
    role: 'Senior Field Tech',
    dept: 'Mechanical Shift A',
    clearance: 'LEVEL 3 · CUP / CHILLER / BMS',
    exp: '31 DEC 2027',
    emergencyContact: '+62-811-555-0199',
  },
  'RFID-7714': {
    badgeId: 'RFID-7714',
    name: CANON.engineer,
    title: 'SCADA & High Voltage Specialist',
    role: 'Senior Field Tech',
    dept: 'HV Substation Crew',
    clearance: 'LEVEL 4 · 20kV SUBSTATION / SCADA WRITE',
    exp: '31 DEC 2027',
    emergencyContact: '+62-812-555-0812',
  },
  'RFID-4402': {
    badgeId: 'RFID-4402',
    name: 'Sarah Al-Mansoor',
    title: 'Fire & Suppression Inspector',
    role: 'Senior Field Tech',
    dept: 'Life Safety & Fire Protection',
    clearance: 'LEVEL 3 · FIRE PUMP / VESDA / FM-200',
    exp: '31 DEC 2027',
    emergencyContact: '+62-813-555-0442',
  },
  'RFID-1001': {
    badgeId: 'RFID-1001',
    name: 'Marcus Vance',
    title: 'VP Operations & Facilities',
    role: 'Enterprise Admin',
    dept: 'Executive Leadership',
    clearance: 'LEVEL 5 · ALL ACCESS / ROOT SECURITY',
    exp: '31 DEC 2028',
    emergencyContact: '+62-811-555-0001',
  },
  'RFID-2004': {
    badgeId: 'RFID-2004',
    name: 'David Chen',
    title: 'Facilities Engineering Manager',
    role: 'Engineering Lead',
    dept: 'Facilities Engineering',
    clearance: 'LEVEL 4 · ALL ZONES / DUAL SIGNOFF',
    exp: '31 DEC 2028',
    emergencyContact: '+62-811-555-0204',
  },
};

function resolveBadge(id: string): BadgeData {
  const upper = id.toUpperCase();
  if (BADGES[upper]) return BADGES[upper];
  return {
    badgeId: upper,
    name: upper.replace(/[^A-Z0-9]/g, ' '),
    title: 'Certified Field Personnel',
    role: 'Senior Field Tech',
    dept: 'Operations Crew',
    clearance: 'LEVEL 2 · STANDARD FACILITY',
    exp: '31 DEC 2027',
    emergencyContact: '+62-811-000-0000',
  };
}

export default async function BadgePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^RFID-[A-Z0-9]{4,8}$/i.test(id)) notFound();

  const b = resolveBadge(id);

  return (
    <main className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white flex flex-col items-center justify-center font-sans">
      
      <div className="w-full max-w-md border-2 border-amber-600 bg-amber-50 text-amber-900 text-xs font-bold px-3 py-2 rounded mb-4">
        SAMPLE — reference layout only. Badge data and QR below are static and NOT from the database.
      </div>
      
      <div className="w-full max-w-md flex items-center justify-between mb-6 print:hidden">
        <Link href="/profile" className="text-xs font-semibold text-blue-700 flex items-center gap-1 hover:underline">
          <ArrowLeft size={14} /> Back to Profile
        </Link>
        <PrintButton
            label="Print ID Card (CR80)"
            className="h-8 px-4 rounded bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow"
          />
      </div>

      
      <div className="flex flex-col md:flex-row gap-6 print:flex-row">
        
        <div className="w-[340px] h-[520px] bg-white border-2 border-black rounded-2xl shadow-xl print:shadow-none p-6 flex flex-col justify-between relative overflow-hidden">
          
          <div className="flex items-center justify-between border-b-2 border-black pb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-black text-white flex items-center justify-center font-black text-xs">
                A
              </span>
              <div>
                <span className="text-xs font-black tracking-widest block leading-none">APEX OPS</span>
                <span className="text-[9px] text-gray-500 font-semibold tracking-wider">FACILITIES CAMPUS</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-gray-200 px-1.5 py-0.5 rounded">
              RFID NFC
            </span>
          </div>

          
          <div className="flex flex-col items-center text-center my-auto">
            <div className="w-28 h-28 rounded-full border-4 border-black bg-gray-100 flex items-center justify-center text-3xl font-black text-gray-800 shadow-inner">
              {b.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <h1 className="text-xl font-black tracking-tight mt-3 text-black leading-tight">
              {b.name}
            </h1>
            <p className="text-xs font-semibold text-gray-700">{b.title}</p>
            <p className="text-[11px] font-mono text-gray-500 mt-0.5">{b.dept}</p>
          </div>

          
          <div className="border-t-2 border-black pt-3 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono font-bold text-sm tracking-wider">{b.badgeId}</span>
              <span className="font-bold text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded">
                {b.clearance.split('·')[0]}
              </span>
            </div>
            
            <div className="h-7 w-full bg-repeating-linear-to-r flex items-center justify-center bg-black/90 rounded text-[9px] text-white font-mono tracking-[4px]">
              *{b.badgeId}*
            </div>
          </div>
        </div>

        
        <div className="w-[340px] h-[520px] bg-white border-2 border-black rounded-2xl shadow-xl print:shadow-none p-6 flex flex-col justify-between text-xs">
          <div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-black text-[11px] uppercase tracking-wider">Security Clearances</span>
              <ShieldCheck size={16} className="text-black" />
            </div>
            <p className="font-mono text-[10px] font-bold text-gray-800 mt-2 bg-gray-100 p-2 rounded">
              {b.clearance}
            </p>
            <div className="mt-3 text-[10px] text-gray-600 flex flex-col gap-1">
              <p>• Mandatory display while within campus security perimeter.</p>
              <p>• Immediate revocation upon expiration or safety violation.</p>
              <p>• If found, return to Facilities Security Desk (Gate 01).</p>
            </div>
          </div>

          
          <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
            <div className="w-16 h-16 bg-white border border-black p-1 flex items-center justify-center shrink-0">
              <QrCode size={52} className="text-black" />
            </div>
            <div className="text-[9px] font-mono">
              <span className="font-bold block text-gray-800">DIGITAL PROOF CERTIFICATE</span>
              <span className="text-gray-500 block truncate">SHA-256: 0x4f128e0019</span>
              <span className="text-gray-500 block mt-1">Scan for biometric gate validation</span>
            </div>
          </div>

          
          <div className="border-t border-gray-300 pt-2 text-[10px] text-gray-500 flex justify-between font-mono">
            <span>EXP: {b.exp}</span>
            <span>SOS: {b.emergencyContact}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
