export type QueueTab = 'all' | 'today' | 'overdue' | 'completed' | 'templates';

export interface AuditItem {
  id: string;
  name: string;
  assetId: string;
  zone: string;
  dueText: string;
  dueSub: string;
  assignee: string;
  assigneeRole: string;
  assigneeInitials: string;
  status: 'IN_PROGRESS' | 'OVERDUE' | 'SCHEDULED' | 'FINDINGS' | 'READY' | 'COMPLETED';
  progress?: number;
  findingsCount?: number;
}

export interface ServerInspection {
  number: string;
  title: string;
  auditorName: string;
  progressPct: number;
  status: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function toHubRow(r: ServerInspection): AuditItem {
  const st = r.status.toUpperCase();
  const status: AuditItem['status'] =
    st === 'IN_PROGRESS' ? 'IN_PROGRESS'
    : st === 'OVERDUE' ? 'OVERDUE'
    : st === 'COMPLETED' ? 'COMPLETED'
    : 'SCHEDULED';
  return {
    id: r.number,
    name: r.title,
    assetId: '—',
    zone: 'Data server',
    dueText: status === 'COMPLETED' ? 'Selesai' : status === 'OVERDUE' ? 'Terlambat' : status === 'IN_PROGRESS' ? 'Hari ini' : 'Terjadwal',
    dueSub: `progres ${r.progressPct}%`,
    assignee: r.auditorName,
    assigneeRole: 'Teknisi Lapangan',
    assigneeInitials: initialsOf(r.auditorName),
    status,
    progress: r.progressPct,
  };
}

export const INITIAL_AUDITS: AuditItem[] = [
  {
    id: 'INS-2026-0412',
    name: 'Audit Keselamatan & Tekanan Chiller Plant Pra-Shift',
    assetId: 'AST-HVAC-004',
    zone: 'Basement Mech Room B-204',
    dueText: 'Hari ini 16:00',
    dueSub: '45 mnt lagi',
    assignee: 'M. Kowalski',
    assigneeRole: 'Lead Teknisi',
    assigneeInitials: 'MK',
    status: 'IN_PROGRESS',
    progress: 65,
  },
  {
    id: 'INS-2026-0409',
    name: 'Uji Jalan Sistem BBM & Baterai Genset Darurat',
    assetId: 'AST-GEN-01',
    zone: 'Sub-Basement Vault',
    dueText: 'Terlambat',
    dueSub: 'Terlambat 3 jam lalu',
    assignee: 'T. Chen',
    assigneeRole: 'Magang',
    assigneeInitials: 'TC',
    status: 'OVERDUE',
  },
  {
    id: 'INS-2026-0415',
    name: 'Filter HEPA & Tekanan Diferensial Cleanroom ISO Kelas 5',
    assetId: 'AST-ENV-108',
    zone: 'Clean Lab Annex 4',
    dueText: 'Besok 08:30',
    dueSub: 'Shift 1 Standar',
    assignee: 'E. Rostova',
    assigneeRole: 'Fasilitas Bio',
    assigneeInitials: 'ER',
    status: 'SCHEDULED',
  },
  {
    id: 'INS-2026-0398',
    name: 'Termografi Inframerah Switchgear HV Gardu',
    assetId: 'AST-ELEC-01',
    zone: 'Grid Substation Yard',
    dueText: 'Selesai',
    dueSub: 'Hari ini 10:15 UTC',
    assignee: 'M. Kowalski',
    assigneeRole: 'Inspektur PE',
    assigneeInitials: 'MK',
    status: 'FINDINGS',
    findingsCount: 2,
  },
  {
    id: 'INS-2026-0420',
    name: 'Audit Berat Tabung & Aktuator FM-200 Pemadam Kebakaran',
    assetId: 'ZONE-DC-04',
    zone: 'Raised Floor Data Center',
    dueText: 'Terjadwal',
    dueSub: '18 Feb, 09:00',
    assignee: 'R. Davies',
    assigneeRole: 'PE Pemerintah',
    assigneeInitials: 'RD',
    status: 'READY',
  },
];

export interface ChecklistStep {
  seq: number;
  title: string;
  type: 'Binary P/F' | 'Numeric Bound' | 'Mandatory Media' | 'IoT Auto-Populate';
  description: string;
  logic: string;
  val?: string;
  min?: number;
  max?: number;
  unit?: string;
  shotReq?: number;
  iotChannel?: string;
}

export const INITIAL_STEPS: ChecklistStep[] = [
  {
    seq: 1,
    title: 'Integritas Guard Emergency Stop & Kunci LOTO',
    type: 'Binary P/F',
    description: 'Verifikasi saklar trip mekanis, gembok, dan label lock-out tag-out energi berbahaya masih utuh.',
    logic: 'Jika GAGAL: tandai kritis otomatis & foto hazard wajib',
  },
  {
    seq: 2,
    title: 'Pembacaan Tekanan Hisap Kompresor',
    type: 'Numeric Bound',
    description: 'Pembacaan tekanan hisap manifold gauge saat berjalan pada modulasi 100%.',
    logic: 'Di luar batas memicu pembuatan WO otomatis',
    min: 110,
    max: 130,
    unit: 'PSI',
    val: '122.0',
  },
  {
    seq: 3,
    title: 'Cek Gelembung Sight Glass & Indikator Kelembapan',
    type: 'Mandatory Media',
    description: 'Periksa sight glass jalur cairan. Pastikan hanya cairan (tanpa gelembung) dan indikator kering.',
    logic: 'Geotag GPS & stempel waktu teknisi',
    shotReq: 1,
  },
  {
    seq: 4,
    title: 'Jam Operasi & Pembacaan Delta-T',
    type: 'IoT Auto-Populate',
    description: 'Telemetri aset AST-HVAC-004 (demo)',
    logic: 'Terlampir otomatis via tautan gateway',
    iotChannel: 'Kanal Modbus 40112 (Delta-T Air Dingin)',
    val: 'ΔT = 9.8°F',
  },
];
