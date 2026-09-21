import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import {
  RETENTION_DIGEST_NOTE,
  RETENTION_DIGEST_SUNSET,
  generateRetentionDigest,
} from '@/lib/services/retention-service';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'retention.digest', method: 'GET', permission: 'wo.read' }, req, async (ctx) => {
    const digest = await generateRetentionDigest(getDb(), ctx!.orgId);
    return {
      data: {
        ...digest,
        deprecated: true,
        sunset: RETENTION_DIGEST_SUNSET,
        note: RETENTION_DIGEST_NOTE,
      },
    };
  });
}
