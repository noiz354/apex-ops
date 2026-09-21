import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { evidence } from '@/db/schema';
import { getSessionContext } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { log, newRequestId } from '@/lib/log';

const EVIDENCE_ROOT = process.env.EVIDENCE_DIR || '.data/evidence';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
  const requestId = newRequestId();
  const { id, evidenceId } = await params;

  const ctx = await getSessionContext().catch(() => null);
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in required', requestId } },
      { status: 401 },
    );
  }
  if (!can(ctx.role, 'wo.read')) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: `Role '${ctx.role}' lacks permission 'wo.read'`, requestId } },
      { status: 403 },
    );
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(evidence)
    .where(and(
      eq(evidence.organizationId, ctx.orgId),
      eq(evidence.workOrderNumber, id),
      eq(evidence.id, decodeURIComponent(evidenceId)),
    ))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { ok: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found', requestId } },
      { status: 404 },
    );
  }

  const root = resolve(join(EVIDENCE_ROOT, ctx.orgId)) + sep;
  const resolved = resolve(join(EVIDENCE_ROOT, ctx.orgId), row.filePath.split('/').pop() || '');
  if (!resolved.startsWith(root)) {
    log('warn', 'evidence_path_escape', { requestId, orgId: ctx.orgId, evidenceId: row.id });
    return NextResponse.json(
      { ok: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found', requestId } },
      { status: 404 },
    );
  }

  let buf: Buffer;
  try {
    buf = await readFile(resolved);
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'EVIDENCE_FILE_MISSING', message: 'Evidence record exists but the stored file is missing', requestId } },
      { status: 410 },
    );
  }

  const digest = createHash('sha256').update(buf).digest('hex');
  if (digest !== row.sha256Hash) {
    log('error', 'evidence_corrupt', { requestId, orgId: ctx.orgId, evidenceId: row.id });
    return NextResponse.json(
      { ok: false, error: { code: 'EVIDENCE_CORRUPT', message: 'Stored file failed integrity verification', requestId } },
      { status: 500 },
    );
  }

  log('info', 'api_request', { requestId, op: 'wo.evidence.download', method: 'GET', status: 200, userId: ctx.userId, orgId: ctx.orgId });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': row.mimeType,
      'Content-Length': String(buf.length),
      'Content-Disposition': `inline; filename="${row.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'x-request-id': requestId,
    },
  });
}
