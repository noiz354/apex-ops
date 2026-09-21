import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { ROLES6, updateUser } from '@/lib/services/org-service';

const UpdateUserSchema = z.object({
  role: z.enum(ROLES6).optional(),
  title: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'org.users.update', method: 'PATCH', permission: 'org.manage' }, req, async (ctx) => {
    const body = await req.json();
    const input = UpdateUserSchema.parse(body);
    const data = await updateUser(getDb(), ctx!, id, input);
    return { data };
  });
}
