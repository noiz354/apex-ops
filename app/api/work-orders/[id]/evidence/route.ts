import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { addEvidence, listWoEvidence } from '@/lib/services/task-service';

const AddEvidenceSchema = z.object({
  taskId: z.string().nullish(),
  fileName: z.string().min(1).max(255),
  filePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  sha256Hash: z.string().min(1).max(64),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'wo.evidence.list', method: 'GET', permission: 'wo.read' }, req, async (ctx) => {
    const list = await listWoEvidence(getDb(), ctx!, id);
    return { data: list };
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'wo.evidence.add', method: 'POST', permission: 'wo.transition' }, req, async (ctx) => {
    const body = await req.json();
    const input = AddEvidenceSchema.parse(body);
    const ev = await addEvidence(getDb(), ctx!, {
      workOrderNumber: id,
      taskId: input.taskId,
      fileName: input.fileName,
      filePath: input.filePath,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      sha256Hash: input.sha256Hash,
    });
    return { status: 201, data: ev };
  });
}
