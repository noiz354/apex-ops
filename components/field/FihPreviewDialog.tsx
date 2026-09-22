'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AuditItem } from './fih-model';


interface FihPreviewDialogProps {
  previewAudit: AuditItem | null;
  setPreviewAudit: Dispatch<SetStateAction<AuditItem | null>>;
}

export function FihPreviewDialog(props: FihPreviewDialogProps) {
  const { previewAudit, setPreviewAudit } = props;
  return (
    <>
      {previewAudit && (
        <Dialog open={!!previewAudit} onOpenChange={(open) => !open && setPreviewAudit(null)}>
          <DialogContent>
            <DialogTitle>Pratinjau Protokol Audit</DialogTitle>
            <DialogDescription>
              {previewAudit.id} — {previewAudit.name}
            </DialogDescription>
            <div className="rounded border border-border-subtle bg-surface p-3 text-xs flex flex-col gap-2 my-2">
              <div className="flex justify-between">
                <span className="text-muted">Aset Target:</span>
                <span className="font-mono font-bold">{previewAudit.assetId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Zona:</span>
                <span>{previewAudit.zone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Auditor:</span>
                <span className="font-semibold">{previewAudit.assignee} ({previewAudit.assigneeRole})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Status:</span>
                <span className="font-mono font-bold text-cobalt">{previewAudit.status}</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setPreviewAudit(null)}>Tutup</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
