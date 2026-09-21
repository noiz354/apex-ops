import type { NextRequest } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { workOrders } from '@/db/schema';
import { addEvidence } from '@/lib/services/task-service';
import { DomainError, notFound } from '@/lib/domain/errors';


const MAX_BYTES = 10 * 1024 * 1024;
const EVIDENCE_ROOT = process.env.EVIDENCE_DIR || '.data/evidence';

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip ASCII control chars from filenames (path/terminal safety).
  const clean = name.replace(/[\\/:*?"<>|-]+/g, '-').trim();
  return clean.slice(0, 120) || 'evidence.bin';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withRoute({ op: 'wo.evidence.upload', method: 'POST', permission: 'wo.transition' }, req, async (ctx) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new DomainError(400, 'VALIDATION_ERROR', 'Expected multipart/form-data with a file field');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new DomainError(400, 'VALIDATION_ERROR', 'Multipart field "file" is required');
    }
    const taskIdRaw = form.get('taskId');
    const taskId = typeof taskIdRaw === 'string' && taskIdRaw.trim() ? taskIdRaw.trim() : null;

    const wo = await getDb()
      .select({ number: workOrders.number })
      .from(workOrders)
      .where(and(eq(workOrders.organizationId, ctx!.orgId), eq(workOrders.number, id)))
      .limit(1);
    if (!wo[0]) throw notFound('WORK_ORDER', id);

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) throw new DomainError(400, 'VALIDATION_ERROR', 'Empty file');
    if (buf.length > MAX_BYTES) {
      throw new DomainError(413, 'EVIDENCE_TOO_LARGE', `File exceeds the 10 MB evidence limit (${Math.round(buf.length / 1024 / 1024)} MB)`);
    }

    const mimeType = sniffImageMime(buf);
    if (!mimeType) {
      throw new DomainError(415, 'EVIDENCE_UNSUPPORTED_MEDIA', 'Only JPEG/PNG/WebP image evidence is accepted (magic-byte verified)');
    }

    const sha256Hash = createHash('sha256').update(buf).digest('hex');
    const clientHash = form.get('sha256Hash');
    if (typeof clientHash === 'string' && clientHash.trim() && clientHash.trim() !== sha256Hash) {
      throw new DomainError(422, 'EVIDENCE_HASH_MISMATCH', 'Client-supplied SHA-256 does not match the received bytes — re-upload the file');
    }

    const fileName = sanitizeFileName(file.name || 'evidence');
    const dir = resolve(join(EVIDENCE_ROOT, ctx!.orgId));
    await mkdir(dir, { recursive: true });
    const storedName = `${sha256Hash.slice(0, 16)}-${fileName}`;
    await writeFile(join(dir, storedName), buf);
    const filePath = `${EVIDENCE_ROOT}/${ctx!.orgId}/${storedName}`;

    const ev = await addEvidence(getDb(), ctx!, {
      workOrderNumber: id,
      taskId,
      fileName,
      filePath,
      mimeType,
      fileSize: buf.length,
      sha256Hash,
    });
    return { status: 201, data: ev };
  });
}
