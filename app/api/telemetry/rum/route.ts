import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getRumSummary, recordRumBatch } from '@/lib/telemetry/rum-store';

const RumEventSchema = z.object({
  kind: z.enum(['webvital', 'longtask', 'error', 'mark']),
  name: z.string().min(1).max(120),
  value: z.number().finite().min(-1e6).max(1e9),
  route: z.string().min(1).max(200),
  ts: z.number().int().positive(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const PayloadSchema = z.object({
  events: z.array(RumEventSchema).max(50),
});

export async function POST(req: NextRequest) {
  return withRoute({ op: 'telemetry.rum.ingest', method: 'POST' }, req, async () => {
    const text = await req.text();
    if (text.length > 64_000) {
      return { status: 413, data: { accepted: 0, reason: 'payload too large' } };
    }
    const payload = PayloadSchema.parse(JSON.parse(text));
    recordRumBatch(payload.events);
    return { status: 202, data: { accepted: payload.events.length, reason: 'ok' } };
  });
}

export async function GET(req: NextRequest) {
  return withRoute({ op: 'telemetry.rum.summary', method: 'GET', permission: 'audit.read' }, req, async () => {
    return { data: getRumSummary() };
  });
}
