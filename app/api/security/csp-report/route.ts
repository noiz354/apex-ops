import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { log } from '@/lib/log';

interface CspReportBody {
  'violated-directive'?: string;
  effectiveDirective?: string;
  'blocked-uri'?: string;
  blockedURI?: string;
  'document-uri'?: string;
  documentURL?: string;
  'original-policy'?: string;
}

export async function POST(req: NextRequest) {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (text.length > 8192) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
  }
  const envelope = (parsed as Record<string, unknown> | null) ?? null;
  const body = (envelope?.['csp-report'] ?? envelope) as CspReportBody | null;

  log('warn', 'csp_violation_report', {
    directive: body?.effectiveDirective ?? body?.['violated-directive'] ?? null,
    blockedUri: (body?.blockedURI ?? body?.['blocked-uri'] ?? '').slice(0, 300),
    documentUri: (body?.documentURL ?? body?.['document-uri'] ?? '').slice(0, 300),
  });

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
