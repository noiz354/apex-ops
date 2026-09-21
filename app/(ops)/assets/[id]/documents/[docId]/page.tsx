import Link from 'next/link';
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck, FileCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.assetSeal, docId: 'DOC-OM-CVHE-2024' },
    { id: CANON.assetSeal, docId: 'DOC-WAR-TRN-8891' },
    { id: 'AST-ELEC-002', docId: 'DOC-SCHEM-ELEC-880' },
  ];
}

interface AssetDocRecord {
  docId: string;
  assetCode: string;
  title: string;
  type: 'O&M Manual' | 'Warranty Certificate' | 'Electrical Schematic' | 'Calibration Certificate';
  fileSize: string;
  version: string;
  status: 'ACTIVE_VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'PENDING_UPLOAD';
  uploadedBy: string;
  uploadedAt: string;
  expiryDate: string;
  signedBy: string;
  sha256Checksum: string;
  summary: string;
  linkedWorkOrders: string[];
}

const ASSET_DOCS: Record<string, AssetDocRecord> = {
  'DOC-OM-CVHE-2024': {
    docId: 'DOC-OM-CVHE-2024',
    assetCode: CANON.assetSeal,
    title: 'Trane CenTraVac CVHE-500 Operations & Maintenance Technical Manual',
    type: 'O&M Manual',
    fileSize: '14.8 MB (PDF)',
    version: 'v4.2.1',
    status: 'ACTIVE_VALID',
    uploadedBy: 'Robert Langdon (Trane OEM Resident Engineer)',
    uploadedAt: '12 Mar 2024 14:30 WIB',
    expiryDate: 'Perpetual Document',
    signedBy: 'David Chen (Facilities Engineering Manager)',
    sha256Checksum: '0x88f2190ab049281a',
    summary: 'Comprehensive engineering guide detailing shaft seal disassembly, bearing tolerances, R-134a evacuation pressures, and motor winding maintenance protocols.',
    linkedWorkOrders: [CANON.workOrderSeal, 'WO-2026-0905'],
  },
  'DOC-WAR-TRN-8891': {
    docId: 'DOC-WAR-TRN-8891',
    assetCode: CANON.assetSeal,
    title: 'Trane Care Platinum Compressor & Shell Warranty Certificate',
    type: 'Warranty Certificate',
    fileSize: '2.4 MB (PDF)',
    version: 'v1.0 (Executed)',
    status: 'ACTIVE_VALID',
    uploadedBy: 'Marcus Vance (VP Ops)',
    uploadedAt: '15 Jan 2024 09:00 WIB',
    expiryDate: '31 Dec 2028',
    signedBy: 'Trane Corporate Warranty Underwriter',
    sha256Checksum: '0x44a10e88cf219904',
    summary: 'Full replacement coverage on chiller compressor casing, rotor assembly, and primary condenser tube bundles with $250k single-incident liability ceiling.',
    linkedWorkOrders: [CANON.workOrderSeal],
  },
  'DOC-SCHEM-ELEC-880': {
    docId: 'DOC-SCHEM-ELEC-880',
    assetCode: 'AST-ELEC-002',
    title: '2000kVA Substation Transformer #2 As-Built Wiring & Bushing Diagram',
    type: 'Electrical Schematic',
    fileSize: '8.2 MB (PDF)',
    version: 'v2.0 (As-Built)',
    status: 'ACTIVE_VALID',
    uploadedBy: 'Elena Voronova (SCADA Lead)',
    uploadedAt: '20 May 2024 11:15 WIB',
    expiryDate: 'Perpetual Document',
    signedBy: 'Elena Voronova (Registered Professional Engineer)',
    sha256Checksum: '0x12c884f091ab5531',
    summary: 'Single-line diagram for 13.8kV/480V step-down transformer showing primary bushing connections, neutral grounding resistor, and differential protection relays.',
    linkedWorkOrders: ['WO-2026-0881', 'WO-2026-0907'],
  },
};

function resolveAssetDoc(docId: string, assetCode: string): AssetDocRecord {
  if (ASSET_DOCS[docId]) return ASSET_DOCS[docId];
  return {
    docId,
    assetCode,
    title: `Technical Document Dossier (${docId})`,
    type: 'O&M Manual',
    fileSize: '4.5 MB (PDF)',
    version: 'v1.0',
    status: 'ACTIVE_VALID',
    uploadedBy: 'Facility Engineering Team',
    uploadedAt: '2026-01-10 10:00 WIB',
    expiryDate: 'Perpetual Document',
    signedBy: 'David Chen',
    sha256Checksum: '0xabc123def4567890',
    summary: 'Standard manufacturer technical documentation and equipment specifications.',
    linkedWorkOrders: [],
  };
}

