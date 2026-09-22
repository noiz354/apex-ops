'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, KeyRound, LoaderCircle, Lock, Pencil, PersonStanding, Plus, ShieldCheck, UserX, X, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/client';

const ROLES6 = ['Enterprise Admin', 'Facility Director', 'Engineering Lead', 'Senior Field Tech', 'Vendor Partner Tech', 'Read-Only Auditor'] as const;

const MODULES: [string, string][] = [
  ['1. Operations Dashboard & Telemetry', 'Real-time SCADA and BMS telemetry feed'],
  ['2. Work Orders (Execute & Close)', 'Full lifecycle dispatch, labor clock, parts tag'],
  ['3. Service Requests & Triage', 'Tenant requests, emergency hotlines, SLA triage'],
  ['4. Preventive Maintenance (PM)', 'Recurrent PM cron jobs, run-hour triggers'],
  ['5. Field Inspections & Checklists', 'Digital round inspection walk, QR scanning'],
  ['6. Findings & Auto-WO Conversion', 'Non-compliance flag escalation into dispatch'],
  ['7. Locations & Spatial Hierarchy', 'Campus BIM, GIS maps, zone tree structures'],
  ['8. Asset Registry & Life Cycle', 'Master equipment serials, warranties, MTBF data'],
  ['9. Inventory & Parts Ledger', 'Warehouse stock bins, serials, valuation'],
  ['10. Stock Movement & Transfers', 'Substation truck checkout, return verification'],
  ['11. Purchase Requests (PR)', 'Materials indent, component requisitions'],
  ['12. POs & Goods Receipts (GRN)', 'Supplier commitments, delivery acceptance'],
  ['13. Vendors & Contractors Hub', 'OEM contract certificates, safety permits, SLAs'],
  ['14. Reports & Business Intelligence', 'Shift uptime, MTBF, MTTR, carbon telemetry'],
  ['15. RBAC Organisasi & Sistem', 'Kebijakan root, skema peran, SAML/SCIM'],
];

const CAPS = ['View', 'Create', 'Update', 'Dispatch', 'Archive', 'Financial Signoff'] as const;

type Cell = 'granted' | 'restricted' | 'locked';

interface Person {
  name: string; title: string; role: string; team: string; status: string;
  line: string; sub: string; focus: string;
  id?: string; email?: string;
}

interface DirectoryUser {
  id: string; email: string; name: string; initials: string; title: string;
  role: string; isActive: boolean; hasMfa: boolean;
}

function toPerson(u: DirectoryUser): Person {
  const dept = (u.title || '').split(' · ')[0];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title || '—',
    role: u.role,
    team: DEPT_TEAM[dept] ?? 'Executive Leadership',
    status: u.isActive ? 'Active' : 'Deactivated',
    line: u.email,
    sub: `MFA ${u.hasMfa ? 'enrolled' : 'not enrolled'} · directory record`,
    focus: u.email,
  };
}

const SEED: Person[] = [
  { name: 'Marcus Vance', title: 'VP Ops', role: 'Enterprise Admin', team: 'Executive Leadership', status: 'Active', line: 'm.vance@apexops.io · Login: 4m ago', sub: 'MFA Active · directory owner', focus: 'm.vance@apexops.io' },
  { name: 'David Chen', title: 'Lead Facilities Engineering Manager', role: 'Engineering Lead', team: 'Executive Leadership', status: 'Active', line: 'd.chen@apexops.io · Login: 18m ago', sub: 'Dual-signoff authority · critical override', focus: 'd.chen@apexops.io' },
  { name: 'Marcus Kowalski', title: 'Shift A · HVAC Lead Specialist', role: 'Senior Field Tech', team: 'HVAC Mech Crew', status: 'On Shift', line: 'Badge: RFID-9021 · 2 Active WOs', sub: `${'WO-2026-0894'} (Chiller #4) · Terminal: HVC-TAB-04`, focus: 'RFID-9021' },
  { name: 'Elena Voronova', title: 'HV Substation · SCADA & High Voltage Specialist', role: 'Senior Field Tech', team: 'HV Electrical', status: 'Active', line: 'RFID-7714 · e.voronova@apexops.io', sub: 'Login: 32m ago · SCADA write scope', focus: 'RFID-7714' },
  { name: 'Sarah Al-Mansoor', title: 'Life Safety · Fire & Suppression Inspector', role: 'Senior Field Tech', team: 'Life Safety & Fire', status: 'Active', line: 'RFID-4402 · s.almansoor@apexops.io', sub: 'Login: 1h ago · suppression cert', focus: 'RFID-4402' },
  { name: 'Robert Langdon', title: 'Trane OEM · Resident Engineer', role: 'Vendor Partner Tech', team: 'Vendor Contractors', status: 'Expiring Contract', line: 'MSA: Exp 31 Dec 2026 · assignment end', sub: 'External Tenant · escort required', focus: 'r.langdon@trane.ext' },
];

