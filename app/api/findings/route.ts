import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { createFinding, listFindings } from '@/lib/services/inspection-service';

const UiSeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const SEVERITY_MAP = {
  CRITICAL: 'CRITICAL',
  HIGH: 'MAJOR',
  MEDIUM: 'MODERATE',
  LOW: 'MINOR',
} as const;

const CreateFindingSchema = z.object({
  title: z.string().min(3),
  assetCode: z.string().min(3),
  severity: UiSeveritySchema,
  inspectionNumber: z.string().max(32).nullish(),
  zone: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
});

export async function GET(req: NextRequest) {
  return withRoute(
    { op: 'findings.list', method: 'GET', permission: 'finding.read' },
    req,
    async (ctx) => {
      const rows = await listFindings(getDb(), ctx!);
      return {
        data: {
          rows,
          total: rows.length,
        },
      };
    }
  );
}

export async function POST(req: NextRequest) {
  return withRoute(
    { op: 'findings.create', method: 'POST', permission: 'finding.create' },
    req,
    async (ctx, requestId) => {
      const body = CreateFindingSchema.parse(await req.json());
      const row = await createFinding(
        getDb(),
        ctx!,
        {
          title: body.title,
          severity: SEVERITY_MAP[body.severity],
          inspectionNumber: body.inspectionNumber ?? null,
          assetCode: body.assetCode,
          extra: { description: body.description ?? null, zone: body.zone ?? null },
        },
        { idempotencyKey: req.headers.get('idempotency-key'), requestId },
      );

      return {
        status: 201,
        data: {
          id: row.number,
          ...row,
          capturedAt: row.createdAt,
          tenantId: ctx!.orgId,
        },
      };
    }
  );
}
