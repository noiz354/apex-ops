import type { NextRequest } from 'next/server';
import { withRoute } from '@/lib/api/http';
import { getRedMetrics } from '@/lib/telemetry/metrics';

export async function GET(req: NextRequest) {
  return withRoute({ op: 'telemetry.metrics', method: 'GET', permission: 'audit.read' }, req, async () => {
    const metrics = getRedMetrics();
    return { data: metrics };
  });
}
