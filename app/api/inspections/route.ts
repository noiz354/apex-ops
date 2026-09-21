import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createInspection, listInspections } from '@/lib/services/inspection-service';

const CreateInspectionSchema = z.object({
  title: z.string().min(3).max(200),
  auditorName: z.string().min(2).max(100).default('Field Inspector'),
});

export async function GET(req: NextRequest) {
  return withRoute(
    { op: 'inspections.list', method: 'GET', permission: 'assets.read' },
    req,
    async (ctx) => {
      const rows = await listInspections(getDb(), ctx!);
      return { data: { rows, total: rows.length } };
    }
  );
}

export async function POST(req: NextRequest) {
  return withRoute(
    { op: 'inspections.create', method: 'POST', permission: 'assets.read' },
    req,
    async (ctx) => {
      const body = CreateInspectionSchema.parse(await req.json());
      const row = await createInspection(
        getDb(),
        ctx!,
        { title: body.title, auditorName: body.auditorName },
      );
      return { status: 201, data: row };
    }
  );
}