const TEAMS = ['Semua Tim', 'HVAC Mech Crew', 'HV Electrical', 'Life Safety & Fire', 'Executive Leadership', 'Vendor Contractors'] as const;
const STATUSES = ['Semua Status', 'Active', 'On Shift / Leave', 'Expiring Contract', 'Deactivated'] as const;
const DEPTS = ['HVAC Mechanical Shift A', 'HV Electrical Substation', 'Life Safety & Protection', 'Facilities Engineering', 'Vendor Partner Tier-1'] as const;
const DEPT_TEAM: Record<string, string> = {
  'HVAC Mechanical Shift A': 'HVAC Mech Crew',
  'HV Electrical Substation': 'HV Electrical',
  'Life Safety & Protection': 'Life Safety & Fire',
  'Facilities Engineering': 'Executive Leadership',
  'Vendor Partner Tier-1': 'Vendor Contractors',
};

const isLocked = (role: string, mod: number, cap: number) =>
  (mod === 14 && role !== 'Enterprise Admin') ||
  (cap === 5 && (role === 'Senior Field Tech' || role === 'Vendor Partner Tech' || role === 'Read-Only Auditor'));

function seedMatrix(role: string): Cell[][] {
  return MODULES.map((_, m) =>
    CAPS.map((_, c) => {
      if (isLocked(role, m, c)) return 'locked';
      if (role === 'Enterprise Admin') return 'granted';
      if (role === 'Read-Only Auditor') return c === 0 ? 'granted' : 'restricted';
      if (role === 'Senior Field Tech') {
        if (m === 0) return c === 0 ? 'granted' : 'restricted';
        if (m === 1) return c === 5 ? 'restricted' : 'granted';
        if (m === 4) return c <= 2 ? 'granted' : 'restricted';
        if (m === 5) return c <= 1 ? 'granted' : 'restricted';
        if (m === 8) return c === 0 || c === 2 ? 'granted' : 'restricted';
        if (m === 6) return c === 0 ? 'granted' : 'restricted';
        return 'restricted';
      }
      return 'restricted';
    })
  );
}

const SEEDED_TEMPLATES = ['Enterprise Admin', 'Senior Field Tech', 'Read-Only Auditor'];

interface Toast { id: number; ok: boolean; title: string; msg: string }
let toastSeq = 1100;


