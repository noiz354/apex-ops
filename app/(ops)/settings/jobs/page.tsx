'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, apiFetch } from '@/lib/api/client';

type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED_DLQ';
type JobTopic = 'pm_generator' | 'vendor_notification' | 'webhook_fanout' | 'audit_merkle_batch';

interface QueueJob {
  id: string;
  topic: JobTopic;
  organizationId: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

const TOPICS: JobTopic[] = ['pm_generator', 'vendor_notification', 'webhook_fanout', 'audit_merkle_batch'];
const STATUSES: JobStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED_DLQ'];

const statusVariant = (s: JobStatus): 'pass' | 'info' | 'hold' | 'fail' =>
  s === 'COMPLETED' ? 'pass' : s === 'PROCESSING' ? 'info' : s === 'FAILED_DLQ' ? 'fail' : 'hold';

const fmtTs = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
};

const fmtPayload = (p: Record<string, unknown>) => {
  const s = JSON.stringify(p);
  return s.length > 72 ? `${s.slice(0, 69)}…` : s;
};

export default function SettingsJobsPage() {
  const [jobs, setJobs] = useState<QueueJob[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [enqTopic, setEnqTopic] = useState<JobTopic>('pm_generator');
  const [enqPayload, setEnqPayload] = useState('');
  const [enqMax, setEnqMax] = useState('3');

  const errMsg = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : 'Unexpected error — nothing was posted.');

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (topic) qs.set('topic', topic);
    if (status) qs.set('status', status);
    qs.set('limit', '50');
    try {
      const rows = await apiFetch<QueueJob[]>(`/api/queue/jobs?${qs.toString()}`);
      setJobs(rows);
      setListErr(null);
    } catch (e) {
      setListErr(errMsg(e));
    }
  }, [topic, status]);

  useEffect(() => { void load(); }, [load]);

  const runCycle = async () => {
    if (!window.confirm('Run a dispatch cycle over all PENDING jobs? This marks attempts and completes each job in the in-memory queue.')) return;
    setBusy(true);
    setActionErr(null);
    try {
      const summary = await apiFetch<{ processed: number; completed: number; failed: number }>('/api/queue/jobs', {
        method: 'POST',
        body: { action: 'run_cycle' },
      });
      setNote(`Cycle complete — processed ${summary.processed} · completed ${summary.completed} · failed ${summary.failed} (server summary).`);
      await load();
    } catch (e) {
      setActionErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const retry = async (jobId: string) => {
    setBusy(true);
    setActionErr(null);
    try {
      const job = await apiFetch<QueueJob>('/api/queue/jobs', {
        method: 'POST',
        body: { action: 'retry', jobId },
      });
      setNote(`Job ${job.id} reset to PENDING (attempts 0) — retry accepted by server.`);
      await load();
    } catch (e) {
      setActionErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const enqueue = async () => {
    setBusy(true);
    setActionErr(null);
    let payload: Record<string, unknown> = {};
    if (enqPayload.trim()) {
      try {
        payload = JSON.parse(enqPayload) as Record<string, unknown>;
      } catch {
        setBusy(false);
        setActionErr('Payload is not valid JSON — nothing was enqueued.');
        return;
      }
    }
    const maxAttempts = parseInt(enqMax, 10);
    try {
      const job = await apiFetch<QueueJob>('/api/queue/jobs', {
        method: 'POST',
        body: { topic: enqTopic, payload, maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : undefined },
      });
      setNote(`Enqueued ${job.id} (topic ${job.topic} · PENDING) — persisted in the in-memory queue for this session.`);
      setEnqPayload('');
      await load();
    } catch (e) {
      setActionErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const selectCls = 'h-9 px-2 border border-border-strong rounded text-[13px] bg-card';
  const shownCount = useMemo(() => jobs?.length ?? 0, [jobs]);

  return (
    <>
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <Link className="text-muted hover:text-cobalt font-medium" href="/settings">Settings &amp; Configuration</Link>
        <span className="text-muted">/</span>
        <span className="font-semibold">Background Job Queue</span>
      </nav>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="warn">Ephemeral · in-memory store</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Background Job Queue</h1>
            <p className="text-sm text-muted max-w-2xl">
              Live view of the server&apos;s in-memory dispatch queue (<span className="apex-id">pm_generator</span>,{' '}
              <span className="apex-id">vendor_notification</span>, <span className="apex-id">webhook_fanout</span>,{' '}
              <span className="apex-id">audit_merkle_batch</span>). Jobs vanish on server restart — this is an
              on-demand dispatch loop, not a persistent scheduler/cron. Every row below comes from the API.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/settings">
              <Button variant="secondary"><ArrowLeft size={16} /> Back to Settings</Button>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-warn bg-warn-bg p-3 text-[13px] text-warn-ink">
          <strong>Honesty notice:</strong> this queue lives in server memory only — contents are lost on restart,
          and a cycle marks attempts/dispatches without external cron or side effects. Topic names
          (<span className="apex-id">pm_generator</span>, <span className="apex-id">vendor_notification</span>) are
          manual-feed labels only — nothing enqueues or runs them automatically. Run a cycle, retry, or
          enqueue to drive it; counts above the table are whatever the API returned.
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic" className={selectCls}>
            <option value="">All topics</option>
            {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={selectCls}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button variant="secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15} /> Refresh</Button>
          <Button onClick={() => void runCycle()} disabled={busy}><Play size={15} /> Run cycle</Button>
        </div>

        {/* Enqueue */}
        <div className="rounded-lg border border-border-subtle bg-surface p-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-semibold" htmlFor="enq-topic">Enqueue topic</label>
            <select id="enq-topic" value={enqTopic} onChange={(e) => setEnqTopic(e.target.value as JobTopic)} className={selectCls}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5 flex-1 min-w-[220px]">
            <label className="text-xs font-semibold" htmlFor="enq-payload">Payload JSON (optional)</label>
            <Input id="enq-payload" value={enqPayload} onChange={(e) => setEnqPayload(e.target.value)} placeholder='{"ruleId":"PM-…"}' className="apex-id" />
          </div>
          <div className="flex flex-col gap-0.5 w-28">
            <label className="text-xs font-semibold" htmlFor="enq-max">Max attempts</label>
            <Input id="enq-max" inputMode="numeric" value={enqMax} onChange={(e) => setEnqMax(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => void enqueue()} disabled={busy}><Send size={15} /> Enqueue job</Button>
        </div>

        {note && <p className="text-[13px] font-semibold text-pass" role="status">{note}</p>}
        {actionErr && <p className="text-[13px] font-semibold text-fail" role="alert">{actionErr}</p>}
      </section>

      <section className="bg-card border border-border-subtle rounded-lg p-6 flex flex-col gap-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Jobs (server view{topic || status ? ' — filtered' : ''})</h2>
          <span className="text-xs text-muted">
            {jobs === null ? 'Loading…' : `${shownCount} row${shownCount === 1 ? '' : 's'} returned by API`}
          </span>
        </div>

        {listErr && <p className="text-[13px] font-semibold text-fail" role="alert">Failed to load queue: {listErr}</p>}

        <div className="overflow-x-auto rounded-lg border border-border-subtle">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead className="bg-surface text-muted">
              <tr className="border-b border-border-subtle">
                <th className="p-3 font-semibold">Job ID</th>
                <th className="p-3 font-semibold">Topic</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Attempts</th>
                <th className="p-3 font-semibold">Created (UTC)</th>
                <th className="p-3 font-semibold">Completed (UTC)</th>
                <th className="p-3 font-semibold">Payload</th>
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {(jobs ?? []).map((j) => (
                <tr key={j.id} className="hover:bg-surface-subtle">
                  <td className="p-3"><span className="apex-id font-bold text-cobalt">{j.id}</span></td>
                  <td className="p-3"><Badge variant="info">{j.topic}</Badge></td>
                  <td className="p-3">
                    <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                    {j.error && <span className="block text-[11px] text-fail mt-1">{j.error}</span>}
                  </td>
                  <td className="p-3 apex-id">{j.attempts}/{j.maxAttempts}</td>
                  <td className="p-3 apex-id text-muted">{fmtTs(j.createdAt)}</td>
                  <td className="p-3 apex-id text-muted">{fmtTs(j.completedAt)}</td>
                  <td className="p-3 apex-id text-muted">{fmtPayload(j.payload)}</td>
                  <td className="p-3 text-right">
                    {j.status === 'FAILED_DLQ' ? (
                      <Button variant="secondary" onClick={() => void retry(j.id)} disabled={busy} className="h-7 px-2 text-[11px]">
                        <RotateCcw size={13} /> Retry
                      </Button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {jobs !== null && jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted">
                    No jobs match{topic || status ? ' these filters' : ''} — the in-memory queue is empty right now.
                    Enqueue above or run a cycle; nothing here is pre-baked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Queue is tenant-scoped (<span className="apex-id">organizationId</span> per row) and non-persistent by design.
        </p>
      </section>
    </>
  );
}
