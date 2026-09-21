'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CANON } from '@/lib/canon';
import { apiFetch } from '@/lib/api/client';

function NewInspectionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [template, setTemplate] = useState('TMPL-HVAC-CHL-02');
  const [asset, setAsset] = useState(searchParams.get('asset') || CANON.assetSeal);
  const [location, setLocation] = useState(searchParams.get('location') || 'Basement Mech Room B-204');
  const [auditor, setAuditor] = useState('Marcus Kowalski (Lead Tech)');
  const [shift, setShift] = useState('Shift A (07:00 - 15:30 WIB)');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const title = `${template} — ${asset}${notes ? ` — ${notes}` : ''}`.slice(0, 200);
      await apiFetch('/api/inspections', {
        method: 'POST',
        body: { title, auditorName: auditor },
      });
      router.push('/field-inspections');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch inspection');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="bg-card border border-border-subtle rounded-xl p-6 shadow-card flex flex-col gap-4">
        <h2 className="text-base font-bold text-ink">Dispatch Parameters</h2>

        <div>
          <label className="text-xs font-semibold text-muted block mb-1">
            Inspection Protocol Template *
          </label>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card"
          >
            <option value="TMPL-HVAC-CHL-02">
              TMPL-HVAC-CHL-02 — Central Chiller Safety &amp; Diagnostic Protocol
            </option>
            <option value="TMPL-GEN-PWR-01">
              TMPL-GEN-PWR-01 — Emergency Diesel Generator Weekly Run Test
            </option>
            <option value="TMPL-BIO-CLN-04">
              TMPL-BIO-CLN-04 — Cleanroom ISO Class 5 HEPA Filter &amp; Diff Pressure
            </option>
            <option value="TMPL-FIRE-SUPP-02">
              TMPL-FIRE-SUPP-02 — Fire Suppression FM-200 Bottle Weight &amp; Actuator
            </option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">
              Target Asset Code *
            </label>
            <Input
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              placeholder="AST-HVAC-004"
              className="text-xs font-mono font-bold"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted block mb-1">
              Room / Zone Location *
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Basement Mech Room B-204"
              className="text-xs"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">
              Assigned Field Auditor
            </label>
            <select
              value={auditor}
              onChange={(e) => setAuditor(e.target.value)}
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card"
            >
              <option>Marcus Kowalski (Lead Tech)</option>
              <option>Elena Voronova (Instrumentation Tech)</option>
              <option>T. Chen (Electrical Tech)</option>
              <option>E. Rostova (Bio-Facility QA)</option>
              <option>R. Davies (Gov PE)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Shift Window</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="w-full h-9 px-2 border border-border-strong rounded text-xs bg-card"
            >
              <option>Shift A (07:00 - 15:30 WIB)</option>
              <option>Shift B (15:00 - 23:30 WIB)</option>
              <option>Shift C (23:00 - 07:30 WIB)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted block mb-1">
            Special Instructions / Lockout Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Verify LOTO #4092 lock tag before opening chiller panel..."
            className="w-full p-2.5 border border-border-strong rounded text-xs bg-card outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
          <Link href="/field-inspections">
            <Button variant="secondary" className="text-xs">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={submitting}
            className="text-xs bg-cobalt-deep hover:bg-cobalt text-white gap-1.5"
          >
            <Send size={13} /> {submitting ? 'Dispatching…' : 'Dispatch Audit to Tablet'}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-red-600">{error}</p>
        ) : null}
      </div>
    </form>
  );
}

export default function NewInspectionPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-16">
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link className="hover:text-cobalt transition-colors" href="/">
          Home
        </Link>
        <span>/</span>
        <Link className="hover:text-cobalt transition-colors" href="/field-inspections">
          Field Inspections
        </Link>
        <span>/</span>
        <span className="font-semibold text-body">Dispatch New Audit</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold font-display text-ink">Schedule &amp; Dispatch Inspection</h1>
        <p className="text-xs text-muted mt-0.5">
          Assign an active checklist protocol to a field technician with target asset mapping.
        </p>
      </div>

      <Suspense fallback={<div className="p-6 text-center text-xs text-muted">Loading dispatch form…</div>}>
        <NewInspectionForm />
      </Suspense>
    </div>
  );
}
