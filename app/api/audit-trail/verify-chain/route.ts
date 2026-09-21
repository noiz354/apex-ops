import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { verifyAuditHashChain } from '@/lib/services/audit-service';

export async function POST(req: NextRequest) {
  return withRoute(
    { op: 'audit.verify_chain', method: 'POST', permission: 'audit.read' },
    req,
    async (ctx) => {
      const result = await verifyAuditHashChain(getDb(), ctx!);
      return {
        data: result,
      };
    },
  );
}
