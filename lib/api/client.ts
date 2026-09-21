
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
  traceparent?: string;
}

const lastTrace: { current: string | null } = { current: null };
export function getLastTraceparent(): string | null {
  return lastTrace.current;
}

function randomHex(bytes: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function makeTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return { signal: AbortSignal.timeout(timeoutMs), cancel: () => {} };
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (a.aborted) return a;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (b.aborted) controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

export async function apiFetch<T = unknown>(input: string, opts: ApiFetchOptions = {}): Promise<T> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const timeoutMs = opts.timeoutMs ?? (method === 'GET' || method === 'HEAD' ? 15_000 : 30_000);
  const timeout = makeTimeoutSignal(timeoutMs);
  const signal = combineSignals(opts.signal, timeout.signal);

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.body !== undefined && opts.body !== null && !(opts.body instanceof FormData) && !(opts.body instanceof Blob)) {
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    body = JSON.stringify(opts.body);
  } else {
    body = (opts.body as BodyInit | null | undefined) ?? undefined;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    headers['idempotency-key'] =
      opts.idempotencyKey ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  }

  const prev = opts.traceparent ?? lastTrace.current;
  const traceId = prev && prev.split('-').length >= 4 ? prev.split('-')[1] : randomHex(16);
  headers['traceparent'] = `00-${traceId}-${randomHex(8)}-01`;

  let res: Response;
  try {
    res = await fetch(input, { method, headers, body, signal, credentials: 'same-origin' });
  } catch (err) {
    const abortedByCaller = opts.signal?.aborted === true;
    const name = err instanceof Error ? err.name : '';
    if (abortedByCaller || name === 'AbortError' || name === 'TimeoutError') {
      throw new ApiError(
        abortedByCaller ? 'ABORTED' : 'TIMEOUT',
        abortedByCaller ? 'Request dibatalkan.' : `Request timeout setelah ${Math.round(timeoutMs / 1000)}s — jaringan lambat/offline.`,
        0,
      );
    }
    throw new ApiError('NETWORK', 'Network error — server tidak terjangkau.', 0);
  } finally {
    timeout.cancel();
  }

  const tp = res.headers.get('traceparent');
  if (tp) lastTrace.current = tp;
  const requestId = res.headers.get('x-request-id') ?? undefined;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // respons non-JSON (mis. 204/304) — diperlakukan tanpa data
  }
  const envelope = payload as
    | { ok?: boolean; data?: unknown; error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (res.ok && envelope?.ok) return envelope.data as T;

  const code = envelope?.error?.code ?? (res.status ? `HTTP_${res.status}` : 'NETWORK');
  const message = envelope?.error?.message ?? res.statusText ?? 'Request failed';
  throw new ApiError(code, message, res.status, requestId, envelope?.error?.details);
}
