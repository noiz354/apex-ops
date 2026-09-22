'use client';

import * as React from 'react';
import type { WindowSlice } from '@/lib/ui/useWindow';
import { ArrowRight, History, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtTs, severityOf, entityHref, ProcessedEvent } from './audit-model';

export function AuditFeed({
  pageSize,
  setPageSize,
  page,
  setPage,
  refetching,
  filtered,
  feedWin,
  sel,
  setSelId,
  pages,
  shown,
  total,
  reset,
  triggerRefetch,
}: {
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  refetching: boolean;
  filtered: ProcessedEvent[];
  feedWin: WindowSlice<ProcessedEvent>;
  sel: ProcessedEvent;
  setSelId: React.Dispatch<React.SetStateAction<number | null>>;
  pages: number;
  shown: ProcessedEvent[];
  total: number;
  reset: () => void;
  triggerRefetch: () => void;
}) {
  return (
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="bg-card rounded-xl border border-border-subtle shadow-card overflow-hidden">
            {/* Feed Top Controls */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted hidden sm:inline">
                  Server snapshot at page load — refresh re-fetches
                </span>
                <h2 className="text-sm font-semibold text-ink">Activity Stream</h2>
                <span className="text-xs font-mono text-muted">
                  ({shown.length} events in view)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={triggerRefetch}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border-subtle bg-card hover:bg-surface text-body transition-colors"
                  title="Paksa Muat Ulang"
                >
                  <RefreshCw size={13} className={cn(refetching && 'animate-spin')} />
                </button>
              </div>
            </div>

            {/* Event List — windowed saat besar (TASK-21) */}
            <div
              ref={feedWin.containerRef as React.RefObject<HTMLDivElement>}
              onScroll={feedWin.onScroll}
              className="divide-y divide-border-subtle flex flex-col overflow-y-auto max-h-[640px]"
              role="feed"
              aria-label="Feed audit"
            >
              {feedWin.topPad > 0 && <div style={{ height: feedWin.topPad }} aria-hidden="true" />}
              {feedWin.items.map((e) => {
                const isSel = sel.id === e.id;
                const s = severityOf(e.action);
                const href = entityHref(e.entityType, e.entityId);

                return (
                  <div
                    key={e.id}
                    onClick={() => setSelId(e.id)}
                    className={cn(
                      'p-3.5 cursor-pointer transition-colors relative flex flex-col gap-1.5',
                      isSel ? 'bg-[#EFF6FF]' : 'hover:bg-surface'
                    )}
                  >
                    {isSel && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cobalt" />
                    )}

                    {/* Meta Line */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-muted tabular-nums">
                          {fmtTs(e.ts)}
                        </span>
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[11px] font-mono font-bold',
                            s === 'Critical'
                              ? 'bg-fail-bg text-fail-ink border border-fail/30'
                              : s === 'Notice'
                              ? 'bg-warn-bg text-warn-ink border border-warn/30'
                              : 'bg-cobalt-tint text-cobalt-deep border border-cobalt/30'
                          )}
                        >
                          {e.action}
                        </span>
                        {href ? (
                          <Link
                            href={href}
                            onClick={(ev) => ev.stopPropagation()}
                            className="font-mono text-xs font-bold text-cobalt hover:underline flex items-center gap-0.5"
                          >
                            {e.entityId} <ArrowRight size={10} />
                          </Link>
                        ) : (
                          <span className="font-mono text-xs font-bold text-ink">
                            {e.entityId}
                          </span>
                        )}
                        <span className="px-1.5 py-0.2 rounded bg-surface border border-border-subtle text-muted text-[10px] font-semibold uppercase">
                          {e.entityType}
                        </span>
                        {e.demo && (
                          <span
                            className="px-1.5 py-0.2 rounded bg-warn-bg border border-warn/40 text-warn-ink text-[10px] font-mono font-bold uppercase"
                            title="Baris demonstrasi — bukan bagian ledger server"
                          >
                            Demo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 font-mono text-[11px] text-muted">
                        {e.hash ? (
                          <>
                            <ShieldCheck size={12} className="text-pass" />
                            <span className="truncate max-w-[120px]" title={e.hash}>
                              {e.hash.slice(0, 15)}…
                            </span>
                          </>
                        ) : (
                          <span className="text-muted" title="Event ini tidak punya chain-hash tersimpan (data fallback/demo)">— no hash</span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="text-xs text-body font-medium leading-snug">
                      {e.description}
                    </div>

                    {/* Actor, Terminal & Network Info */}
                    <div className="flex items-center justify-between text-muted text-[11px] pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-cobalt text-white flex items-center justify-center text-[10px] font-bold">
                          {e.actorInitials}
                        </div>
                        <span className="font-semibold text-body">{e.actorName}</span>
                        <span>•</span>
                        <span>{e.actorRole}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
                        <span className="flex items-center gap-1" title={e.ip ? undefined : 'Server does not record source IP for this event'}>
                          <Network size={11} /> {e.ip ?? '—'}
                        </span>
                        <span>•</span>
                        <span title={e.terminal ? undefined : 'Server does not record terminal for this event'}>{e.terminal ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {feedWin.bottomPad > 0 && <div style={{ height: feedWin.bottomPad }} aria-hidden="true" />}

              {shown.length === 0 && (
                <div className="p-8 text-center text-muted flex flex-col items-center gap-2">
                  <History size={32} className="text-muted/50" />
                  <p className="font-semibold text-sm">No audit events match your filters</p>
                  <p className="text-xs">Reset the filters to inspect the full immutable ledger stream.</p>
                  <Button variant="secondary" onClick={reset} className="mt-2 text-xs">
                    Reset Filter
                  </Button>
                </div>
              )}
            </div>

            {/* Pagination Bar */}
            <div className="p-3 bg-surface border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                Showing {shown.length} of {filtered.length} filtered ({total} total in ledger)
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                  aria-label="Ukuran halaman"
                  className="h-8 px-2 border border-border-strong rounded bg-card text-body text-xs"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-8 px-2 text-xs"
                >
                  Prev
                </Button>
                <span className="font-mono">
                  {page + 1}/{pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 px-2 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
  );
}
