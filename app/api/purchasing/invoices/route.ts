import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/http';
import { getDb } from '@/db/client';
import { listInvoices, registerInvoice } from '@/lib/services/procurement-service';
import { verifyStepUpCode } from '@/lib/services/inventory-service';

const InvoiceLineSchema = z.object({
  sku: z.string().min(1),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});

const RegisterInvoiceSchema = z.object({
  invoiceNumber: z.string().regex(/^INV-\d{4}-\d{4}$/, 'Use vendor format INV-YYYY-NNNN'),
  poNumber: z.string().min(1),
  vendorSlug: z.string().max(80).nullish().transform((v) => v ?? undefined),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish().transform((v) => v ?? undefined),
  paymentTerms: z.string().max(20).nullish().transform((v) => v ?? undefined),
  lines: z.array(InvoiceLineSchema).min(1),
  stepUpCode: z.string().regex(/^\d{6}$/, 'Enter the 6-digit approver code from your authenticator app'),
});

export async function GET(req: NextRequest) {
  return withRoute({ op: 'invoice.list', method: 'GET', permission: 'po.read' }, req, async (ctx) => {
    const poNumber = req.nextUrl.searchParams.get('poNumber') ?? undefined;
    const rows = await listInvoices(getDb(), ctx!, { poNumber });
    return { status: 200, data: { rows } };
  });
}

export async function POST(req: NextRequest) {
  return withRoute({ op: 'invoice.register', method: 'POST', permission: 'po.approve' }, req, async (ctx, requestId) => {
    const body = await req.json();
    const input = RegisterInvoiceSchema.parse(body);
    const stepUpAt = await verifyStepUpCode(getDb(), ctx!, input.stepUpCode);
    const dossier = await registerInvoice(
      getDb(),
      ctx!,
      input,
      { idempotencyKey: req.headers.get('idempotency-key'), requestId, stepUpAt },
    );
    return { status: 201, data: dossier };
  });
}
