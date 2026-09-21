import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { addWoTask, listWoTasks, updateWoTask } from '@/lib/services/task-service';

const UpdateTaskSchema = z.object({
  action: z.literal('update').default('update'),
  taskId: z.string().min(1),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']),
});

const AddTaskSchema = z.object({
  action: z.literal('add'),
  title: z.string().min(3).max(160),
  instruction: z.string().max(500).nullish(),
  requiresPhoto: z.boolean().nullish(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'wo.tasks.list', method: 'GET', permission: 'wo.read' }, req, async (ctx) => {
    const tasks = await listWoTasks(getDb(), ctx!, id);
    return { data: tasks };
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'wo.tasks.update', method: 'POST', permission: 'wo.transition' }, req, async (ctx) => {
    const body = await req.json();
    if (typeof body === 'object' && body !== null && (body as { action?: unknown }).action === 'add') {
      const input = AddTaskSchema.parse(body);
      const created = await addWoTask(getDb(), ctx!, {
        woNumber: id,
        title: input.title,
        instruction: input.instruction ?? null,
        requiresPhoto: input.requiresPhoto ?? false,
      });
      return { status: 201, data: created };
    }
    const input = UpdateTaskSchema.parse(body);
    const updated = await updateWoTask(getDb(), ctx!, {
      taskId: input.taskId,
      woNumber: id,
      status: input.status,
    });
    return { data: updated };
  });
}
