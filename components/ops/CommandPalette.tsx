'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { CANON } from '@/lib/canon';
import { ApiError, apiFetch } from '@/lib/api/client';

interface DbSearchResult { id: string; type: string; title: string; subtitle: string; badge?: string; href: string }

const COMMANDS = [
  { label: `Buka ${CANON.workOrderSeal} (seal job)`, hint: 'H1 · detail work order', href: `/work-orders/${CANON.workOrderSeal}` },
  { label: 'Buat Work Order Baru', hint: 'P1-P3 SLA · buat dispatch', href: '/work-orders/new' },
  { label: `Buka ${CANON.purchaseOrder} (procurement terkait)`, hint: 'H3 · detail pembelian', href: `/purchasing/${CANON.purchaseOrder}` },
  { label: `Buka ${CANON.serviceRequest} (sumber konversi)`, hint: 'M2 · service request', href: `/service-requests/${CANON.serviceRequest}` },
  { label: 'Hub Inspeksi Lapangan & Antrean Terjadwal', hint: 'Layar 5 · meja inspeksi', href: '/field-inspections' },
  { label: 'Jadwalkan Inspeksi Lapangan Baru', hint: 'Protokol · dispatch audit', href: '/field-inspections/new' },
  { label: `Buka audit lapangan (${CANON.inspection})`, hint: 'H2 · eksekusi mobile', href: '/field/audits' },
  { label: 'Buka Trane Technologies (vendor)', hint: 'M1 · MSA-2024-TRN-09', href: '/vendors/trane-technologies' },
  { label: 'Buka Rencana Shift (Shift A/B)', hint: 'L1 · papan serah terima', href: '/shifts/plan' },
  { label: 'Buka BIM · AST-HVAC-004', hint: 'M6 · viewer', href: '/assets/AST-HVAC-004/bim' },
  { label: 'Audit Trail Sistem', hint: 'Riwayat event', href: '/audit-trail' },
  { label: 'Cetak Izin Kerja (PTW)', hint: 'Sign-off LOTO fisik', href: '/permits/PTW-2026-0814/print' },
  { label: 'Cetak Badge Personel (CR80)', hint: 'RFID-9021 · kartu ID fisik', href: '/badges/RFID-9021/print' },
  { label: 'Antrean Job Latar', hint: 'Antrean dispatch in-memory (ephemeral)', href: '/settings/jobs' },
  { label: 'Matriks State UI & Galeri Komponen', hint: 'Harness QA design system', href: '/ui-patterns' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [searchResults, setSearchResults] = useState<DbSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  const list = useMemo(
    () => COMMANDS.filter((c) => (c.label + c.hint).toLowerCase().includes(q.toLowerCase())),
    [q]
  );

  useEffect(() => {
    if (open) {
      setQ('');
      setSearchResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await apiFetch<{ results: DbSearchResult[] }>(
          `/api/search?q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
        );
        setSearchResults(data?.results || []);
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'ABORTED')) {
          // kegagalan jaringan: biarkan hasil terakhir tampil (graceful)
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Palet perintah">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card rounded-lg shadow-modal overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-border-subtle">
          <Search size={18} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (searchResults.length > 0) {
                  router.push(searchResults[0].href);
                  onClose();
                } else if (list[0]) {
                  router.push(list[0].href);
                  onClose();
                }
              }
            }}
            placeholder="Cari work order, aset, part, atau perintah..."
            aria-label="Ketik perintah atau cari"
            className="flex-1 h-12 bg-transparent outline-none text-sm placeholder:text-muted"
          />
          {isSearching && <span className="text-[10px] text-brand uppercase font-bold tracking-wider animate-pulse">Mencari...</span>}
          <kbd className="apex-id text-muted bg-surface-subtle px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <ul className="max-h-96 overflow-y-auto p-1 flex flex-col divide-y divide-border-subtle/40">
          {searchResults.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                Hasil Pencarian Database ({searchResults.length})
              </div>
              {searchResults.map((r) => (
                <li key={r.href + r.id}>
                  <Link
                    href={r.href}
                    onClick={onClose}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-subtle transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="text-[13px] font-semibold block truncate text-ink">{r.title}</span>
                      <span className="text-[11px] text-muted block truncate">{r.subtitle}</span>
                    </div>
                    {r.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-muted text-ink shrink-0">
                        {r.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </div>
          )}

          <div className="py-1">
            {searchResults.length > 0 && (
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                Navigasi & Pintasan
              </div>
            )}
            {list.map((c) => (
              <li key={c.href + c.label}>
                <Link
                  href={c.href}
                  onClick={onClose}
                  className="block px-3 py-2 rounded-lg hover:bg-surface-subtle"
                >
                  <span className="text-[13px] font-semibold block">{c.label}</span>
                  <span className="text-[11px] text-muted block">{c.hint}</span>
                </Link>
              </li>
            ))}
          </div>

          {list.length === 0 && searchResults.length === 0 && !isSearching && (
            <li className="px-3 py-6 text-sm text-muted text-center">Tidak ada record atau perintah yang cocok.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
