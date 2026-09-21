
export interface RumStoredEvent {
  kind: 'webvital' | 'longtask' | 'error' | 'mark';
  name: string;
  value: number;
  route: string;
  ts: number;
  receivedAt: number;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 5000;
const entries: RumStoredEvent[] = [];

export function recordRumBatch(events: Array<Omit<RumStoredEvent, 'receivedAt'>>): void {
  for (const e of events) {
    entries.push({ ...e, receivedAt: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export interface RouteRumSummary {
  route: string;
  samples: number;
  lcpP75Ms: number | null;
  inpP75Ms: number | null;
  clsP75: number | null;
  longtaskCount: number;
  errorCount: number;
}

export function getRumSummary(windowMinutes = 30): {
  windowSeconds: number;
  totalEvents: number;
  routes: RouteRumSummary[];
} {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const active = entries.filter((e) => now - e.receivedAt <= windowMs);

  const byRoute = new Map<string, RumStoredEvent[]>();
  for (const e of active) {
    const list = byRoute.get(e.route) || [];
    list.push(e);
    byRoute.set(e.route, list);
  }

  const routes: RouteRumSummary[] = [];
  for (const [route, list] of byRoute.entries()) {
    const lcp = list.filter((e) => e.kind === 'webvital' && e.name === 'LCP').map((e) => e.value).sort((a, b) => a - b);
    const inp = list.filter((e) => e.kind === 'webvital' && e.name === 'INP').map((e) => e.value).sort((a, b) => a - b);
    const cls = list.filter((e) => e.kind === 'webvital' && e.name === 'CLS').map((e) => e.value).sort((a, b) => a - b);
    routes.push({
      route,
      samples: list.length,
      lcpP75Ms: lcp.length ? Math.round(percentile(lcp, 0.75)) : null,
      inpP75Ms: inp.length ? Math.round(percentile(inp, 0.75)) : null,
      clsP75: cls.length ? Math.round(percentile(cls, 0.75) * 1000) / 1000 : null,
      longtaskCount: list.filter((e) => e.kind === 'longtask').length,
      errorCount: list.filter((e) => e.kind === 'error').length,
    });
  }
  routes.sort((a, b) => b.samples - a.samples);

  return { windowSeconds: windowMs / 1000, totalEvents: active.length, routes };
}
