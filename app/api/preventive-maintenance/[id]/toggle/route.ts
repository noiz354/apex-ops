import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { togglePmRule } from '@/lib/services/pm-service';

const ToggleSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'pm.toggle', method: 'POST', permission: 'wo.create' }, req, async (ctx) => {
    const body = await req.json();
    const input = ToggleSchema.parse(body);
    const rule = await togglePmRule(getDb(), ctx!, id, input.status);
    return { data: rule };
  });
}
