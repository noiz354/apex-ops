'use client';

import * as React from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function AuditFilterBar({
  q,
  setQ,
  entity,
  setEntity,
  action,
  setAction,
  principal,
  setPrincipal,
  scope,
  setScope,
  sev,
  setSev,
  dateFilter,
  setDateFilter,
  setPage,
  searchRef,
  entities,
  actions,
  principals,
  scopes,
  reset,
}: {
  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;
  entity: string;
  setEntity: React.Dispatch<React.SetStateAction<string>>;
  action: string;
  setAction: React.Dispatch<React.SetStateAction<string>>;
  principal: string;
  setPrincipal: React.Dispatch<React.SetStateAction<string>>;
  scope: string;
  setScope: React.Dispatch<React.SetStateAction<string>>;
  sev: string;
  setSev: React.Dispatch<React.SetStateAction<string>>;
  dateFilter: string;
  setDateFilter: React.Dispatch<React.SetStateAction<string>>;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  searchRef: React.RefObject<HTMLInputElement>;
  entities: string[];
  actions: string[];
  principals: string[];
  scopes: { n: string; c: number }[];
  reset: () => void;
}) {
  return (
      <section className="bg-card rounded-xl p-4 border border-border-subtle shadow-card flex flex-col gap-3">
        {/* Top Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Filter berdasarkan ID Entitas, Hash, User, Aksi... (⌘/)"
              aria-label="Cari event audit"
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="md:col-span-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Rentang tanggal"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              <option>Today</option>
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>All Time</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(0);
              }}
              aria-label="Filter entitas"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Entities', ...entities].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(0);
              }}
              aria-label="Filter aksi"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Actions', ...actions].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={principal}
              onChange={(e) => {
                setPrincipal(e.target.value);
                setPage(0);
              }}
              aria-label="Filter prinsipal"
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Principals', ...principals].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom Filter Pills & Quick Segments */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider mr-1">
              Quick Scope:
            </span>
            {scopes.map((s) => (
              <button
                key={s.n}
                type="button"
                onClick={() => {
                  setScope(s.n);
                  setPage(0);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1',
                  scope === s.n
                    ? 'bg-cobalt text-white font-semibold'
                    : 'bg-surface hover:bg-surface-subtle text-body border border-border-subtle'
                )}
              >
                <span>{s.n}</span>
                <span
                  className={cn(
                    'text-[10px] font-mono px-1 rounded',
                    scope === s.n ? 'bg-white/20 text-white' : 'text-muted'
                  )}
                >
                  {s.c >= 1000 ? `${(s.c / 1000).toFixed(1)}k` : s.c}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sev}
              onChange={(e) => {
                setSev(e.target.value);
                setPage(0);
              }}
              aria-label="Filter severitas"
              className="h-8 px-2 border border-border-strong rounded text-xs bg-card text-body"
            >
              {['All Levels', 'Critical', 'Notice', 'Info'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <Button variant="ghost" onClick={reset} className="h-8 px-2 text-xs text-muted hover:text-fail">
              <RotateCcw size={12} className="mr-1" /> Reset
            </Button>
          </div>
        </div>
      </section>
  );
}
