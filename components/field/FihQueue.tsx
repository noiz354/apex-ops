'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Bolt,
  Check,
  ChevronRight,
  ClipboardCheck,
  Eye,
  Play,
  RefreshCw,
  Search,
  Radar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AuditItem, QueueTab } from './fih-model';


interface FihQueueProps {
  audits: AuditItem[];
  filteredAudits: AuditItem[];
  tab: QueueTab;
  setTab: Dispatch<SetStateAction<QueueTab>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  zone: string;
  setZone: Dispatch<SetStateAction<string>>;
  discipline: string;
  setDiscipline: Dispatch<SetStateAction<string>>;
  live: boolean;
  dispatching: string | null;
  handleForceDispatch: (auditId: string) => Promise<void>;
  loadAudits: (silent: boolean) => Promise<void>;
  setPreviewAudit: Dispatch<SetStateAction<AuditItem | null>>;
  searchInputRef: RefObject<HTMLInputElement>;
}

export function FihQueue(props: FihQueueProps) {
  const { audits, filteredAudits, tab, setTab, search, setSearch, zone, setZone, discipline, setDiscipline, live, dispatching, handleForceDispatch, loadAudits, setPreviewAudit, searchInputRef } = props;
  return (
        <div className="xl:col-span-7 flex flex-col gap-4">
          <div className="rounded-xl bg-card border border-border-subtle shadow-card flex flex-col overflow-hidden">
            {/* Tab Bar & Filter Header */}
            <div className="p-4 bg-card flex flex-col gap-3 border-b border-border-subtle">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="text-cobalt-deep" size={18} />
                  <h2 className="text-sm font-bold text-ink">Inspeksi Terjadwal &amp; Antrean Audit</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle font-semibold">
                    Shift A: 07:00 - 15:30 WIB
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadAudits(false)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border-subtle hover:bg-surface text-muted hover:text-body"
                    title="Muat ulang antrean"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>

              {/* Queue Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    { id: 'all', label: 'Semua Audit (18)' },
                    { id: 'today', label: 'Hari Ini / Mendesak (6)' },
                    { id: 'overdue', label: 'Terlambat / Risiko SLA (2)', alert: true },
                    { id: 'completed', label: 'Selesai (10)' },
                    { id: 'templates', label: 'Template & Formulir' },
                  ] as Array<{ id: QueueTab; label: string; alert?: boolean }>
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5',
                      tab === t.id
                        ? t.alert
                          ? 'bg-fail text-white shadow-xs'
                          : 'bg-cobalt text-white shadow-xs'
                        : t.alert
                        ? 'bg-fail-bg text-fail-ink border border-fail/30'
                        : 'bg-surface hover:bg-surface-subtle text-body border border-border-subtle'
                    )}
                  >
                    {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Search & Filter Controls */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 pt-1">
                <div className="md:col-span-6 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <Input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari Audit, Aset, atau Teknisi... (Ctrl+/)"
                    className="pl-8 pr-14 h-9 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-muted">
                    Ctrl + /
                  </span>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border-strong text-body text-xs rounded"
                  >
                    <option>Zona: Semua Fasilitas</option>
                    <option>Basement Mech Room B-204</option>
                    <option>Sub-Basement Vault</option>
                    <option>Clean Lab Annex 4</option>
                    <option>Grid Substation Yard</option>
                    <option>Raised Floor Data Center</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    className="w-full h-9 px-2 bg-card border border-border-strong text-body text-xs rounded"
                  >
                    <option>Disiplin: Semua</option>
                    <option>HVAC &amp; Air Dingin</option>
                    <option>Elektrikal &amp; Switchgear</option>
                    <option>Kebakaran &amp; Keselamatan</option>
                    <option>Cleanroom &amp; Bio-Env</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Data-Dense Audit Queue Table */}
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead>
                  <tr className="bg-surface text-muted text-[10px] font-bold uppercase tracking-wider border-b border-border-subtle">
                    <th className="py-2.5 px-3">ID &amp; Nama Audit</th>
                    <th className="py-2.5 px-3">Aset / Zona Target</th>
                    <th className="py-2.5 px-3">Irama / Jatuh Tempo</th>
                    <th className="py-2.5 px-3">Auditor</th>
                    <th className="py-2.5 px-3">Status / Kekritisan</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredAudits.map((a) => (
                    <tr
                      key={a.id}
                      className={cn(
                        'transition-colors hover:bg-surface',
                        a.status === 'OVERDUE' && 'bg-fail-bg/30'
                      )}
                    >
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'font-mono text-xs font-bold',
                              a.status === 'OVERDUE' ? 'text-fail' : 'text-cobalt'
                            )}
                          >
                            {a.id}
                          </span>
                          <span className="font-semibold text-body truncate max-w-[200px]" title={a.name}>
                            {a.name}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <Link
                            href={`/assets/${a.assetId}`}
                            className="font-mono text-xs font-bold text-ink hover:underline"
                          >
                            {a.assetId}
                          </Link>
                          <span className="text-[11px] text-muted truncate max-w-[150px]">{a.zone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className={cn('font-semibold', a.status === 'OVERDUE' && 'text-fail')}>
                            {a.dueText}
                          </span>
                          <span className={cn('text-[10px] font-mono', a.status === 'OVERDUE' ? 'text-fail' : 'text-muted')}>
                            {a.dueSub}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-cobalt-deep text-white flex items-center justify-center text-[10px] font-bold">
                            {a.assigneeInitials}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-body">{a.assignee}</span>
                            <span className="text-[10px] text-muted">{a.assigneeRole}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        {a.status === 'IN_PROGRESS' && (
                          <div className="flex flex-col gap-1 w-24">
                            <div className="flex items-center justify-between text-[10px] font-bold text-cobalt">
                              <span>IN PROGRESS</span>
                              <span>{a.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-subtle border border-border-subtle overflow-hidden">
                              <div className="h-full bg-cobalt rounded-full" style={{ width: `${a.progress}%` }} />
                            </div>
                          </div>
                        )}
                        {a.status === 'OVERDUE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink font-mono text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-fail animate-pulse" /> OVERDUE
                          </span>
                        )}
                        {a.status === 'SCHEDULED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface border border-border-subtle text-muted font-mono text-[10px] font-semibold">
                            SCHEDULED
                          </span>
                        )}
                        {a.status === 'FINDINGS' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink font-mono text-[10px] font-bold">
                            <AlertTriangle size={11} /> {a.findingsCount} FINDINGS
                          </span>
                        )}
                        {a.status === 'READY' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink font-mono text-[10px] font-bold">
                            READY
                          </span>
                        )}
                        {a.status === 'COMPLETED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink font-mono text-[10px] font-bold">
                            <Check size={11} /> COMPLETED
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {a.status === 'IN_PROGRESS' && (
                          <Link href={`/field/audits/${a.id}/run`}>
                            <Button className="h-7 px-2.5 text-xs gap-1 bg-cobalt-deep hover:bg-cobalt text-white">
                              Buka Run <Play size={11} />
                            </Button>
                          </Link>
                        )}
                        {a.status === 'OVERDUE' && (
                          <Button
                            variant="destructive"
                            onClick={() => void handleForceDispatch(a.id)}
                            disabled={dispatching === a.id}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            {dispatching === a.id ? 'Mengirim…' : 'Dispatch Paksa'} <Bolt size={11} />
                          </Button>
                        )}
                        {a.status === 'SCHEDULED' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Pratinjau <Eye size={11} />
                          </Button>
                        )}
                        {a.status === 'FINDINGS' && (
                          <Link href="/field/findings/FND-2026-0188">
                            <Button variant="secondary" className="h-7 px-2.5 text-xs gap-1 text-fail hover:bg-fail-bg border-fail/30">
                              Tinjau Temuan <ArrowRight size={11} />
                            </Button>
                          </Link>
                        )}
                        {a.status === 'READY' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Detail <ChevronRight size={11} />
                          </Button>
                        )}
                        {a.status === 'COMPLETED' && (
                          <Button
                            variant="secondary"
                            onClick={() => setPreviewAudit(a)}
                            className="h-7 px-2.5 text-xs gap-1"
                          >
                            Tinjau <Eye size={11} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination */}
            <div className="p-3 bg-surface border-t border-border-subtle flex items-center justify-between text-xs text-muted">
              <span>Menampilkan {filteredAudits.length} dari {audits.length} audit {live ? '(daftar server)' : '(demo offline)'}</span>
              <div className="flex items-center gap-1 font-mono">
                <Button variant="secondary" className="h-7 px-2 text-xs" disabled>
                  Sblm
                </Button>
                <span className="px-2 font-semibold text-body">Hal 1 / 4</span>
                <Button variant="secondary" className="h-7 px-2 text-xs">
                  Lanjut
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Telemetry & Field Sensor Livefeed Widget */}
          <div className="rounded-xl bg-card border border-border-subtle p-4 shadow-card flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cobalt-tint flex items-center justify-center text-cobalt">
                <Radar size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-ink">Tautan Gateway IoT Gardu</span>
                <span className="text-[11px] font-mono text-muted">
                  Modbus TCP/IP (demo — tidak tersambung) · referensi suhu bus bar AST-ELEC-01 (42,4°C nom)
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-border-subtle border border-border-strong text-muted font-mono text-[10px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted" /> DEMO — TIDAK STREAMING
            </span>
          </div>
        </div>
  );
}
