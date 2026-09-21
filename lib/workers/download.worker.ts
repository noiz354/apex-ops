
interface CsvMsg {
  rows: (string | number | null | undefined)[][];
  delimiter?: string;
  quoteAlways?: boolean;
}

function escapeCell(v: string | number | null | undefined, delim: string, quoteAlways: boolean): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : '';
  }
  const s = String(v);
  const needQuote = quoteAlways || s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delim);
  const prev = s.replace(/"/g, '""');
  return needQuote ? `"${prev}"` : prev;
}

self.onmessage = (ev: MessageEvent<CsvMsg>) => {
  const { rows, delimiter = ',', quoteAlways = false } = ev.data;
  const lines = rows.map((r) => r.map((c) => escapeCell(c, delimiter, quoteAlways)).join(delimiter));
  const csv = '﻿' + lines.join('\r\n');
  (self as unknown as Worker).postMessage({ csv });
};
