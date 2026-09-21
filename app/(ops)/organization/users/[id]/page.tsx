import Link from 'next/link';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CANON } from '@/lib/canon';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  badge: string;
  title: string;
  role: string;
  team: string;
  status: 'Active' | 'On Shift' | 'Expiring Contract' | 'Suspended';
  mfaEnrolled: boolean;
  mfaMethod: string;
  lastLogin: string;
  scimSync: string;
  deployedRules: string[];
  recentSessions: { device: string; ip: string; location: string; activeSince: string }[];
  auditActions: { ts: string; action: string; target: string; status: string }[];
}

const USERS: Record<string, UserRecord> = {
  'm-vance': {
    id: 'm-vance',
    name: 'Marcus Vance',
    email: 'm.vance@apexops.io',
    badge: 'RFID-1001',
    title: 'VP Operations & Facilities',
    role: 'Enterprise Admin',
    team: 'Executive Leadership',
    status: 'Active',
    mfaEnrolled: true,
    mfaMethod: 'FIDO2 Hardware Token (YubiKey 5C NFC)',
    lastLogin: 'Today at 13:52 WIB (Padang Ops Terminal)',
    scimSync: 'Okta Enterprise Directory · Last sync 2m ago',
    deployedRules: [
      'CAPEX-AUTH-64K: $64,200.00 procurement threshold approval',
      'POL-SLA-ESCALATE: Automatic VP dispatch on P1 4-hour SLA breach',
      'LOTO-SAFETY-GATE: Mandatory Lockout/Tagout dual technician signoff'
    ],
    recentSessions: [
      { device: 'macOS Chrome 128 · Padang Ops Headquarter', ip: '103.111.42.18', location: 'Padang, West Sumatra', activeSince: '4 hours ago' },
      { device: 'iOS Safari 17 · Corporate iPhone 15 Pro', ip: '180.252.88.94', location: 'Jakarta HQ', activeSince: 'Yesterday' }
    ],
    auditActions: [
      { ts: '13:52 WIB', action: 'PO_APPROVE', target: 'PO-2026-0298', status: 'SUCCESS' },
      { ts: '11:45 WIB', action: 'RBAC_ROLE_CHANGE', target: 'Marcus Kowalski → Lead', status: 'SUCCESS' },
      { ts: '09:20 WIB', action: 'EXPORT_AUDIT_LOG', target: 'Range 2026-05-18..24', status: 'SUCCESS' }
    ]
  },
  'marcus-kowalski': {
    id: 'marcus-kowalski',
    name: 'Marcus Kowalski',
    email: 'm.kowalski@apexops.io',
    badge: 'RFID-9021',
    title: 'Shift A · HVAC Lead Specialist',
    role: 'Senior Field Tech',
    team: 'HVAC Mech Crew',
    status: 'On Shift',
    mfaEnrolled: true,
    mfaMethod: 'TOTP Authenticator + RFID NFC Badge',
    lastLogin: 'Today at 07:45 WIB (Padang CUP Maintenance Bay)',
    scimSync: 'Active Shift A (07:00 – 19:00 WIB)',
    deployedRules: [
      'HVAC-CUP-OVERRIDE: Emergency chiller isolation bypass protocol',
      'REFRIG-L2-DISCHARGE: R-134a evacuation permit holder'
    ],
    recentSessions: [
      { device: 'Ruggedized Android Tablet (HVC-TAB-04)', ip: '10.240.12.88', location: 'Chiller Plant Room B-204', activeSince: '6 hours ago' }
    ],
    auditActions: [
      { ts: '14:20 WIB', action: 'WO_TRANSITION', target: `${CANON.workOrderSeal} (IN_PROGRESS)`, status: 'SUCCESS' },
      { ts: '13:10 WIB', action: 'PART_DISPENSE', target: 'PART-SEAL-8821 (-1 pc)', status: 'SUCCESS' },
      { ts: '08:30 WIB', action: 'INSPECTION_RUN', target: 'INS-2026-0412 (Chiller #4)', status: 'SUCCESS' }
    ]
  },
  'elena-voronova': {
    id: 'elena-voronova',
    name: CANON.engineer,
    email: 'e.voronova@apexops.io',
    badge: 'RFID-7714',
    title: 'HV Substation · SCADA & High Voltage Specialist',
    role: 'Senior Field Tech',
    team: 'HV Electrical',
    status: 'Active',
    mfaEnrolled: true,
    mfaMethod: 'FIDO2 WebAuthn Token',
    lastLogin: 'Today at 12:15 WIB',
    scimSync: 'Okta Enterprise Directory · Last sync 10m ago',
    deployedRules: [
      'ELEC-HV-SUBSTATION: 20kV Switchgear lockout protocol author',
      'SCADA-TELEMETRY-WRITE: Modbus gateway write privileges'
    ],
    recentSessions: [
      { device: 'Field Workstation (WS-SUB-01)', ip: '10.240.4.15', location: 'Electrical Substation #2', activeSince: '2 hours ago' }
    ],
    auditActions: [
      { ts: '12:40 WIB', action: 'TELEMETRY_CALIBRATE', target: 'AST-ELEC-002 Transformer', status: 'SUCCESS' },
      { ts: '11:05 WIB', action: 'SIGN_PERMIT', target: 'PERMIT-HV-8802', status: 'SUCCESS' }
    ]
  },
  'david-chen': {
    id: 'david-chen',
    name: 'David Chen',
    email: 'd.chen@apexops.io',
    badge: 'RFID-2004',
    title: 'Lead Facilities Engineering Manager',
    role: 'Engineering Lead',
    team: 'Executive Leadership',
    status: 'Active',
    mfaEnrolled: true,
    mfaMethod: 'TOTP Authenticator App',
    lastLogin: 'Today at 10:30 WIB',
    scimSync: 'Okta Enterprise Directory · Last sync 5m ago',
    deployedRules: [
      'CRITICAL-OVERRIDE: Dual signoff authority on emergency dispatches',
      'ASSET-DECOMMISSION: Asset retirement and disposal signoff'
    ],
    recentSessions: [
      { device: 'macOS Workstation · Facilities HQ', ip: '10.240.1.12', location: 'Padang Ops Center', activeSince: '3 hours ago' }
    ],
    auditActions: [
      { ts: '10:45 WIB', action: 'PM_RULE_UPDATE', target: 'PM-CHL-001 (Quarterly)', status: 'SUCCESS' },
      { ts: '09:15 WIB', action: 'WO_DISPATCH', target: 'WO-2026-0895', status: 'SUCCESS' }
    ]
  },
  'sarah-al-mansoor': {
    id: 'sarah-al-mansoor',
    name: 'Sarah Al-Mansoor',
    email: 's.almansoor@apexops.io',
    badge: 'RFID-4402',
    title: 'Life Safety · Fire & Suppression Inspector',
    role: 'Senior Field Tech',
    team: 'Life Safety & Fire',
    status: 'Active',
    mfaEnrolled: true,
    mfaMethod: 'TOTP Authenticator App',
    lastLogin: 'Today at 08:15 WIB',
    scimSync: 'Okta Enterprise Directory · Last sync 15m ago',
    deployedRules: [
      'FIRE-NFPA-INSPECT: NFPA 25 quarterly deluge valve testing',
      'SMOKE-DAMPER-GATE: HVAC auto-damper smoke shutdown bypass'
    ],
    recentSessions: [
      { device: 'Field Tablet (TAB-FIRE-02)', ip: '10.240.18.22', location: 'Fire Pump Room A-01', activeSince: '5 hours ago' }
    ],
    auditActions: [
      { ts: '11:20 WIB', action: 'INSPECTION_SUBMIT', target: 'INS-2026-1092 (Fire Suppression)', status: 'SUCCESS' },
      { ts: '09:00 WIB', action: 'INVENTORY_RECEIVE', target: 'PART-FLTR-401 (+24 pcs)', status: 'SUCCESS' }
    ]
  },
  'robert-langdon': {
    id: 'robert-langdon',
    name: 'Robert Langdon',
    email: 'r.langdon@trane.ext',
    badge: 'VND-TRANE-09',
    title: 'Trane OEM · Resident Field Specialist',
    role: 'Vendor Partner Tech',
    team: 'Vendor Contractors',
    status: 'Expiring Contract',
    mfaEnrolled: true,
    mfaMethod: 'SMS 2FA + Partner Security Passcode',
    lastLogin: 'Yesterday at 16:30 WIB',
    scimSync: 'External Partner Tenant · Escort required on site',
    deployedRules: [
      'VENDOR-TRANE-RO: Read-only access to Trane Chiller telemetries',
      'PARTS-REQUISITION-DRAFT: Requisition draft rights only'
    ],
    recentSessions: [
      { device: 'External Windows Laptop · Trane VPN', ip: '198.51.100.45', location: 'External Network', activeSince: '18 hours ago' }
    ],
    auditActions: [
      { ts: 'Yesterday', action: 'TELEMETRY_READ', target: 'CHILL-NUSA-04 Modbus Gateway', status: 'SUCCESS' },
      { ts: 'Yesterday', action: 'VENDOR_SIGN_MSA', target: CANON.msa, status: 'SUCCESS' }
    ]
  }
};

