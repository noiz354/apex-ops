'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Building2, ChevronDown, LoaderCircle, LogOut, Plus, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { postAuthSignal, purgeLocalState } from '@/lib/auth/broadcast';
import type { SessionUserView } from './OpsShell';

export function TopBar({ onPalette, user }: { onPalette: () => void; user: SessionUserView }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', timeoutMs: 10_000 });
    } catch {
    }
    purgeLocalState();
    postAuthSignal('LOGOUT');
    window.location.assign('/login');
  };

  return (
    <header className="fixed top-7 left-0 desktop:left-72 right-0 h-16 bg-surface/90 backdrop-blur-xl shadow-card z-40 px-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 max-w-2xl min-w-0">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EFF4FF]">
          <Building2 size={16} className="text-cobalt-deep" />
          <div className="flex flex-col text-left">
            <span className="apex-label-caps text-muted">Organisasi</span>
            <span className="text-[13px] font-semibold truncate max-w-xs">{user.orgName}</span>
          </div>
          <ChevronDown size={16} className="text-muted" />
        </div>
        <button
          type="button"
          onClick={onPalette}
          className="relative flex-1 min-w-0 text-left h-9 pl-9 pr-12 bg-card text-muted text-sm rounded-lg border border-border-subtle shadow-card"
        >
          <Search size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2" />
          <span className="truncate block">Cari WO, AST, PART…</span>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 apex-id text-muted bg-surface-subtle px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded bg-pass-bg" role="status">
          <span className="w-2 h-2 rounded-full bg-pass" />
          <span className="apex-id text-pass">
            BACKEND AKTIF
          </span>
        </div>
        <button
          type="button"
          onClick={onPalette}
          className="h-9 px-4 rounded-lg bg-cobalt-deep text-white text-[13px] font-semibold hidden sm:flex items-center gap-2 hover:bg-cobalt"
        >
          <Plus size={16} strokeWidth={3} />
          <span>Dispatch / Permintaan Baru</span>
        </button>
        <Link
          href="/notifications"
          aria-label="Notifikasi"
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#EFF4FF] relative"
        >
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-fail ring-2 ring-surface" />
        </Link>
        <span className="flex items-center gap-2">
          <Link href="/profile" className="flex items-center gap-2" aria-label="Profil pengguna">
            <span className="w-8 h-8 rounded-full bg-cobalt-deep text-white text-[13px] font-bold flex items-center justify-center">
              {user.initials}
            </span>
            <span className="hidden md:flex flex-col text-left">
              <span className="text-[13px] font-semibold leading-tight">{user.name}</span>
              <span className="apex-label-caps text-muted leading-tight">{user.role}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            aria-label="Keluar"
            title="Keluar (mencabut sesi)"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-subtle text-muted hover:text-fail hover:bg-fail-bg"
          >
            {loggingOut ? <LoaderCircle size={18} className="animate-spin" /> : <LogOut size={18} />}
          </button>
        </span>
      </div>
    </header>
  );
}