export default async function AssetDocDetailPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const doc = resolveAssetDoc(docId, id);

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/assets">Asset Registry</Link>
        <span className="text-muted">/</span>
        <Link className="text-muted hover:text-cobalt font-medium" href={`/assets/${doc.assetCode}`}>{doc.assetCode}</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">Documents</span>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{doc.docId}</span>
      </nav>

      {/* Hero Header */}
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="pass">VERIFIED ARTIFACT</Badge>
              <Badge variant="info">{doc.type}</Badge>
              <span className="text-xs font-mono text-muted">{doc.version}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">{doc.title}</h1>
            <p className="text-sm text-muted">
              Technical document bound to asset <Link href={`/assets/${doc.assetCode}`} className="text-cobalt font-semibold hover:underline apex-id">{doc.assetCode}</Link>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/assets/${doc.assetCode}`}>
              <Button variant="secondary"><ArrowLeft size={16} /> Back to Asset Dossier</Button>
            </Link>
            <Link href={`/audit-trail?search=${doc.sha256Checksum}`}>
              <Button><ShieldCheck size={16} /> Audit Hash Proof</Button>
            </Link>
          </div>
        </div>

        {/* 4 KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">File Size &amp; Format</span>
            <span className="text-base font-bold text-ink">{doc.fileSize}</span>
            <span className="text-[11px] text-muted">Original Master Copy</span>
          </div>
          <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">Lifecycle Status</span>
            <span className="text-base font-bold text-pass flex items-center gap-1">
              <CheckCircle2 size={16} /> Valid &amp; Active
            </span>
            <span className="text-[11px] text-muted">Expires: {doc.expiryDate}</span>
          </div>
          <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">Signoff Authority</span>
            <span className="text-base font-bold text-ink truncate">{doc.signedBy}</span>
            <span className="text-[11px] text-muted">Digital Key Signoff</span>
          </div>
          <div className="bg-surface p-3 rounded border border-border-subtle flex flex-col gap-0.5">
            <span className="apex-label-caps text-muted">SHA-256 Checksum</span>
            <span className="text-base font-mono font-bold text-cobalt truncate">{doc.sha256Checksum}</span>
            <span className="text-[11px] text-muted">Merkle Tree Anchored</span>
          </div>
        </div>
      </section>

      {/* Grid: Document Metadata & Linked WOs */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-7 bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText size={18} className="text-cobalt" /> Document Abstract &amp; Metadata
            </h2>
            <span className="text-xs text-muted">Uploaded: {doc.uploadedAt}</span>
          </div>

          <p className="text-sm text-ink leading-relaxed bg-surface p-4 rounded-lg border border-border-subtle">
            {doc.summary}
          </p>

          <div className="text-xs flex flex-col gap-2">
            <div className="flex justify-between py-1 border-b border-border-subtle">
              <span className="text-muted">Originating Author / Uploaded By:</span>
              <strong className="text-ink">{doc.uploadedBy}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-border-subtle">
              <span className="text-muted">Cryptographic Proof Reference:</span>
              <span className="font-mono text-cobalt font-semibold">{doc.sha256Checksum}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted">Document Access Rights:</span>
              <span className="text-pass font-semibold">Shift A &amp; Shift B Lead Techs + Vendor Techs</span>
            </div>
          </div>
        </section>

        <section className="xl:col-span-5 bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileCheck size={18} className="text-cobalt" /> Referenced Work Orders
            </h2>
            <span className="text-xs text-muted">{doc.linkedWorkOrders.length} Linked</span>
          </div>

          <ul className="flex flex-col divide-y divide-border-subtle text-xs">
            {doc.linkedWorkOrders.map((wo, idx) => (
              <li key={idx} className="py-2.5 flex items-center justify-between">
                <Link href={`/work-orders/${wo}`} className="apex-id font-bold text-cobalt hover:underline text-sm">
                  {wo}
                </Link>
                <Link href={`/work-orders/${wo}`}>
                  <Button variant="secondary" className="h-7 text-xs">Open WO →</Button>
                </Link>
              </li>
            ))}
            {doc.linkedWorkOrders.length === 0 && (
              <li className="py-4 text-center text-muted">No work orders currently reference this document.</li>
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
