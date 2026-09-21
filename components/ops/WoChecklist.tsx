'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api/client';
import type { EvidenceRow, WoTaskRow } from '@/lib/services/task-service';

const NEXT: Record<string, 'IN_PROGRESS' | 'DONE' | null> = {
  PENDING: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: null,
  LOCKED: null,
};

const TONE: Record<WoTaskRow['status'], 'pass' | 'warn' | 'hold' | 'info'> = {
  DONE: 'pass',
  IN_PROGRESS: 'warn',
  PENDING: 'hold',
  LOCKED: 'hold',
};

export function WoChecklist({
  number,
  initialTasks,
  enabled,
  evidence = [],
}: {
  number: string;
  initialTasks: WoTaskRow[];
  enabled: boolean;
  evidence?: EvidenceRow[];
}) {
  const [tasks, setTasks] = useState<WoTaskRow[]>(initialTasks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPhoto, setNewPhoto] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  const addStep = async () => {
    if (newTitle.trim().length < 3 || addBusy) return;
    setAddBusy(true);
    setError(null);
    try {
      const created = await apiFetch<WoTaskRow>(`/api/work-orders/${number}/tasks`, {
        method: 'POST',
        body: { action: 'add', title: newTitle.trim(), requiresPhoto: newPhoto },
      });
      setTasks((ts) => [...ts, created]);
      setNewTitle('');
      setNewPhoto(false);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add step failed — checklist unchanged.');
    } finally {
      setAddBusy(false);
    }
  };

  if (tasks.length === 0 && !adding) {
    return (
      <div>
        <p className="text-[13px] text-muted" role="status">
          No execution tasks recorded for this work order.
        </p>
        {enabled && (
          <Button variant="secondary" className="mt-2 text-xs" onClick={() => setAdding(true)}>
            + Add first step
          </Button>
        )}
        {error && (
          <p className="mt-1 text-[12px] font-semibold text-fail bg-fail-bg rounded px-2 py-1" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const advance = async (task: WoTaskRow) => {
    const next = NEXT[task.status];
    if (!next || !enabled) return;
    setBusyId(task.id);
    setError(null);
    try {
      const updated = await apiFetch<WoTaskRow>(`/api/work-orders/${number}/tasks`, {
        method: 'POST',
        body: { taskId: task.id, status: next },
      });
      setTasks((ts) =>
        ts.map((t) => {
          if (t.id === task.id) return updated;
          if (next === 'DONE' && t.stepOrder === task.stepOrder + 1 && t.status === 'LOCKED') {
            return { ...t, status: 'PENDING' as const };
          }
          return t;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Task update failed — checklist unchanged.');
    } finally {
      setBusyId(null);
    }
  };

  const done = tasks.filter((t) => t.status === 'DONE').length;

  return (
    <div>
      <p className="text-[11px] text-muted" role="status">
        {done} / {tasks.length} Complete · live execution records
      </p>
      {error && (
        <p className="mt-1 text-[12px] font-semibold text-fail bg-fail-bg rounded px-2 py-1" role="alert">
          {error}
        </p>
      )}
      {adding && (
        <div className="mt-2 mb-2 rounded-lg border border-border-subtle bg-surface p-3 flex flex-col gap-2" aria-label="Add step form">
          <input
            id={`wo-task-title-${number}`}
            name="taskTitle"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Step title (3–160 chars)"
            aria-label="Step title"
            className="h-9 px-3 bg-card border border-border-strong rounded text-[13px] outline-none focus:border-cobalt"
            maxLength={160}
          />
          <label className="flex items-center gap-2 text-[12px] text-muted">
            <input
              id={`wo-task-photo-${number}`}
              name="taskRequiresPhoto"
              type="checkbox"
              checked={newPhoto}
              onChange={(e) => setNewPhoto(e.target.checked)}
              className="accent-cobalt"
            />
            Photo evidence required before this step can be completed
          </label>
          <div className="flex gap-2">
            <Button
              className="text-xs px-3 py-1.5 min-h-[36px]"
              disabled={addBusy || newTitle.trim().length < 3}
              onClick={() => void addStep()}
            >
              {addBusy ? '…' : 'Save step'}
            </Button>
            <Button variant="secondary" className="text-xs px-3 py-1.5 min-h-[36px]" disabled={addBusy} onClick={() => { setAdding(false); setNewTitle(''); setNewPhoto(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <ol className="flex flex-col divide-y divide-surface-subtle mt-1 text-[13px]">
        {tasks.map((t) => {
          const next = NEXT[t.status];
          return (
            <li key={t.id} className="py-2 flex items-center justify-between gap-2">
              <span className={t.status === 'LOCKED' ? 'text-muted' : undefined}>
                {String(t.stepOrder).padStart(2, '0')}. {t.title}
                {t.requiresPhoto && <span className="text-muted"> · photo required</span>}
                {t.status === 'DONE' && t.verifiedBy && (
                  <span className="block text-[11px] text-muted">
                    verified by {t.verifiedBy}
                    {t.verifiedAt ? ` · ${new Date(t.verifiedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` : ''}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Badge variant={TONE[t.status]}>{t.status.replace('_', ' ')}</Badge>
                {next && (
                  <Button
                    variant="secondary"
                    className="text-xs px-2 py-1 min-h-[36px]"
                    disabled={!enabled || busyId === t.id}
                    onClick={() => void advance(t)}
                  >
                    {busyId === t.id ? '…' : next === 'DONE' ? 'Mark done' : 'Start'}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {/* SDD T3-2 — fillable checklist for generic dossiers (server-persisted). */}
      {enabled && !adding && (
        <Button variant="secondary" className="mt-2 text-xs" onClick={() => setAdding(true)}>
          + Add step
        </Button>
      )}
      {/* GAP-13/F6 — persisted evidence served behind session auth (download route). */}
      <div className="mt-3 pt-2 border-t border-border-subtle" aria-label="Attached evidence">
        <p className="text-[11px] font-semibold text-muted">
          Evidence · {evidence.length === 0 ? 'none attached' : `${evidence.length} file${evidence.length === 1 ? '' : 's'} (server-stored, integrity-verified)`}
        </p>
        {evidence.length > 0 && (
          <ul className="mt-1 flex flex-col gap-2">
            {evidence.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 text-[12px]">
                <a
                  href={`/api/work-orders/${encodeURIComponent(number)}/evidence/${encodeURIComponent(ev.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/* NOTE: plain <img> is intentional — evidence URLs are
                      authenticated API routes (next/image cannot attach
                      session cookies to its optimizer requests). */}
                  <img
                    src={`/api/work-orders/${encodeURIComponent(number)}/evidence/${encodeURIComponent(ev.id)}`}
                    alt={`Evidence ${ev.fileName}`}
                    className="h-12 w-12 rounded border border-border-subtle object-cover bg-surface-subtle"
                    loading="lazy"
                  />
                </a>
                <span className="min-w-0 flex-1">
                  <a
                    href={`/api/work-orders/${encodeURIComponent(number)}/evidence/${encodeURIComponent(ev.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-cobalt hover:underline break-all"
                  >
                    {ev.fileName}
                  </a>
                  <span className="block text-[11px] text-muted apex-id">
                    {(ev.fileSize / 1024).toFixed(1)} KB · sha256:{ev.sha256Hash.slice(0, 12)}… · {ev.uploadedBy}
                    {ev.taskId ? ` · task ${ev.taskId}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