function resolveUser(id: string): UserRecord {
  const normalized = id.toLowerCase().replace(/[^a-z0-9]/g, '-');
  if (USERS[normalized]) return USERS[normalized];
  for (const key of Object.keys(USERS)) {
    if (USERS[key].email.toLowerCase().includes(id.toLowerCase()) || USERS[key].badge.toLowerCase().includes(id.toLowerCase())) {
      return USERS[key];
    }
  }
  return {
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    email: `${id}@apexops.io`,
    badge: `RFID-${id.slice(0, 4).toUpperCase()}`,
    title: 'Facility Technical Personnel',
    role: 'Senior Field Tech',
    team: 'Facilities Engineering',
    status: 'Active',
    mfaEnrolled: true,
    mfaMethod: 'TOTP Authenticator',
    lastLogin: 'Today at 08:00 WIB',
    scimSync: 'Okta Enterprise Directory',
    deployedRules: ['STANDARD-ACCESS: Basic facility access credentials'],
    recentSessions: [
      { device: 'Enterprise Terminal', ip: '10.240.1.50', location: 'Facility Ops Desk', activeSince: '2 hours ago' }
    ],
    auditActions: [
      { ts: '08:15 WIB', action: 'LOGIN', target: 'Apex Ops CMMS', status: 'SUCCESS' }
    ]
  };
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = resolveUser(id);

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/organization">Organization &amp; RBAC</Link>
        <span className="text-muted">/</span>
        <span className="text-muted">Personnel</span>
        <span className="text-muted">/</span>
        <span className="font-semibold apex-id">{user.name}</span>
      </nav>

      {/* Hero Header */}
      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-cobalt-deep text-white flex items-center justify-center text-xl font-bold shadow-md">
              {user.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={user.status === 'Active' || user.status === 'On Shift' ? 'pass' : user.status === 'Expiring Contract' ? 'warn' : 'fail'}>
                  {user.status}
                </Badge>
                <Badge variant="info">{user.role}</Badge>
                <span className="apex-id text-xs text-muted font-bold">{user.badge}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-1">{user.name}</h1>
              <p className="text-sm text-muted">{user.title} · <span className="text-ink font-medium">{user.team}</span></p>
              <p className="text-xs text-muted apex-id mt-0.5">{user.email} · {user.scimSync}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/organization">
              <Button variant="secondary"><ArrowLeft size={16} /> Back to Roster</Button>
            </Link>
            <Link href={`/audit-trail?actor=${encodeURIComponent(user.name)}`}>
              <Button><ShieldCheck size={16} /> View Audit Dossier</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Grid Content */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column (Security & Credentials) */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Security & Authentication */}
          <section className="bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <KeyRound size={18} className="text-cobalt" /> Security Credentials &amp; MFA Posture
              </h2>
              <Badge variant="pass">MFA ENFORCED</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-surface-subtle p-3 rounded border border-border-subtle">
                <span className="text-muted block font-semibold mb-1">MFA Primary Method</span>
                <span className="font-medium text-sm text-ink flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-pass shrink-0" /> {user.mfaMethod}
                </span>
              </div>
              <div className="bg-surface-subtle p-3 rounded border border-border-subtle">
                <span className="text-muted block font-semibold mb-1">Directory Sync Source</span>
                <span className="font-medium text-sm text-ink">{user.scimSync}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted">Deployed Rules &amp; Delegated Authorities</span>
              <ul className="flex flex-col gap-1.5">
                {user.deployedRules.map((rule, idx) => (
                  <li key={idx} className="text-xs bg-surface p-2.5 rounded border border-border-subtle flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cobalt-deep" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Forensic Audit Log */}
          <section className="bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck size={18} className="text-cobalt" /> Activity &amp; Governance Ledger
              </h2>
              <span className="text-xs text-muted">Recorded in Append-Only Hash Chain</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-subtle text-muted">
                  <tr>
                    <th className="p-2 font-semibold">Time (WIB)</th>
                    <th className="p-2 font-semibold">Action</th>
                    <th className="p-2 font-semibold">Target Entity</th>
                    <th className="p-2 font-semibold text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {user.auditActions.map((act, idx) => (
                    <tr key={idx} className="hover:bg-surface-subtle">
                      <td className="p-2 apex-id font-bold">{act.ts}</td>
                      <td className="p-2 font-semibold">{act.action}</td>
                      <td className="p-2 apex-id text-cobalt">{act.target}</td>
                      <td className="p-2 text-right">
                        <Badge variant="pass">{act.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column (Sessions & Diagnostics) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          <section className="bg-card border border-border-subtle rounded-lg p-5 shadow-card flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock size={18} className="text-cobalt" /> Active Hardware &amp; Sessions
              </h2>
              <Badge variant="pass">ENCRYPTED TLS 1.3</Badge>
            </div>

            <div className="flex flex-col gap-3">
              {user.recentSessions.map((sess, idx) => (
                <div key={idx} className="p-3 rounded border border-border-subtle bg-surface flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-ink">{sess.device}</strong>
                    <span className="text-pass font-bold">Online</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>IP Address: <span className="apex-id">{sess.ip}</span></span>
                    <span>{sess.location}</span>
                  </div>
                  <span className="text-[11px] text-muted">Session active since {sess.activeSince}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border-subtle flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted">Emergency Access Governance</span>
              <p className="text-xs text-muted">
                Admin credentials and high-voltage overrides require two-party authorization. Session tokens expire after 12 hours of inactivity.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
