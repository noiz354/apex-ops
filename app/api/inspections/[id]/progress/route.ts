import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { updateInspectionProgress } from '@/lib/services/inspection-service';

const ProgressSchema = z.object({
  progressPct: z.number().int().min(0).max(100),
  status: z.string().min(2).max(20).optional(),
  verdict: z.enum(['FAIL', 'PASS-OVERRIDE']).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  return withRoute(
    { op: 'inspections.progress', method: 'POST', permission: 'assets.read' },
    req,
    async (ctx, requestId) => {
      const body = ProgressSchema.parse(await req.json());
      const row = await updateInspectionProgress(
        getDb(),
        ctx!,
        id,
        body.progressPct,
        body.status,
        { requestId, verdict: body.verdict ?? null },
      );
      return { data: row };
    }
  );
}