const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function OrgHub() {
  const [people, setPeople] = useState<Person[]>(SEED);
  const [q, setQ] = useState('');
  const [team, setTeam] = useState<string>('All Teams (All)');
  const [roleF, setRoleF] = useState<string>('Semua Peran');
  const [statusF, setStatusF] = useState<string>('Semua Status');
  const [focus, setFocus] = useState('RFID-9021');
  const [role, setRole] = useState<string>('Senior Field Tech');
  const [roles, setRoles] = useState<string[]>([...ROLES6]);
  const [matrix, setMatrix] = useState<Record<string, Cell[][]>>(() => ({
    'Enterprise Admin': seedMatrix('Enterprise Admin'),
    'Senior Field Tech': seedMatrix('Senior Field Tech'),
    'Read-Only Auditor': seedMatrix('Read-Only Auditor'),
  }));
  const [deployed, setDeployed] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<number[]>([]);
  const [provOpen, setProvOpen] = useState(false);
  const [prov, setProv] = useState<{ name: string; email: string; role: string; dept: string; rfid: string }>({ name: '', email: '', role: 'Engineering Lead', dept: DEPTS[0], rfid: '' });
  const [provTouched, setProvTouched] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState('Senior Field Tech');
  const [editDept, setEditDept] = useState<string>(DEPTS[0]);
  const [acting, setActing] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneTouched, setCloneTouched] = useState(false);
  const [ssoOpen, setSsoOpen] = useState(false);
  const [mfaNote, setMfaNote] = useState('');
  const [dirState, setDirState] = useState<'loading' | 'live' | 'demo'>('loading');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiFetch<DirectoryUser[]>('/api/organization/users');
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const mapped = rows.map(toPerson);
        setPeople(mapped);
        setFocus(mapped[0].focus);
        setEditRole(mapped[0].role);
        setDirState('live');
      } catch {
        if (!cancelled) {
          setDirState('demo');
          push(false, 'Direktori tak terjangkau', 'Menampilkan roster demo — mutasi dinonaktifkan sampai direktori termuat.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hot = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', hot);
    return () => document.removeEventListener('keydown', hot);
  }, []);

  const push = (ok: boolean, title: string, msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-2), { id, ok, title, msg }]);
    const timer = window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
    toastTimers.current.push(timer);
  };

  useEffect(() => () => {
    toastTimers.current.forEach((t) => window.clearTimeout(t));
    toastTimers.current = [];
  }, []);

  const grid = matrix[role] ?? seedMatrix(role);
  const counts = grid.flat().reduce((a, c) => ({ ...a, [c]: (a as Record<string, number>)[c] + 1 }), { granted: 0, restricted: 0, locked: 0 } as Record<string, number>);

  const flip = (m: number, c: number) => {
    if (isLocked(role, m, c)) {
      push(false, 'Terkunci sistem', `${MODULES[m][0]} · ${CAPS[c]} — kunci struktural, tidak bisa diubah.`);
      return;
    }
    const g = (matrix[role] ?? seedMatrix(role)).map((row) => [...row]);
    g[m][c] = g[m][c] === 'granted' ? 'restricted' : 'granted';
    setMatrix((x) => ({ ...x, [role]: g }));
  };

  const filtered = people.filter((p) => {
    if (team !== 'All Teams (All)' && p.team !== team) return false;
    if (roleF !== 'All Roles' && p.role !== roleF) return false;
    if (statusF === 'Active' && p.status !== 'Active') return false;
    if (statusF === 'On Shift / Leave' && p.status !== 'On Shift') return false;
    if (statusF === 'Expiring Contract' && p.status !== 'Expiring Contract') return false;
    if (statusF === 'Deactivated' && p.status !== 'Deactivated') return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${p.name} ${p.title} ${p.line} ${p.focus}`.toLowerCase().includes(needle);
  });

  const focusP = people.find((p) => p.focus === focus) ?? people[0];

  const [busyExport, setBusyExport] = useState(false);
  const exportLog = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { buildCsvViaWorker, saveAsViaPickerOrDownload } = await import('@/lib/download');
      const table: (string | number)[][] = [
        ['name', 'title', 'role', 'team', 'status', 'contact'],
        ...filtered.map((p) => [p.name, p.title, p.role, p.team, p.status, p.line]),
      ];
      const csv = await buildCsvViaWorker(table, ',');
      await saveAsViaPickerOrDownload('rbac-audit-log.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'text/csv');
      push(true, 'Ekspor berhasil', `${filtered.length} baris roster → rbac-audit-log.csv.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const failMsg = (e: unknown) => (e instanceof Error ? e.message : 'Permintaan gagal');

  const provision = async () => {
    setProvTouched(true);
    if (!prov.name.trim() || !/.+@.+\..+/.test(prov.email.trim()) || !/^RFID-\d{4}$/.test(prov.rfid.trim())) return;
    setActing(true);
    try {
      const created = await apiFetch<DirectoryUser>('/api/organization/users', {
        method: 'POST',
        body: {
          name: prov.name.trim(),
          email: prov.email.trim().toLowerCase(),
          role: prov.role,
          title: `${prov.dept} · ${prov.role}`,
        },
      });
      const rfidLine = `${prov.rfid.trim()} · ${created.email}`;
      const createdEmail = created.email;
      try {
        const fresh = await apiFetch<DirectoryUser[]>('/api/organization/users');
        const people = fresh.map((u) =>
          u.email === createdEmail ? { ...toPerson(u), line: rfidLine } : toPerson(u),
        );
        setPeople(people);
        setFocus(people.find((p) => p.line === rfidLine)?.focus ?? toPerson(created).focus);
      } catch {
        const np = { ...toPerson(created), line: rfidLine };
        setPeople((p) => [...p, np]);
        setFocus(np.focus);
        push(true, 'Pengguna dibuat', `${np.name} · record direktori dibuat, tetapi refresh roster gagal — menampilkan salinan lokal (badge RFID hanya tampilan lokal).`);
        setProvOpen(false);
        setProv({ name: '', email: '', role: 'Engineering Lead', dept: DEPTS[0], rfid: '' });
        setProvTouched(false);
        return;
      }
      setProvOpen(false);
      setProv({ name: '', email: '', role: 'Engineering Lead', dept: DEPTS[0], rfid: '' });
      setProvTouched(false);
      push(true, 'Pengguna dibuat', `${prov.name.trim()} · ${prov.role} · roster dimuat ulang dari direktori (badge RFID hanya tampilan lokal).`);
    } catch (e) {
      push(false, 'Gagal membuat', `${failMsg(e)} — tidak ada record direktori dibuat.`);
    } finally {
      setActing(false);
    }
  };

  const saveEdit = async () => {
    if (!focusP.id) {
      push(false, 'Ubah ditolak', `${focusP.name} adalah entri roster demo — tidak ada di direktori.`);
      return;
    }
    setActing(true);
    try {
      const updated = await apiFetch<DirectoryUser>(`/api/organization/users/${focusP.id}`, {
        method: 'PATCH',
        body: { role: editRole, title: `${editDept} · ${editRole}` },
      });
      setPeople((ps) => ps.map((p) => (p.focus === focusP.focus ? toPerson(updated) : p)));
      setEditOpen(false);
      push(true, 'Penugasan diperbarui', `${updated.name} → ${updated.role} · record direktori tersimpan.`);
    } catch (e) {
      push(false, 'Ubah gagal', `${failMsg(e)} — record direktori tidak berubah.`);
    } finally {
      setActing(false);
    }
  };

  const setActive = async (active: boolean) => {
    if (!focusP.id) {
      push(false, 'Aksi ditolak', `${focusP.name} adalah entri roster demo — tidak ada di direktori.`);
      return;
    }
    setActing(true);
    try {
      const updated = await apiFetch<DirectoryUser>(`/api/organization/users/${focusP.id}`, {
        method: 'PATCH',
        body: { isActive: active },
      });
      setPeople((ps) => ps.map((p) => (p.focus === focusP.focus ? toPerson(updated) : p)));
      push(
        true,
        active ? 'User reactivated' : 'User deactivated',
        active
          ? `${updated.name} can log in again · audit-chained.`
          : `${updated.email} · login disabled immediately · audit-chained.`,
      );
    } catch (e) {
      push(false, active ? 'Reaktivasi gagal' : 'Deaktivasi gagal', `${failMsg(e)} — record direktori tidak berubah.`);
    } finally {
      setActing(false);
    }
  };

  const resetMfa = async () => {
    if (!focusP.id) {
      push(false, 'Reset ditolak', `${focusP.name} adalah entri roster demo — tidak ada di direktori.`);
      return;
    }
    setActing(true);
    try {
      const res = await apiFetch<{ email: string; mfaEnrolled: boolean; sessionsRevoked: number }>(
        `/api/organization/users/${focusP.id}/reset-mfa`,
        { method: 'POST', body: {} },
      );
      setPeople((ps) => ps.map((p) =>
        (p.focus === focusP.focus ? { ...p, sub: 'MFA not enrolled · re-enroll pending · directory record' } : p),
      ));
      setMfaNote(`Kunci MFA dicabut ${new Date().toLocaleString('id-ID')} · ${res.sessionsRevoked} sesi dicabut · daftar ulang saat login berikutnya.`);
      push(true, 'Kunci MFA dicabut', `${res.email} · ${res.sessionsRevoked} sesi dicabut · wajib daftar ulang saat login berikutnya.`);
    } catch (e) {
      push(false, 'Reset MFA gagal', `${failMsg(e)} — pendaftaran tidak berubah.`);
    } finally {
      setActing(false);
    }
  };

  const deploy = () => {
    const stamp = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
    setDeployed((d) => ({ ...d, [role]: stamp }));
    push(true, 'Rules deployed (demo)', `${role}: ${counts.granted} grants · simulated push, local only — not persisted to a policy backend.`);
  };

  const cloneRole = () => {
    setCloneTouched(true);
    if (!cloneName.trim() || roles.includes(cloneName.trim())) return;
    setRoles((r) => [...r, cloneName.trim()]);
    setMatrix((x) => ({ ...x, [cloneName.trim()]: grid.map((row) => [...row]) }));
    setRole(cloneName.trim());
    setCloneOpen(false);
    setCloneName('');
    setCloneTouched(false);
    push(true, 'Policy cloned', `${cloneName.trim()} drafted from ${role} · deploy to activate.`);
  };

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/">Home</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Organization &amp; RBAC</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card" aria-labelledby="org-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="apex-id text-muted">SCIM v2.4 aktif</p>
            <h1 id="org-h" className="text-2xl font-semibold tracking-tight">Tata Kelola Organisasi &amp; Direktori RBAC</h1>
            <p className="text-[13px] text-muted">Kontrol akses berbasis peran, kebijakan atribut (ABAC), dan sinkronisasi direktori untuk operasi lapangan multi-site.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" onClick={exportLog} disabled={busyExport}>{busyExport ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Ekspor Log Audit</Button>
            <Dialog open={ssoOpen} onOpenChange={setSsoOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><ShieldCheck size={16} /> SSO &amp; Kebijakan Keamanan</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="sso-h">
                <DialogTitle id="sso-h">Single Sign-On &amp; SCIM Configuration</DialogTitle>
                <DialogDescription>Penampil kebijakan read-only — nilai referensi demo. No IdP is connected in this environment (Phase 1b); Penegakan MFA di bawah dilakukan aplikasi ini, bukan oleh IdP.</DialogDescription>
                <ul className="text-[13px] flex flex-col gap-2">
                  <li className="flex justify-between gap-2"><span>Penyedia Identitas · Okta SAML 2.0 / endpoint SCIM API</span><Badge variant="info">RENCANA (belum ada IdP tersambung)</Badge></li>
                  <li className="flex justify-between gap-2"><span>MFA Policy · FIDO2 WebAuthn (passkeys) or TOTP — enforced by this app</span><Badge variant="pass">ENFORCED</Badge></li>
                  <li className="flex justify-between gap-2"><span>Session Timeout · tablets 30 min, desktop 120 min</span><Badge variant="info">30 / 120 MIN (reference)</Badge></li>
                  <li className="flex justify-between gap-2"><span>SCIM Sync · webhook push on create/terminate</span><Badge variant="info">PLANNED (local directory only)</Badge></li>
                </ul>
                <div className="flex justify-end"><Button variant="secondary" onClick={() => setSsoOpen(false)}>Close Policy Viewer</Button></div>
              </DialogContent>
            </Dialog>
            <Dialog open={provOpen} onOpenChange={setProvOpen}>
              <DialogTrigger asChild>
                <Button><Plus size={16} /> Tambah Pengguna</Button>
              </DialogTrigger>
              <DialogContent aria-labelledby="prov-h">
                <DialogTitle id="prov-h">Provision Enterprise User</DialogTitle>
                <DialogDescription>Membuat identitas direktori nyata. SCIM push belum dikonfigurasi.</DialogDescription>
                <label className="text-xs font-semibold" htmlFor="prov-name">Nama lengkap resmi</label>
                <Input id="prov-name" value={prov.name} onChange={(e) => setProv((p) => ({ ...p, name: e.target.value }))} invalid={provTouched && !prov.name.trim()} />
                <label className="text-xs font-semibold" htmlFor="prov-email">Enterprise Work Email</label>
                <Input id="prov-email" value={prov.email} onChange={(e) => setProv((p) => ({ ...p, email: e.target.value }))} invalid={provTouched && !/.+@.+\..+/.test(prov.email.trim())} placeholder="name@apexops.io" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="prov-role">Assigned Role</label>
                    <select id="prov-role" value={prov.role} onChange={(e) => setProv((p) => ({ ...p, role: e.target.value }))} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {roles.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-xs font-semibold" htmlFor="prov-dept">Departemen / Kru</label>
                    <select id="prov-dept" value={prov.dept} onChange={(e) => setProv((p) => ({ ...p, dept: e.target.value }))} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                      {DEPTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <label className="text-xs font-semibold" htmlFor="prov-rfid">RFID Badge / Hardware Credential</label>
                <Input id="prov-rfid" value={prov.rfid} onChange={(e) => setProv((p) => ({ ...p, rfid: e.target.value.toUpperCase() }))} invalid={provTouched && !/^RFID-\d{4}$/.test(prov.rfid.trim())} className="apex-id" placeholder="RFID-0000" />
                {provTouched && (!prov.name.trim() || !/.+@.+\..+/.test(prov.email.trim()) || !/^RFID-\d{4}$/.test(prov.rfid.trim())) && (
                  <p className="text-[11px] font-semibold text-fail">Nama + email kerja valid + badge RFID-NNNN wajib diisi.</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setProvOpen(false)}>Batal</Button>
                  <Button onClick={provision} disabled={acting}>Buat di Direktori</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { l: 'Personel Aktif', v: '148', s: '100% terprovisi · 96 lapangan · 32 eng · 14 proc · 6 admin' },
            { l: 'Peran Terdefinisi', v: String(6), s: 'Matriks RBAC · 15 modul · 74 capability' },
            { l: 'Compliance & MFA', v: '100%', s: 'MFA policy: local demo · Okta SCIM not configured' },
            { l: 'Field Sessions Telemetry', v: '42', s: `Terminal aktif · Shift A (${'07:00–15:30 WIB'})` },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-0.5">
              <span className="apex-label-caps text-muted">{k.l}</span>
              <span className="text-xl font-semibold tabular-nums">{k.v}</span>
              <span className="text-[11px] text-muted">{k.s}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Roster Personel <span className="text-xs font-normal text-muted">{filtered.length} ditampilkan</span> <span className="text-xs font-semibold">{dirState === 'live' ? '· Direktori live' : dirState === 'loading' ? '· Memuat direktori…' : '· Roster demo (offline)'}</span></h2>
              <span className="apex-id text-xs text-muted">Filter live · Ctrl + /</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter nama, badge, email…" aria-label="Filter roster" />
              </div>
              <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter tim" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {TEAMS.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select value={roleF} onChange={(e) => setRoleF(e.target.value)} aria-label="Filter peran" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {['All Roles', ...roles].map((r) => <option key={r}>{r}</option>)}
              </select>
              <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter status" className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <ul className="flex flex-col gap-2">
              {filtered.map((p) => (
                <li key={p.focus}>
                  <button
                    type="button"
                    onClick={() => { setFocus(p.focus); setEditRole(p.role); }}
                    aria-current={focus === p.focus ? 'true' : undefined}
                    className={cn('w-full text-left rounded-lg border bg-card p-3 flex gap-3 items-start', focus === p.focus ? 'border-cobalt-deep' : 'border-border-subtle hover:border-cobalt')}
                  >
                    <span className="w-10 h-10 rounded-full bg-cobalt-deep text-white flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">{initials(p.name)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm">{p.name}</strong>
                        <Badge variant={p.status === 'Active' || p.status === 'On Shift' ? 'pass' : p.status === 'Expiring Contract' ? 'warn' : 'fail'}>{p.status}</Badge>
                      </span>
                      <span className="block text-[13px]">{p.title}</span>
                      <span className="block text-xs text-muted apex-id">{p.line}</span>
                      <span className="block text-xs text-muted">{p.sub}</span>
                      <span className="flex flex-wrap gap-2 mt-1">
                        <span className="apex-id text-[11px] text-cobalt font-bold">{p.role}</span>
                        <span className="text-[11px] text-muted">{p.team}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-sm text-muted p-4 text-center">No roster rows match — clear filters.</li>}
            </ul>
          </div>

          <div className="rounded-lg border-2 border-cobalt-deep bg-surface p-4 flex flex-col gap-3">
            <h2 className="text-base font-semibold">Account Diagnostics &amp; Actions</h2>
            <div className="text-[13px] flex flex-col gap-1">
              <p>Focused User: <strong className="apex-id">{focusP.focus}</strong></p>
              <p className="font-semibold">{focusP.name} · {focusP.title}</p>
              <p>Assigned Role: <strong>{focusP.role}</strong></p>
              <p>Directory Sync: {focusP.id
                ? <span className="text-pass font-semibold">Record direktori (live)</span>
                : <span className="text-warn font-semibold">Entri demo — tidak ada di direktori (aksi ditolak)</span>}</p>
              {mfaNote && <p className="text-xs text-muted">{mfaNote}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary"><Pencil size={15} /> Edit Assignment</Button>
                </DialogTrigger>
                <DialogContent aria-labelledby="edit-h">
                  <DialogTitle id="edit-h">Edit Assignment — {focusP.name}</DialogTitle>
                  <DialogDescription>Peran + departemen disimpan ke record direktori.</DialogDescription>
                  <label className="text-xs font-semibold" htmlFor="edit-role">Assigned Role</label>
                  <select id="edit-role" value={editRole} onChange={(e) => setEditRole(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {roles.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <label className="text-xs font-semibold" htmlFor="edit-dept">Department / Crew</label>
                  <select id="edit-dept" value={editDept} onChange={(e) => setEditDept(e.target.value)} className="h-9 px-2 border border-border-strong rounded text-[13px] bg-card">
                    {DEPTS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button onClick={saveEdit} disabled={acting}>Save Assignment</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <ConfirmDialog title="Reset MFA / Kunci?" description={`${focusP.name} wajib daftar ulang TOTP/FIDO2 saat login berikutnya. Semua sesi live dicabut segera.`} confirmLabel="Cabut Kunci" onConfirm={resetMfa}>
                <Button variant="secondary" disabled={acting}><KeyRound size={15} /> Reset MFA / Key</Button>
              </ConfirmDialog>
              <button
                type="button"
                disabled
                title="Requires a server-issued impersonation session (not available in this build) — disabled rather than simulated"
                className="h-9 px-3 rounded border border-border-subtle text-xs font-bold text-muted cursor-not-allowed inline-flex items-center gap-1"
              >
                <PersonStanding size={15} /> Audit Impersonate (disabled)
              </button>
              <ConfirmDialog title={`${focusP.status === 'Deactivated' ? 'Reaktivasi' : 'Deaktivasi'} ${focusP.name}?`} description={focusP.status === 'Deactivated' ? 'Login diaktifkan lagi untuk akun direktori ini.' : 'Login direktori dimatikan segera. Riwayat roster disimpan untuk audit.'} confirmLabel={focusP.status === 'Deactivated' ? 'Reactivate User' : 'Deactivate User'} onConfirm={() => setActive(focusP.status === 'Deactivated')}>
                <Button variant={focusP.status === 'Deactivated' ? 'secondary' : 'destructive'} disabled={acting}><UserX size={15} /> {focusP.status === 'Deactivated' ? 'Reactivate User' : 'Deactivate User'}</Button>
              </ConfirmDialog>
            </div>
            <Link href={`/organization/users/${focusP.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
              <Button variant="ghost" className="w-full text-xs font-semibold border border-cobalt text-cobalt hover:bg-cobalt-light/10">
                Dossier Keamanan Pengguna &amp; Aturan Diterapkan →
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Permission Matrix by Role <span className="text-xs font-normal text-muted">15 Scopes</span></h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setMatrix((x) => ({ ...x, [role]: seedMatrix(role) })); push(true, 'Matrix reset', `${role} restored to archive seed.`); }}>Reset</Button>
                <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
                  <DialogTrigger asChild>
                    <Button variant="secondary">Klon Kebijakan jadi Peran Baru</Button>
                  </DialogTrigger>
                  <DialogContent aria-labelledby="clone-h">
                    <DialogTitle id="clone-h">Clone Policy as New Role</DialogTitle>
                    <DialogDescription>Menyalin draf {role} saat ini menjadi template baru.</DialogDescription>
                    <label className="text-xs font-semibold" htmlFor="clone-name">New role name (required, unique)</label>
                    <Input id="clone-name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} invalid={cloneTouched && (!cloneName.trim() || roles.includes(cloneName.trim()))} placeholder="e.g. Night Shift Supervisor" />
                    {cloneTouched && (!cloneName.trim() || roles.includes(cloneName.trim())) && (
                      <p className="text-[11px] font-semibold text-fail">Nama peran unik wajib diisi.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => { setCloneOpen(false); setMatrix((x) => ({ ...x, [role]: seedMatrix(role) })); push(true, 'Changes discarded', `${role} draft reverted.`); }}>Discard Changes</Button>
                      <Button onClick={cloneRole}>Clone Role</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button onClick={deploy}>Deploy Rules (simulated)</Button>
              </div>
            </div>
            <p className="text-xs text-muted -mt-2">Select an active role template to review or modify capability policies across facility sub-modules.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Role templates">
              {roles.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r} className={cn('h-8 px-3 rounded text-xs font-semibold border', role === r ? 'bg-cobalt-deep text-white border-cobalt-deep' : 'bg-card border-border-subtle')}>
                  {r}
                </button>
              ))}
            </div>
            {!SEEDED_TEMPLATES.includes(role) && (
              <div className="rounded border border-warn bg-warn-bg/40 p-3 text-[13px] flex flex-wrap items-center gap-2">
                <span>Tidak ada snapshot diterapkan untuk <strong>{role}</strong> — draf default-deny.</span>
                <Button variant="secondary" onClick={() => { setMatrix((x) => ({ ...x, [role]: seedMatrix('Senior Field Tech').map((row, m) => row.map((c, ci) => (isLocked(role, m, ci) ? 'locked' : c))) })); push(true, 'Seed cloned', `${role} drafted from Senior Field Tech baseline.`); }}>
                  Clone from Senior Field Tech
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-[11px] text-muted" aria-label="Legenda">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-pass inline-block" /> Diberikan</span>
              <span className="flex items-center gap-1"><Lock size={12} /> Terkunci Sistem</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-surface-subtle border border-border-strong inline-block" /> Dibatasi</span>
              {deployed[role] && <span className="text-pass font-semibold">Diterapkan {deployed[role]} · {counts.granted} izin live</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-xs min-w-[860px]">
                <thead>
                  <tr className="text-left text-muted border-b border-border-subtle bg-card">
                    <th className="p-2 font-semibold">Matriks Kapabilitas Modul · Peran: {role}</th>
                    {CAPS.map((c) => <th key={c} className="font-semibold text-center">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map(([name, desc], m) => (
                    <tr key={name} className="border-b border-surface-subtle">
                      <td className="p-2"><p className="font-semibold text-[13px]">{name}</p><p className="text-muted">{desc}</p></td>
                      {CAPS.map((c, ci) => {
                        const cell = grid[m][ci];
                        return (
                          <td key={c} className="text-center">
                            <button
                              type="button"
                              onClick={() => flip(m, ci)}
                              aria-label={`${name} ${c}: ${cell}`}
                              title={`${name} · ${c}: ${cell}`}
                              className={cn(
                                'w-8 h-8 rounded border text-sm font-bold',
                                cell === 'granted' && 'bg-pass-bg border-pass text-pass-ink',
                                cell === 'restricted' && 'bg-card border-border-subtle text-muted',
                                cell === 'locked' && 'bg-surface-subtle border-border-strong text-muted cursor-not-allowed'
                              )}
                            >
                              {cell === 'granted' ? '✓' : cell === 'locked' ? <Lock size={13} className="mx-auto" /> : '–'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2">
            <h2 className="text-base font-semibold">Simulator Akses Efektif</h2>
            <p className="apex-id text-xs text-pass font-bold -mt-1">Kebijakan ABAC aktif</p>
            <p className="apex-label-caps text-muted">Izin terhitung</p>
            <p className="text-[13px]">Dapat membuat, mengeksekusi, dan mendispatch Work Order; dapat menyelesaikan Inspeksi Lapangan dan mendaftarkan temuan keselamatan; dapat memakai spare parts from inventory.</p>
            <p className="text-[13px]"><strong>$500.00</strong> per work order tanpa otorisasi manajer; akses read-only ke blueprint spasial GIS/BIM.</p>
            <p className="text-[13px]"><strong className="text-fail">Dilarang keras</strong> merilis finansial procurement final, menyetujui kontrak vendor, dan administrasi pengguna.</p>
            <div className="rounded border border-border-subtle bg-card p-2 text-[13px]">
              <p className="apex-label-caps text-muted">Geofence / Lokasi</p>
              <p className="font-semibold">Kampus HQ Nusantara · East Wing &amp; Substation</p>
            </div>
            <div className="rounded border border-border-subtle bg-card p-2 text-[13px]">
              <p className="apex-label-caps text-muted">Jendela Shift</p>
              <p className="font-semibold">Shift A ({'07:00–15:30 WIB'}) <span className="text-[10px] font-normal text-muted">C16 — kartu 06:00–22:00 tetap</span></p>
              <p className="text-xs text-muted">Kunci di luar jam aktif</p>
            </div>
            <div className="rounded border border-border-subtle bg-card p-2 text-[13px]">
              <p className="apex-label-caps text-muted">Override Kritis</p>
              <p className="font-semibold">Butuh Dual Signoff · PIN Engineering Lead wajib</p>
            </div>
            <p className="text-[13px]" role="status">Draf saat ini ({role}): <strong className="text-pass">{counts.granted} diberikan</strong> · <strong>{counts.locked} terkunci</strong> · <strong className="text-muted">{counts.restricted} dibatasi</strong></p>
          </div>
        </div>
      </section>

      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-full max-w-sm" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.ok ? 'status' : 'alert'} className={cn('rounded-lg shadow-modal p-4 flex gap-3 items-start', t.ok ? 'bg-pass-bg border border-pass text-pass-ink' : 'bg-fail-bg border border-fail text-fail-ink')}>
            {t.ok ? <CheckCircle2 size={20} className="shrink-0" /> : <XCircle size={20} className="shrink-0" />}
            <div className="flex-1"><p className="text-sm font-bold">{t.title}</p><p className="text-xs">{t.msg}</p></div>
            <button type="button" aria-label="Tutup notifikasi" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
