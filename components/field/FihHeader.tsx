'use client';

import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import {
  Download,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';


interface FihHeaderProps {
  live: boolean;
  exportAuditLog: () => Promise<void>;
  busyExport: boolean;
  createTemplateOpen: boolean;
  setCreateTemplateOpen: Dispatch<SetStateAction<boolean>>;
  newTemplateName: string;
  setNewTemplateName: Dispatch<SetStateAction<string>>;
  push: (ok: boolean, title: string, msg: string) => void;
}

export function FihHeader(props: FihHeaderProps) {
  const { live, exportAuditLog, busyExport, createTemplateOpen, setCreateTemplateOpen, newTemplateName, setNewTemplateName, push } = props;
  return (
      <section className="flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
          <Link className="hover:text-cobalt transition-colors" href="/">
            Beranda
          </Link>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Operasi Inti</span>
          <span>/</span>
          <span className="hover:text-cobalt transition-colors">Inspeksi Lapangan</span>
          <span>/</span>
          <span className="font-semibold text-body">Antrean Audit &amp; Pembuat Template</span>
        </nav>

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pt-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink font-display">
                Inspeksi &amp; Audit
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-border-subtle text-muted text-[11px] font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass animate-ping" />
                  {live ? 'Server: tersambung' : 'Server: offline'}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-pass-bg border border-pass/30 text-pass-ink text-[11px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-pass" />
                  Kepatuhan Audit: 98,2%
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-fail-bg border border-fail/30 text-fail-ink text-[11px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-fail" />
                  Audit Lapangan Tertunda: 7 Antre
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => void exportAuditLog()}
              disabled={busyExport}
              className="h-9 gap-1.5 text-xs"
            >
              <Download size={14} /> Ekspor Log Audit
            </Button>

            <Link href="/shifts/plan">
              <Button variant="secondary" className="h-9 gap-1.5 text-xs">
                <RefreshCw size={14} /> Serah Terima Shift
              </Button>
            </Link>

            {/* Create Template Dialog */}
            <Dialog open={createTemplateOpen} onOpenChange={setCreateTemplateOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-1.5 text-xs bg-cobalt-deep hover:bg-cobalt text-white">
                  <PlusCircle size={14} /> + Buat Template Inspeksi
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Buat Template Protokol Inspeksi</DialogTitle>
                <DialogDescription>
                  Definisikan protokol checklist standar baru untuk eksekusi di tablet teknisi.
                </DialogDescription>
                <div className="space-y-3 my-2 text-xs">
                  <div>
                    <label className="font-semibold block mb-1">Judul Protokol</label>
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="mis. Inspeksi Tahunan Tube Kondensor Chiller"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Kategori Aset</label>
                    <select className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card">
                      <option>Chiller Air Industri &amp; Central Plant</option>
                      <option>Genset Diesel Darurat &amp; ATS</option>
                      <option>Gardu Tegangan Tinggi &amp; Trafo</option>
                      <option>Sistem Sprinkler Kebakaran &amp; Keselamatan</option>
                      <option>HVAC Cleanroom &amp; Bio-Env</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={() => setCreateTemplateOpen(false)}>
                    Batal
                  </Button>
                  <Button
                    onClick={() => {
                      setCreateTemplateOpen(false);
                      push(true, 'Template Diinisiasi', `Draf protokol [${newTemplateName || 'Protokol Baru'}] dibuat (lokal).`);
                    }}
                  >
                    Buat Draf
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>
  );
}
