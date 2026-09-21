import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { convertFindingToWo } from '@/lib/services/inspection-service';

const ConvertFindingSchema = z.object({
  woTitle: z.string().max(200).nullish(),
  woPriority: z.enum(['P1', 'P2', 'P3']).nullish(),
  location: z.string().max(200).nullish(),
  reason: z.string().max(300).nullish(),
  lotoConfirmed: z.boolean().nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'finding.convert', method: 'POST', permission: 'wo.create' }, req, async (ctx, requestId) => {
    let input = {};
    try {
      const body = await req.json();
      input = ConvertFindingSchema.parse(body);
    } catch {
    }

    const res = await convertFindingToWo(
      getDb(),
      ctx!,
      id,
      input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId },
    );

    return {
      status: 201,
      data: res,
    };
  });
}
