'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  AlertTriangle,
  GripVertical,
  Layers,
  MoreVertical,
  Plus,
  Upload,
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
import type { ChecklistStep } from './fih-model';


interface FihTemplateBuilderProps {
  steps: ChecklistStep[];
  handleSaveDraft: () => void;
  handlePublishTemplate: () => void;
  handleAddStep: () => void;
  addStepOpen: boolean;
  setAddStepOpen: Dispatch<SetStateAction<boolean>>;
  newStepTitle: string;
  setNewStepTitle: Dispatch<SetStateAction<string>>;
  newStepType: ChecklistStep['type'];
  setNewStepType: Dispatch<SetStateAction<ChecklistStep['type']>>;
}

export function FihTemplateBuilder(props: FihTemplateBuilderProps) {
  const { steps, handleSaveDraft, handlePublishTemplate, handleAddStep, addStepOpen, setAddStepOpen, newStepTitle, setNewStepTitle, newStepType, setNewStepType } = props;
  return (
        <div className="xl:col-span-5 flex flex-col gap-4">
          <div className="rounded-xl bg-card border border-border-subtle p-4 shadow-card flex flex-col">
            {/* Template Header / Meta */}
            <div className="pb-3 mb-3 border-b border-border-subtle flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cobalt-deep text-white font-mono text-[10px] font-bold">
                    TMPL-HVAC-CHL-02
                  </span>
                  <span className="font-mono text-[11px] text-muted">v2.4 Draf</span>
                </div>
                <h3 className="text-sm font-bold text-ink mt-1 font-display">
                  Protokol Keselamatan &amp; Diagnostik Chiller Sentral
                </h3>
                <span className="text-[11px] text-muted">
                  Kategori Aset Target: Chiller Air Industri &amp; Central Plant
                </span>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded border border-border-subtle flex items-center justify-center text-muted hover:text-body"
              >
                <MoreVertical size={16} />
              </button>
            </div>

            {/* Designer Instruction Bar */}
            <div className="flex items-center justify-between p-2.5 rounded bg-surface border border-border-subtle mb-3 text-xs">
              <span className="text-muted flex items-center gap-1.5">
                <Layers size={14} className="text-cobalt" />
                <span>Alur Teknisi: <strong>{steps.length} Langkah Wajib</strong></span>
              </span>
              <span className="text-pass-ink font-semibold font-mono text-[10px]">
                Guardrail Logika Aktif
              </span>
            </div>

            {/* Checklist Item Steps */}
            <div className="flex flex-col gap-3">
              {steps.map((st) => (
                <div
                  key={st.seq}
                  className="rounded-lg bg-surface border border-border-subtle p-3 flex flex-col gap-2 hover:border-cobalt/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <GripVertical size={14} className="text-muted cursor-grab" />
                      <span className="font-mono text-[11px] font-bold text-cobalt">
                        STEP 0{st.seq}
                      </span>
                      <span className="text-xs font-bold text-ink">{st.title}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-surface-subtle border border-border-subtle text-muted">
                      {st.type}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted ml-5">{st.description}</p>

                  {/* Step Interactive Specifics */}
                  {st.type === 'Binary P/F' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-pass-bg text-pass-ink font-bold text-[10px]">
                          PASS
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface text-muted font-medium text-[10px]">
                          FAIL
                        </span>
                      </div>
                      <span className="text-[10px] text-fail font-medium flex items-center gap-1">
                        <AlertTriangle size={11} /> {st.logic}
                      </span>
                    </div>
                  )}

                  {st.type === 'Numeric Bound' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-muted text-[11px]">
                          Batas: Min {st.min} {st.unit} — Maks {st.max} {st.unit}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            disabled
                            value={st.val}
                            className="w-16 h-6 text-center font-mono text-xs font-bold bg-surface border border-border-subtle rounded"
                          />
                          <span className="text-muted text-[11px] font-mono">{st.unit}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-fail">{st.logic}</span>
                    </div>
                  )}

                  {st.type === 'Mandatory Media' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between text-xs">
                      <span className="text-muted text-[11px]">{st.logic}</span>
                      <span className="px-1.5 py-0.5 rounded bg-surface font-mono text-[10px] font-semibold">
                        {st.shotReq} Foto Wajib
                      </span>
                    </div>
                  )}

                  {st.type === 'IoT Auto-Populate' && (
                    <div className="ml-5 p-2 rounded bg-card border border-border-subtle flex items-center justify-between text-xs font-mono">
                      <span className="text-muted text-[11px]">{st.iotChannel}</span>
                      <span className="text-pass-ink font-bold text-xs">{st.val}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Builder Control Actions */}
            <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-2 flex-wrap">
              {/* Add Step Dialog */}
              <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" className="h-8 px-2.5 text-xs gap-1">
                    <Plus size={13} /> + Tambah Langkah Checklist
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Tambah Langkah Verifikasi</DialogTitle>
                  <DialogDescription>
                    Tambahkan checkpoint verifikasi baru ke draf protokol aktif.
                  </DialogDescription>
                  <div className="space-y-3 my-2 text-xs">
                    <div>
                      <label className="font-semibold block mb-1">Judul Langkah</label>
                      <Input
                        value={newStepTitle}
                        onChange={(e) => setNewStepTitle(e.target.value)}
                        placeholder="mis. Periksa Level & Warna Oli"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1">Tipe Langkah</label>
                      <select
                        value={newStepType}
                        onChange={(e) => setNewStepType(e.target.value as ChecklistStep['type'])}
                        className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card"
                      >
                        <option>Binary P/F</option>
                        <option>Numeric Bound</option>
                        <option>Mandatory Media</option>
                        <option>IoT Auto-Populate</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setAddStepOpen(false)}>
                      Batal
                    </Button>
                    <Button onClick={handleAddStep}>Tambah Langkah</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={handleSaveDraft} className="h-8 px-3 text-xs">
                  Simpan Draf
                </Button>
                <Button
                  onClick={handlePublishTemplate}
                  className="h-8 px-3 text-xs bg-cobalt-deep hover:bg-cobalt text-white gap-1"
                >
                  <Upload size={12} /> Terbitkan Template (v2.4)
                </Button>
              </div>
            </div>
          </div>
        </div>
  );
}
