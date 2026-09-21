import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createPmRule, listPmRules } from '@/lib/services/pm-service';

const CreatePmRuleSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3).max(200),
  assetCode: z.string().min(3).max(50),
  intervalDays: z.number().int().positive(),
  priority: z.enum(['P1', 'P2', 'P3']).optional(),
  nextDueDays: z.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'pm.list', method: 'GET', permission: 'wo.read' }, req, async (ctx) => {
    const rules = await listPmRules(getDb(), ctx!);
    return { data: rules };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'pm.create', method: 'POST', permission: 'wo.create' }, req, async (ctx) => {
    const body = await req.json();
    const input = CreatePmRuleSchema.parse(body);
    const rule = await createPmRule(getDb(), ctx!, input);
    return { status: 201, data: rule };
  });
}
