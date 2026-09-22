'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToasts } from '@/lib/use-toasts';
import { ToastStack } from '@/components/ui/toast-stack';
import { downloadText } from '@/lib/download';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useWindow } from '@/lib/ui/useWindow';
import type { AuditRow, HashChainVerificationResult } from '@/lib/services/audit-service';
import { CANONICAL_FALLBACK_EVENTS, ProcessedEvent, ViewMode, fmtTs, processDbRow, severityOf } from './audit-model';
import { AuditKpiCards } from './AuditKpiCards';
import { AuditHeader } from './AuditHeader';
import { AuditFilterBar } from './AuditFilterBar';
import { AuditFeed } from './AuditFeed';
import { AuditInspector } from './AuditInspector';

export function AuditTrail({
  rows,
  total,
  truncated,
  orgId,
}: {
  rows: AuditRow[];
  total: number;
  truncated: boolean;
  orgId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('All Entities');
  const [action, setAction] = useState('All Actions');
  const [principal, setPrincipal] = useState('All Principals');
  const [scope, setScope] = useState('All Logs');
  const [sev, setSev] = useState('All Levels');
  const [dateFilter, setDateFilter] = useState('All Time');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('diff');
  const [refetching, setRefetching] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  const [expOpen, setExpOpen] = useState(false);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [verifyRootOpen, setVerifyRootOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<HashChainVerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const runVerifyChain = async (open: boolean) => {
    setVerifyRootOpen(open);
    if (!open) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await apiFetch<HashChainVerificationResult>('/api/audit-trail/verify-chain', { method: 'POST' });
      setVerifyResult(res);
    } catch (err) {
      setVerifyResult(null);
      setVerifyError(err instanceof ApiError ? `${err.message} (${err.code})` : 'Verification request failed.');
    } finally {
      setVerifying(false);
    }
  };
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('Suspicious Privilege Escalation');
  const [flagNotes, setFlagNotes] = useState('');

  const { toasts, push, dismiss, defer } = useToasts(6000);
  const searchRef = useRef<HTMLInputElement>(null);

  const allEvents: ProcessedEvent[] = useMemo(() => {
    const fromDb = rows.map(processDbRow);
    const seenIds = new Set(fromDb.map((e) => e.entityId));
    const combined = [...fromDb];
    for (const c of CANONICAL_FALLBACK_EVENTS) {
      if (!seenIds.has(c.entityId)) {
        combined.push(c);
      }
    }
    return combined;
  }, [rows]);

  const [selId, setSelId] = useState<number | null>(allEvents[0]?.id ?? 94812);

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

  
  const entities = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.entityId).filter(Boolean))),
    [allEvents]
  );
  const actions = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.action))).sort(),
    [allEvents]
  );
  const principals = useMemo(
    () => Array.from(new Set(allEvents.map((r) => r.actorName))).sort(),
    [allEvents]
  );

  const filtered = useMemo(() => {
    const inWindow = (iso: string) => {
      if (dateFilter === 'All Time') return true;
      const t = new Date(iso).getTime();
      if (isNaN(t)) return true;
      if (dateFilter === 'Today') {
        const d = new Date();
        return t >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }
      const days = dateFilter === 'Last 7 Days' ? 7 : 30;
      return Date.now() - t <= days * 86400000;
    };
    return allEvents.filter((e) => {
      if (!inWindow(e.ts)) return false;
      if (entity !== 'All Entities' && e.entityId !== entity) return false;
      if (action !== 'All Actions' && e.action !== action) return false;
      if (principal !== 'All Principals' && e.actorName !== principal) return false;
      if (sev !== 'All Levels' && severityOf(e.action) !== sev) return false;
      if (scope !== 'All Logs' && e.entityType !== scope) return false;
      const needle = q.trim().toLowerCase();
      if (
        needle &&
        !`${e.id} ${e.action} ${e.entityId} ${e.actorName} ${e.requestId ?? ''} ${e.description} ${e.hash}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [allEvents, entity, action, principal, sev, scope, q, dateFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const sel = allEvents.find((r) => r.id === selId) ?? shown[0] ?? allEvents[0];

  const feedWin = useWindow(shown, { rowHeight: 150, threshold: 60, initialHeight: 620 });

  const reset = () => {
    setQ('');
    setEntity('All Entities');
    setAction('All Actions');
    setPrincipal('All Principals');
    setScope('All Logs');
    setSev('All Levels');
    setDateFilter('All Time');
    setPage(0);
  };

  const copyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    push(true, 'Hash Entri Disalin', 'Hash chain tercatat-server disalin ke clipboard.');
    defer(() => setCopiedHash(false), 2000);
  };

  const triggerRefetch = () => {
    setRefetching(true);
    router.refresh();
    defer(() => {
      setRefetching(false);
      push(true, 'Feed Dimuat Ulang', 'Baris ledger server terbaru dimuat ke tampilan ini.');
    }, 650);
  };

  const [busyExport, setBusyExport] = useState(false);
  const exportLog = async () => {
    if (busyExport) return;
    setBusyExport(true);
    try {
      if (format === 'csv') {
        const { exportTableCsv } = await import('@/lib/csv-export');
        const table: (string | number)[][] = [
          ['id', 'utc', 'action', 'entity_type', 'entity_id', 'actor', 'severity', 'hash', 'request_id'],
          ...filtered.map((e) => [e.id, fmtTs(e.ts), e.action, e.entityType, e.entityId, e.actorName, severityOf(e.action), e.hash ?? '', e.requestId ?? '']),
        ];
        await exportTableCsv('audit-ledger.csv', table);
      } else {
        downloadFile('audit-ledger.json', JSON.stringify(filtered, null, 2), 'application/json');
      }
      setExpOpen(false);
      push(true, 'Ledger Diekspor', `${filtered.length} event diekspor ke audit-ledger.${format}.`);
    } catch {
      push(false, 'Ekspor gagal', 'Tidak ada file yang diunduh. Periksa koneksi dan coba lagi.');
    } finally {
      setBusyExport(false);
    }
  };

  const downloadEvidence = (e: ProcessedEvent) => {
    const proofDoc = {
      manifest: 'APEX_OPS_EVENT_EVIDENCE_V1',
      tenant_id: orgId,
      event_id: e.id,
      timestamp_utc: fmtTs(e.ts),
      action: e.action,
      entity: {
        type: e.entityType,
        key: e.entityId,
      },
      server_entry_hash: e.hash || null,
      chain_root_digest: verifyResult?.rootHash ?? null,
      chain_verified_at: verifyResult?.verificationTimestamp ?? null,
      chain_status: verifyResult ? (verifyResult.valid ? 'VALID' : `TAMPERED@event#${verifyResult.tamperedEventId}`) : 'NOT_VERIFIED_THIS_SESSION',
      actor_envelope: e.session,
      verification_status: e.hash ? 'HASH_RECORDED' : 'NO_CHAIN_HASH (fallback/demo row)',
      verification_note: 'Unsigned JSON. Verify the full chain server-side via POST /api/audit-trail/verify-chain.',
    };
    downloadFile(
      `audit-evidence-${e.entityId || e.id}.json`,
      JSON.stringify(proofDoc, null, 2),
      'application/json'
    );
    push(true, 'Bukti Event Diunduh', `Bukti JSON unsigned untuk ${e.entityId} disimpan. Verify via Verify Cryptographic Root.`);
  };

  const submitFlag = () => {
    setFlagOpen(false);
    push(false, 'Flag Tidak Dieskalasi', `Event #${sel.id} (${sel.entityId}) hanya dicatat lokal — tidak ada endpoint server untuk eskalasi.`);
  };

  const criticalCount = allEvents.filter((e) => severityOf(e.action) === 'Critical').length;
  const demoCount = allEvents.filter((e) => e.demo).length;
  const scopeCount = (label: string) =>
    label === 'All Logs' ? allEvents.length : allEvents.filter((e) => e.entityType === label).length;
  const scopes = [
    { n: 'All Logs', c: scopeCount('All Logs') },
    { n: 'Work Orders', c: scopeCount('Work Orders') },
    { n: 'Purchasing & POs', c: scopeCount('Purchasing & POs') },
    { n: 'Asset State', c: scopeCount('Asset State') },
    { n: 'Security & Auth', c: scopeCount('Security & Auth') },
    { n: 'Inventory', c: scopeCount('Inventory') },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <AuditHeader
        dateFilter={dateFilter}
        expOpen={expOpen}
        setExpOpen={setExpOpen}
        format={format}
        setFormat={setFormat}
        pdfOpen={pdfOpen}
        setPdfOpen={setPdfOpen}
        verifyRootOpen={verifyRootOpen}
        setVerifyRootOpen={setVerifyRootOpen}
        verifying={verifying}
        verifyResult={verifyResult}
        verifyError={verifyError}
        runVerifyChain={runVerifyChain}
        filtered={filtered}
        total={total}
        orgId={orgId}
        busyExport={busyExport}
        exportLog={exportLog}
      />

      {/* 2. 4 Executive Governance & Telemetry KPI Cards */}
      <AuditKpiCards
        total={total}
        truncated={truncated}
        allEvents={allEvents}
        orgId={orgId}
        criticalCount={criticalCount}
        verifyResult={verifyResult}
        demoCount={demoCount}
      />

      <AuditFilterBar
        q={q}
        setQ={setQ}
        entity={entity}
        setEntity={setEntity}
        action={action}
        setAction={setAction}
        principal={principal}
        setPrincipal={setPrincipal}
        scope={scope}
        setScope={setScope}
        sev={sev}
        setSev={setSev}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        setPage={setPage}
        searchRef={searchRef}
        entities={entities}
        actions={actions}
        principals={principals}
        scopes={scopes}
        reset={reset}
      />

      {/* 4. Tri-Pane Split Area (7/12 Master Feed / 5/12 State Inspector) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <AuditFeed
          pageSize={pageSize}
          setPageSize={setPageSize}
          page={page}
          setPage={setPage}
          refetching={refetching}
          filtered={filtered}
          feedWin={feedWin}
          sel={sel}
          setSelId={setSelId}
          pages={pages}
          shown={shown}
          total={total}
          reset={reset}
          triggerRefetch={triggerRefetch}
        />

        <AuditInspector
          viewMode={viewMode}
          setViewMode={setViewMode}
          copiedHash={copiedHash}
          verifyResult={verifyResult}
          rollbackOpen={rollbackOpen}
          setRollbackOpen={setRollbackOpen}
          flagOpen={flagOpen}
          setFlagOpen={setFlagOpen}
          flagReason={flagReason}
          setFlagReason={setFlagReason}
          flagNotes={flagNotes}
          setFlagNotes={setFlagNotes}
          sel={sel}
          copyHash={copyHash}
          submitFlag={submitFlag}
          downloadEvidence={downloadEvidence}
          push={push}
        />
      </section>

      {/* Floating Toast Notification Container */}
            <ToastStack toasts={toasts} onDismiss={dismiss} className="pointer-events-none [&>div]:pointer-events-auto" />
    </div>
  );
}

const downloadFile = (filename: string, text: string, type: string) => downloadText(filename, text, type);
