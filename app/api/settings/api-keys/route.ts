import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createApiKey, listApiKeys } from '@/lib/services/api-key-service';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(80),
  expiresInDays: z.number().int().positive().max(3650).nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'settings.api-keys.list', method: 'GET', permission: 'settings.manage' }, req, async (ctx) => {
    const rows = await listApiKeys(getDb(), ctx!);
    return { data: rows };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'settings.api-keys.create', method: 'POST', permission: 'settings.manage' }, req, async (ctx) => {
    const body = await req.json();
    const input = CreateKeySchema.parse(body);
    const created = await createApiKey(getDb(), ctx!, input);
    return { status: 201, data: created };
  });
}
