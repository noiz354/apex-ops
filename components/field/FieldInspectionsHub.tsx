'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';
import { ApiError, apiFetch } from '@/lib/api/client';
import type {
  AuditItem,
  ChecklistStep,
  QueueTab,
  ServerInspection,
} from './fih-model';
import {
  INITIAL_AUDITS,
  INITIAL_STEPS,
  toHubRow,
} from './fih-model';
import { FihHeader } from './FihHeader';
import { FihKpiCards } from './FihKpiCards';
import { FihQueue } from './FihQueue';
import { FihTemplateBuilder } from './FihTemplateBuilder';
import { FihFastNav } from './FihFastNav';
import { FihPreviewDialog } from './FihPreviewDialog';

export function FieldInspectionsHub() {
  const [tab, setTab] = useState<QueueTab>('all');
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('All Facilities');
  const [discipline, setDiscipline] = useState('All');
  const [audits, setAudits] = useState<AuditItem[]>(INITIAL_AUDITS);
  const [live, setLive] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [steps, setSteps] = useState<ChecklistStep[]>(INITIAL_STEPS);
  const { toasts, push, dismiss } = useToasts(6000);
  const [busyExport, setBusyExport] = useState(false);

  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepType, setNewStepType] = useState<ChecklistStep['type']>('Binary P/F');
  const [previewAudit, setPreviewAudit] = useState<AuditItem | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  
  const loadAudits = useCallback(async (silent: boolean) => {
    try {
      const res = await apiFetch<{ rows: ServerInspection[]; total: number }>('/api/inspections');
      if (res.rows.length > 0) setAudits(res.rows.map(toHubRow));
      setLive(true);
      if (!silent) push(true, 'Antrean Dimuat Ulang', `${res.rows.length} inspeksi dari server.`);
    } catch {
      setLive(false);
      push(false, 'Offline', 'Antrean inspeksi dari cadangan demo.');
    }
  }, []);

  useEffect(() => { void loadAudits(true); }, [loadAudits]);


  const handleForceDispatch = async (auditId: string) => {
    if (dispatching) return;
    setDispatching(auditId);
    try {
      const data = await apiFetch<{ number: string; status: string; progressPct: number }>(
        `/api/inspections/${auditId}/force-dispatch`,
        { method: 'POST', body: {} },
      );
      setAudits((prev) =>
        prev.map((a) =>
          a.id === auditId
            ? { ...a, status: 'IN_PROGRESS', progress: data.progressPct, dueText: 'Hari ini 17:00', dueSub: 'didispatch server' }
            : a
        )
      );
      push(true, 'Dispatch Paksa Dijalankan', `Audit ${data.number} naik ke IN_PROGRESS (terkonfirmasi server).`);
    } catch (err) {
      push(false, 'Dispatch Paksa Gagal', err instanceof ApiError ? `${err.message} (${err.code})` : 'Kegagalan dispatch tak dikenal.');
    } finally {
      setDispatching(null);
    }
  };

  const handleSaveDraft = () => {
    push(true, 'Draf Tersimpan', 'Protokol TMPL-HVAC-CHL-02 v2.4 tersimpan sebagai draf lokal.');
  };

  const handlePublishTemplate = () => {
    push(true, 'Protokol Diterbitkan (lokal)', 'Template TMPL-HVAC-CHL-02 v2.4 ditandai terbit — hanya lokal, belum terkirim ke teknisi.');
  };

  const handleAddStep = () => {
    if (!newStepTitle.trim()) return;
    const nextSeq = steps.length + 1;
    const newStep: ChecklistStep = {
      seq: nextSeq,
      title: newStepTitle,
      type: newStepType,
      description: 'Langkah verifikasi wajib yang dikonfigurasi lead engineer.',
      logic: newStepType === 'Binary P/F' ? 'Jika GAGAL: tandai kritis otomatis' : 'Validasi ambang ketat diberlakukan',
    };
    setSteps([...steps, newStep]);
    setNewStepTitle('');
    setAddStepOpen(false);
    push(true, 'Langkah Ditambahkan', `Langkah 0${nextSeq} ditambahkan ke draf protokol.`);
  };

  const filteredAudits = useMemo(() => audits.filter((a) => {
    if (tab === 'today' && !a.dueText.toLowerCase().includes('hari ini') && !a.dueSub.toLowerCase().includes('mnt')) return false;
    if (tab === 'overdue' && a.status !== 'OVERDUE') return false;
    if (tab === 'completed' && a.status !== 'FINDINGS' && a.status !== 'COMPLETED') return false;
    if (zone !== 'Semua Fasilitas' && !a.zone.includes(zone)) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${a.id} ${a.name} ${a.assetId} ${a.assignee} ${a.zone}`.toLowerCase().includes(q)) return false;
    return true;
  }), [audits, tab, zone, search]);

  const exportAuditLog = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      const { exportTableCsv } = await import('@/lib/csv-export');
      const table: (string | number)[][] = [
        ['audit_id', 'name', 'asset', 'zone', 'due', 'assignee', 'status', 'progress'],
        ...filteredAudits.map((a) => [a.id, a.name, a.assetId, a.zone, `${a.dueText} ${a.dueSub}`, a.assignee, a.status, a.progress ?? '']),
      ];
      await exportTableCsv('audit-log.csv', table);
      push(true, 'Log Audit Diekspor', `Manifes CSV dari ${filteredAudits.length} audit terjadwal diunduh.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };


  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* 1. Top Sub-header Context Bar */}
      <FihHeader
        live={live}
        exportAuditLog={exportAuditLog}
        busyExport={busyExport}
        createTemplateOpen={createTemplateOpen}
        setCreateTemplateOpen={setCreateTemplateOpen}
        newTemplateName={newTemplateName}
        setNewTemplateName={setNewTemplateName}
        push={push}
      />

      {/* 2. Top KPI Metric Cards (4 Bento Tiles) */}
      <FihKpiCards />

      {/* 3. Scheduled Inspections & Audit Queue + Template Builder */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <FihQueue
          audits={audits}
          filteredAudits={filteredAudits}
          tab={tab}
          setTab={setTab}
          search={search}
          setSearch={setSearch}
          zone={zone}
          setZone={setZone}
          discipline={discipline}
          setDiscipline={setDiscipline}
          live={live}
          dispatching={dispatching}
          handleForceDispatch={handleForceDispatch}
          loadAudits={loadAudits}
          setPreviewAudit={setPreviewAudit}
          searchInputRef={searchInputRef}
        />
        <FihTemplateBuilder
          steps={steps}
          handleSaveDraft={handleSaveDraft}
          handlePublishTemplate={handlePublishTemplate}
          handleAddStep={handleAddStep}
          addStepOpen={addStepOpen}
          setAddStepOpen={setAddStepOpen}
          newStepTitle={newStepTitle}
          setNewStepTitle={setNewStepTitle}
          newStepType={newStepType}
          setNewStepType={setNewStepType}
        />
      </section>

      {/* 4. Bottom Visual Anchor: Fast Links to Sub-desks */}
      <FihFastNav />

      {/* Preview Audit Dialog */}
      <FihPreviewDialog previewAudit={previewAudit} setPreviewAudit={setPreviewAudit} />
      {/* Floating Toasts */}
            <ToastStack toasts={toasts} onDismiss={dismiss} className="pointer-events-none [&>div]:pointer-events-auto" />
    </div>
  );
}
