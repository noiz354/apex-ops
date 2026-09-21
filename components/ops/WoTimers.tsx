'use client';

import { useEffect, useState } from 'react';

export function SlaCountdown({ startSec = 0, breached = false }: { startSec?: number; breached?: boolean }) {
  const [sec, setSec] = useState(startSec);
  useEffect(() => {
    setSec(startSec);
    const t = setInterval(() => setSec((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [startSec]);

  const inBreach = breached || sec < 0;
  const abs = Math.abs(Math.min(sec, 0));
  const h = String(Math.floor(abs / 3600)).padStart(2, '0');
  const m = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  const s = String(abs % 60).padStart(2, '0');
  const mm = Math.floor(Math.max(sec, 0) / 60);
  const ss = String(Math.max(sec, 0) % 60).padStart(2, '0');

  return (
    <span
      role="timer"
      className={`font-bold tabular-nums font-mono tracking-tight ${inBreach ? 'text-3xl text-fail' : 'text-4xl'}`}
    >
      {inBreach ? `\u2212${h}:${m}:${s} BREACH` : `${mm}m ${ss}s`}
    </span>
  );
}

export function LaborStopwatch({ startSec = 1 * 3600 + 42 * 60 + 18, initialSec, isRunning = true }: { startSec?: number; initialSec?: number; isRunning?: boolean }) {
  const base = initialSec ?? startSec;
  const [sec, setSec] = useState(base);
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRunning]);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return (
    <span className="text-4xl font-bold tabular-nums text-[#00563A] font-mono tracking-tight">
      {h}:{m}:{s}
    </span>
  );
}
