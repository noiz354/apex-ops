
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip ASCII control chars from filenames (path/terminal safety).
  const clean = name.replace(/[\\/:*?"<>|-]+/g, '-').trim();
  return clean.slice(0, 180) || 'download';
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'text/csv'): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}


export type CsvRow = (string | number | null | undefined)[];

export async function buildCsvViaWorker(
  rows: CsvRow[],
  delimiter = ',',
): Promise<string> {
  if (typeof window === 'undefined' || !('Worker' in window)) {
    return buildCsvSync(rows, delimiter);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workers/download.worker.ts', import.meta.url));
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('worker-timeout'));
    }, 30_000);
    worker.onmessage = (ev) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve((ev.data as { csv: string }).csv);
    };
    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(e);
    };
    worker.postMessage({ rows, delimiter });
  });
}

function buildCsvSync(rows: CsvRow[], delimiter: string): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    const s = String(v);
    const needQuote = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter);
    return needQuote ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(delimiter)).join('\r\n');
}

export async function exportCsvViaWorker(
  filename: string,
  rows: CsvRow[],
  delimiter = ',',
): Promise<void> {
  const csv = await buildCsvViaWorker(rows, delimiter);
  downloadText(filename, csv);
}


interface SaveFilePickerHandle {
  createWritable(): Promise<{
    write(data: Blob | string): Promise<void>;
    close(): Promise<void>;
  }>;
}
declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<SaveFilePickerHandle>;
  }
}

export async function saveAsViaPickerOrDownload(
  filename: string,
  blob: Blob,
  mimeType?: string,
): Promise<'picker' | 'download'> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: sanitizeFilename(filename),
        types: [{ description: 'Export file', accept: { [mimeType ?? 'text/csv']: ['.csv', '.txt'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'picker';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'picker';
      throw err;
    }
  }
  downloadBlob(filename, blob);
  return 'download';
}
