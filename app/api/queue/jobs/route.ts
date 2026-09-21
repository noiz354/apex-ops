import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { DomainError, withRoute } from '@/lib/api/http';
import {
  enqueueJob,
  executeQueueCycle,
  listJobs,
  retryJob,
  type JobStatus,
  type JobTopic,
} from '@/lib/queue/worker';

const EnqueueSchema = z.object({
  topic: z.enum(['pm_generator', 'vendor_notification', 'webhook_fanout', 'audit_merkle_batch']),
  payload: z.record(z.string(), z.unknown()),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'queue.jobs.list', method: 'GET', permission: 'audit.read' }, req, async (ctx) => {
    const { searchParams } = new URL(req.url);
    const topic = (searchParams.get('topic') as JobTopic) || undefined;
    const status = (searchParams.get('status') as JobStatus) || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;

    const jobs = listJobs({ orgId: ctx!.orgId, topic, status, limit });
    return { data: jobs };
  });
}

export async function POST(req: NextRequest) {
  return withRoute<unknown>({ op: 'queue.jobs.create', method: 'POST', permission: 'org.manage' }, req, async (ctx) => {
    const body = await req.json();

    if (body.action === 'run_cycle') {
      const summary = await executeQueueCycle();
      return { data: summary };
    }

    if (body.action === 'retry' && body.jobId) {
      const retried = retryJob(body.jobId);
      if (!retried) {
        throw new DomainError(404, 'JOB_NOT_FOUND', `queue job '${String(body.jobId)}' not found`);
      }
      return { data: retried };
    }

    const input = EnqueueSchema.parse(body);
    const job = enqueueJob(input.topic, ctx!.orgId, input.payload, input.maxAttempts);
    return { status: 201, data: job };
  });
}
