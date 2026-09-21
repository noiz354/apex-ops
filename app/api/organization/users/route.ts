import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { ROLES6, createUser, listUsers } from '@/lib/services/org-service';

const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().min(2).max(100),
  title: z.string().max(100).optional(),
  role: z.enum(ROLES6),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'org.users.list', method: 'GET', permission: 'org.read' }, req, async (ctx) => {
    const data = await listUsers(getDb(), ctx!);
    return { data };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'org.users.create', method: 'POST', permission: 'org.manage' }, req, async (ctx) => {
    const body = await req.json();
    const input = CreateUserSchema.parse(body);
    const created = await createUser(getDb(), ctx!, input);
    return { status: 201, data: created };
  });
}
