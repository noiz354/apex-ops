import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-14 h-14 rounded-xl border-2 border-slate900 bg-warn-bg flex items-center justify-center text-2xl" aria-hidden="true">
        ⚡
      </div>
      <h1 className="text-2xl font-bold font-display">You are offline</h1>
      <p className="text-sm text-muted max-w-md">
        The connection dropped. Work already queued in your <strong>offline outbox is safe</strong> and will replay
        automatically with its original idempotency keys when the link returns.
      </p>
      <div className="flex gap-2">
        <Link
          href="/field/audits"
          className="min-h-[48px] inline-flex items-center px-4 rounded border-2 border-slate900 bg-slate900 text-white text-sm font-bold"
        >
          Open Field Audits
        </Link>
        <Link
          href="/"
          className="min-h-[48px] inline-flex items-center px-4 rounded border-2 border-border-strong bg-card text-body text-sm font-semibold"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
