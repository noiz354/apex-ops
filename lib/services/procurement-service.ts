import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '../../db/client';
import { auditEvents, goodsReceiptNotes, invoiceLineItems, invoices, poLineItems, purchaseOrders } from '../../db/schema';
import type { AuthContext } from '../auth/session';
import { DomainError, notFound } from '../domain/errors';
import { requestHash, withIdempotency } from './idempotency';
import { mutateStock } from './inventory-service';
import { nextNumber } from './sequence';

export interface PurchaseLineItem {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  priceFormatted: string;
  totalFormatted: string;
}

export interface PurchaseDocument {
  number: string;
  kind: 'PO' | 'PR';
  title: string;
  vendorSlug: string | null;
  totalCents: number;
  totalFormatted: string;
  status: string;
  slaDueAt: string | null;
  lineItems: PurchaseLineItem[];
  createdAt: string;
}

export interface GrnRow {
  number: string;
  poNumber: string;
  waybill: string;
  dockLocation: string;
  status: 'RECEIVED' | 'DISPUTED';
  verifiedBy: string;
  createdAt: string;
}

export async function listPurchases(
  db: Db,
  ctx: AuthContext,
  filter?: { kind?: 'PO' | 'PR'; status?: string; number?: string; limit?: number; offset?: number },
): Promise<PurchaseDocument[]> {
  const conditions = [eq(purchaseOrders.organizationId, ctx.orgId)];
  if (filter?.kind) conditions.push(eq(purchaseOrders.kind, filter.kind));
  if (filter?.status) conditions.push(eq(purchaseOrders.status, filter.status));
  if (filter?.number) conditions.push(eq(purchaseOrders.number, filter.number));

  let query = db
    .select()
    .from(purchaseOrders)
    .where(and(...conditions))
    .orderBy(desc(purchaseOrders.createdAt))
    .$dynamic();

  if (filter?.offset) {
    query = query.offset(filter.offset);
  }
  if (filter?.limit) {
    query = query.limit(filter.limit);
  }

  const docs = await query;

  const results: PurchaseDocument[] = [];
  for (const doc of docs) {
    const lines = await db
      .select()
      .from(poLineItems)
      .where(and(
        eq(poLineItems.organizationId, ctx.orgId),
        eq(poLineItems.documentNumber, doc.number),
      ));

    results.push({
      number: doc.number,
      kind: doc.kind as 'PO' | 'PR',
      title: doc.title,
      vendorSlug: doc.vendorSlug,
      totalCents: doc.totalCents,
      totalFormatted: `$${(doc.totalCents / 100).toFixed(2)}`,
      status: doc.status,
      slaDueAt: doc.slaDueAt ? doc.slaDueAt.toISOString() : null,
      lineItems: lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        priceFormatted: `$${(l.unitPriceCents / 100).toFixed(2)}`,
        totalFormatted: `$${((l.unitPriceCents * l.quantity) / 100).toFixed(2)}`,
      })),
      createdAt: doc.createdAt.toISOString(),
    });
  }

  return results;
}

export async function getPurchase(
  db: Db,
  ctx: AuthContext,
  number: string,
): Promise<PurchaseDocument> {
  const docs = await db
    .select()
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.organizationId, ctx.orgId),
      eq(purchaseOrders.number, number),
    ))
    .limit(1);

  if (!docs[0]) throw notFound('PURCHASE_DOCUMENT', number);
  const doc = docs[0];

  const lines = await db
    .select()
    .from(poLineItems)
    .where(and(
      eq(poLineItems.organizationId, ctx.orgId),
      eq(poLineItems.documentNumber, doc.number),
    ));

  return {
    number: doc.number,
    kind: doc.kind as 'PO' | 'PR',
    title: doc.title,
    vendorSlug: doc.vendorSlug,
    totalCents: doc.totalCents,
    totalFormatted: `$${(doc.totalCents / 100).toFixed(2)}`,
    status: doc.status,
    slaDueAt: doc.slaDueAt ? doc.slaDueAt.toISOString() : null,
    lineItems: lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      priceFormatted: `$${(l.unitPriceCents / 100).toFixed(2)}`,
      totalFormatted: `$${((l.unitPriceCents * l.quantity) / 100).toFixed(2)}`,
    })),
    createdAt: doc.createdAt.toISOString(),
  };
}

export interface CreateRequisitionInput {
  title: string;
  vendorSlug?: string | null;
  lineItems: { sku: string; description: string; quantity: number; unitPriceCents: number }[];
}

export async function createRequisition(
  db: Db,
  ctx: AuthContext,
  input: CreateRequisitionInput,
): Promise<PurchaseDocument> {
  if (!input.lineItems || input.lineItems.length === 0) {
    throw new DomainError(400, 'LINE_ITEMS_REQUIRED', 'A requisition needs at least one line item');
  }
  const year = new Date().getFullYear();
  return db.transaction(async (tx) => {
    const number = await nextNumber(tx, ctx.orgId, 'PR', year);
    const totalCents = input.lineItems.reduce((acc, it) => acc + it.quantity * it.unitPriceCents, 0);

    const [pr] = await tx
      .insert(purchaseOrders)
      .values({
        organizationId: ctx.orgId,
        number,
        kind: 'PR',
        title: input.title.slice(0, 200),
        vendorSlug: input.vendorSlug ?? null,
        totalCents,
        status: 'PENDING_APPROVAL',
      })
      .returning();

    for (let i = 0; i < input.lineItems.length; i++) {
      const it = input.lineItems[i];
      await tx.insert(poLineItems).values({
        organizationId: ctx.orgId,
        id: `${number}-L${i + 1}`,
        documentNumber: number,
        sku: it.sku,
        description: it.description,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
      });
    }

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'PR_CREATE',
      entityType: 'purchase_requisition',
      entityId: number,
      after: { title: pr.title, totalCents },
    });

    return getPurchase(tx as unknown as Db, ctx, number);
  });
}

export interface PostGrnInput {
  poNumber: string;
  grnNumber?: string;
  waybill: string;
  dockLocation?: string;
  skuReceived: string;
  qtyReceived: number;
}

export async function postGoodsReceipt(
  db: Db,
  ctx: AuthContext,
  input: PostGrnInput,
  opts: { idempotencyKey?: string | null; requestId?: string; stepUpAt?: string | null } = {},
): Promise<GrnRow> {
  if (!opts.stepUpAt) {
    throw new DomainError(403, 'STEP_UP_REQUIRED',
      'Posting a goods receipt requires a verified approver code (step-up TOTP)');
  }
  const exec = async (tx: Tx): Promise<GrnRow> => {
    const [po] = await tx
      .select({ number: purchaseOrders.number, kind: purchaseOrders.kind })
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, input.poNumber),
      ))
      .limit(1);
    if (!po) throw notFound('PURCHASE_DOCUMENT', input.poNumber);
    if (po.kind !== 'PO') {
      throw new DomainError(422, 'WRONG_DOCUMENT_KIND',
        `Goods receipt requires a PO — ${input.poNumber} is a ${po.kind}`);
    }

    const year = new Date().getFullYear();
    const grnId = input.grnNumber || await nextNumber(tx, ctx.orgId, 'GRN', year);

    const existing = await tx
      .select()
      .from(goodsReceiptNotes)
      .where(and(
        eq(goodsReceiptNotes.organizationId, ctx.orgId),
        eq(goodsReceiptNotes.number, grnId),
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new DomainError(409, 'DUPLICATE_RECEIPT',
          `GRN ${grnId} already verified on dock`);
    }

    const [grn] = await tx
      .insert(goodsReceiptNotes)
      .values({
        organizationId: ctx.orgId,
        number: grnId,
        poNumber: input.poNumber,
        waybill: input.waybill,
        dockLocation: input.dockLocation || 'Dock Bay 02',
        skuReceived: input.skuReceived,
        qtyReceived: input.qtyReceived,
        status: 'RECEIVED',
        verifiedBy: ctx.name,
      })
      .returning();

    await mutateStock(
      tx as unknown as Db,
      ctx,
      {
        sku: input.skuReceived,
        type: 'RECEIVE',
        qty: input.qtyReceived,
        refNumber: input.poNumber,
        reason: `Dock Bay GRN ${grnId} receipt from ${input.poNumber}`,
      },
      { stepUpAt: opts.stepUpAt ?? undefined, requestId: opts.requestId ?? undefined },
    );

    await tx
      .update(purchaseOrders)
      .set({ status: 'RECEIVED' })
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, input.poNumber),
      ));

    return {
      number: grn.number,
      poNumber: grn.poNumber,
      waybill: grn.waybill,
      dockLocation: grn.dockLocation ?? input.dockLocation ?? 'Dock Bay 02',
      status: grn.status as GrnRow['status'],
      verifiedBy: grn.verifiedBy,
      createdAt: grn.createdAt.toISOString(),
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash(input);
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'procurement.grn', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export type PurchaseDecision = 'APPROVE' | 'REJECT';

export interface DecidePurchaseInput {
  decision: PurchaseDecision;
  reason?: string;
}

export interface DecisionRow {
  number: string;
  kind: 'PO' | 'PR';
  status: string;
  decidedBy: string;
  decidedAt: string;
  reason: string | null;
}

const DECIDABLE_FROM = ['PENDING_APPROVAL', 'CREATED'];
const TERMINAL_DECISION = ['APPROVED', 'DISPATCHED', 'RECEIVED', 'REJECTED'];

export async function decidePurchase(
  db: Db,
  ctx: AuthContext,
  number: string,
  input: DecidePurchaseInput,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<DecisionRow> {
  if (input.decision === 'REJECT' && !(input.reason ?? '').trim()) {
    throw new DomainError(400, 'REASON_REQUIRED', 'Rejecting a purchase document requires a reason');
  }

  const exec = async (tx: Tx): Promise<DecisionRow> => {
    const [doc] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, number),
      ))
      .limit(1);
    if (!doc) throw notFound('PURCHASE_DOCUMENT', number);
    if (TERMINAL_DECISION.includes(doc.status)) {
      throw new DomainError(409, 'ALREADY_DECIDED',
        `${number} is already ${doc.status} — decision is terminal`);
    }
    if (!DECIDABLE_FROM.includes(doc.status)) {
      throw new DomainError(409, 'NOT_DECIDABLE',
        `${number} is ${doc.status} — only PENDING_APPROVAL or CREATED documents can be decided`);
    }

    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const reason = input.decision === 'REJECT' ? input.reason!.trim().slice(0, 300) : null;
    const decidedAt = new Date().toISOString();

    await tx
      .update(purchaseOrders)
      .set({ status })
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, number),
      ));

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: input.decision === 'APPROVE' ? 'PO_APPROVE' : 'PO_REJECT',
      entityType: 'purchase_document',
      entityId: number,
      requestId: opts.requestId ?? null,
      before: { status: doc.status },
      after: { status, reason, decidedBy: ctx.name, decidedAt },
    });

    return {
      number: doc.number,
      kind: doc.kind as 'PO' | 'PR',
      status,
      decidedBy: ctx.name,
      decidedAt,
      reason,
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash({ number, ...input });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'procurement.decision', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}

export interface ConvertPrRow {
  prNumber: string;
  poNumber: string;
  alreadyConverted: boolean;
}

export async function convertPrToPo(
  db: Db,
  ctx: AuthContext,
  prNumber: string,
  opts: { idempotencyKey?: string | null; requestId?: string } = {},
): Promise<{ pr: ConvertPrRow; po: PurchaseDocument }> {
  const exec = async (tx: Tx): Promise<{ pr: ConvertPrRow; po: PurchaseDocument }> => {
    const [doc] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, prNumber),
      ))
      .limit(1);
    if (!doc) throw notFound('PURCHASE_DOCUMENT', prNumber);
    if (doc.kind !== 'PR') {
      throw new DomainError(409, 'NOT_A_REQUISITION',
        `${prNumber} is a ${doc.kind} — only PR documents can be converted to PO`);
    }
    if (doc.status === 'CONVERTED') {
      const trail = await tx
        .select()
        .from(auditEvents)
        .where(and(
          eq(auditEvents.organizationId, ctx.orgId),
          eq(auditEvents.entityId, prNumber),
          eq(auditEvents.action, 'PR_CONVERT'),
        ))
        .orderBy(desc(auditEvents.ts))
        .limit(1);
      const poNumber = (trail[0]?.after as unknown as { poNumber?: string } | null)?.poNumber;
      if (!poNumber) {
        throw new DomainError(409, 'CONVERSION_ORPHAN',
          `${prNumber} is CONVERTED but no PO link was recorded`);
      }
      return {
        pr: { prNumber, poNumber, alreadyConverted: true },
        po: await getPurchase(tx as unknown as Db, ctx, poNumber),
      };
    }
    if (doc.status !== 'APPROVED') {
      throw new DomainError(409, 'PR_NOT_APPROVED',
        `${prNumber} is ${doc.status} — only APPROVED requisitions can be converted (approve first)`);
    }

    const year = new Date().getFullYear();
    const poNumber = await nextNumber(tx, ctx.orgId, 'PO', year);

    await tx.insert(purchaseOrders).values({
      organizationId: ctx.orgId,
      number: poNumber,
      kind: 'PO',
      title: doc.title,
      vendorSlug: doc.vendorSlug,
      totalCents: doc.totalCents,
      status: 'APPROVED',
    });

    const lines = await tx
      .select()
      .from(poLineItems)
      .where(and(
        eq(poLineItems.organizationId, ctx.orgId),
        eq(poLineItems.documentNumber, prNumber),
      ));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await tx.insert(poLineItems).values({
        organizationId: ctx.orgId,
        id: `${poNumber}-L${i + 1}`,
        documentNumber: poNumber,
        sku: l.sku,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      });
    }

    await tx
      .update(purchaseOrders)
      .set({ status: 'CONVERTED' })
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, prNumber),
      ));

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'PR_CONVERT',
      entityType: 'purchase_document',
      entityId: prNumber,
      requestId: opts.requestId ?? null,
      before: { status: 'APPROVED' },
      after: { status: 'CONVERTED', poNumber },
    });

    return {
      pr: { prNumber, poNumber, alreadyConverted: false },
      po: await getPurchase(tx as unknown as Db, ctx, poNumber),
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash({ number: prNumber });
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'procurement.convert', hash, async () => {
      const body = await exec(tx);
      return { status: 200, body };
    });
    return res.body;
  });
}


export interface InvoiceLineInput {
  sku: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface RegisterInvoiceInput {
  invoiceNumber: string;
  poNumber: string;
  vendorSlug?: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTerms?: string;
  lines: InvoiceLineInput[];
}

export interface MatchLineResult {
  sku: string;
  description: string;
  poQty: number;
  grnQty: number;
  invQty: number;
  unitPriceCents: number;
  invUnitPriceCents: number;
  matched: boolean;
  variance: string;
}

export interface MatchResult {
  status: 'MATCHED' | 'DISPUTED';
  paymentHold: boolean;
  lines: MatchLineResult[];
  holdCents: number;
  holdFormatted: string;
}

export interface InvoiceDossier {
  number: string;
  poNumber: string;
  vendorSlug: string | null;
  invoiceDate: string;
  dueDate: string | null;
  paymentTerms: string;
  status: 'PENDING' | 'MATCHED' | 'DISPUTED';
  paymentHold: boolean;
  lines: MatchLineResult[];
  holdCents: number;
  holdFormatted: string;
  auditTrailId: number | null;
  grnCount: number;
  createdAt: string;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function computeMatch(
  poLines: { sku: string; description: string; quantity: number; unitPriceCents: number }[],
  grnQtyBySku: Map<string, number>,
  invLines: { sku: string; description: string; quantity: number; unitPriceCents: number }[],
): MatchResult {
  const lines: MatchLineResult[] = [];
  let holdCents = 0;
  const seenInv = new Set<string>();

  for (const po of poLines) {
    const grnQty = grnQtyBySku.get(po.sku) ?? 0;
    const inv = invLines.find((l) => l.sku === po.sku);
    if (inv) seenInv.add(inv.sku);
    const invQty = inv?.quantity ?? 0;
    const invPrice = inv?.unitPriceCents ?? po.unitPriceCents;
    const problems: string[] = [];
    let lineHold = 0;
    if (!inv) {
      problems.push('not invoiced');
      lineHold += po.quantity * po.unitPriceCents;
    } else {
      if (invQty !== po.quantity) {
        problems.push(`invoiced ${invQty}, ordered ${po.quantity}`);
        lineHold += Math.abs(invQty - po.quantity) * invPrice;
      }
      if (invPrice !== po.unitPriceCents) {
        problems.push(`price ${money(invPrice)}/unit vs PO ${money(po.unitPriceCents)}/unit`);
        lineHold += invQty * Math.abs(invPrice - po.unitPriceCents);
      }
    }
    if (grnQty !== po.quantity) {
      const short = po.quantity - grnQty;
      problems.push(short > 0
        ? `${short} pcs pending receipt`
        : `${-short} pcs over-received`);
      lineHold += Math.max(0, Math.min(invQty, po.quantity) - Math.min(grnQty, po.quantity)) * invPrice;
    }
    const matched = problems.length === 0;
    holdCents += lineHold;
    lines.push({
      sku: po.sku,
      description: po.description,
      poQty: po.quantity,
      grnQty,
      invQty,
      unitPriceCents: po.unitPriceCents,
      invUnitPriceCents: invPrice,
      matched,
      variance: matched ? '$0.00 (0.0%)' : `${problems.join('; ')} (${money(lineHold)} hold)`,
    });
  }

  for (const inv of invLines) {
    if (seenInv.has(inv.sku)) continue;
    const lineHold = inv.quantity * inv.unitPriceCents;
    holdCents += lineHold;
    lines.push({
      sku: inv.sku,
      description: inv.description,
      poQty: 0,
      grnQty: grnQtyBySku.get(inv.sku) ?? 0,
      invQty: inv.quantity,
      unitPriceCents: 0,
      invUnitPriceCents: inv.unitPriceCents,
      matched: false,
      variance: `not on PO (${money(lineHold)} hold)`,
    });
  }

  const disputed = lines.some((l) => !l.matched);
  return {
    status: disputed ? 'DISPUTED' : 'MATCHED',
    paymentHold: disputed,
    lines,
    holdCents,
    holdFormatted: money(holdCents),
  };
}

export async function registerInvoice(
  db: Db,
  ctx: AuthContext,
  input: RegisterInvoiceInput,
  opts: { idempotencyKey?: string | null; requestId?: string; stepUpAt?: string | null } = {},
): Promise<InvoiceDossier> {
  if (!opts.stepUpAt) {
    throw new DomainError(403, 'STEP_UP_REQUIRED',
      'Registering a vendor invoice requires a verified approver code (step-up TOTP)');
  }
  if (!/^INV-\d{4}-\d{4}$/.test(input.invoiceNumber)) {
    throw new DomainError(422, 'INVALID_INVOICE_NUMBER',
      `Invoice number must look like INV-2026-1188 — got ${input.invoiceNumber}`);
  }
  if (!input.lines || input.lines.length === 0) {
    throw new DomainError(422, 'INVOICE_LINES_REQUIRED', 'Invoice needs at least one line item');
  }
  for (const [i, l] of input.lines.entries()) {
    if (!l.sku || !Number.isInteger(l.quantity) || l.quantity <= 0 || !Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) {
      throw new DomainError(422, 'INVALID_INVOICE_LINE', `Line ${i + 1}: sku + positive integer qty + non-negative unitPriceCents required`);
    }
  }

  const exec = async (tx: Tx): Promise<InvoiceDossier> => {
    const [po] = await tx
      .select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.organizationId, ctx.orgId),
        eq(purchaseOrders.number, input.poNumber),
      ))
      .limit(1);
    if (!po) throw notFound('PURCHASE_DOCUMENT', input.poNumber);
    if (po.kind !== 'PO') {
      throw new DomainError(422, 'WRONG_DOCUMENT_KIND',
        `Invoice matching requires a PO — ${input.poNumber} is a ${po.kind}`);
    }

    const [dup] = await tx
      .select({ number: invoices.number })
      .from(invoices)
      .where(and(
        eq(invoices.organizationId, ctx.orgId),
        eq(invoices.number, input.invoiceNumber),
      ))
      .limit(1);
    if (dup) {
      throw new DomainError(409, 'DUPLICATE_INVOICE',
        `Invoice ${input.invoiceNumber} already registered`);
    }

    const poLines = await tx
      .select()
      .from(poLineItems)
      .where(and(
        eq(poLineItems.organizationId, ctx.orgId),
        eq(poLineItems.documentNumber, input.poNumber),
      ));
    if (poLines.length === 0) {
      throw new DomainError(422, 'PO_HAS_NO_LINES',
        `PO ${input.poNumber} has no line items to match against`);
    }

    const grnRows = await tx
      .select()
      .from(goodsReceiptNotes)
      .where(and(
        eq(goodsReceiptNotes.organizationId, ctx.orgId),
        eq(goodsReceiptNotes.poNumber, input.poNumber),
      ));
    const grnQtyBySku = new Map<string, number>();
    for (const g of grnRows) {
      if (!g.skuReceived || g.qtyReceived == null) continue;
      grnQtyBySku.set(g.skuReceived, (grnQtyBySku.get(g.skuReceived) ?? 0) + g.qtyReceived);
    }

    const match = computeMatch(poLines, grnQtyBySku, input.lines);

    const [inv] = await tx
      .insert(invoices)
      .values({
        organizationId: ctx.orgId,
        number: input.invoiceNumber,
        poNumber: input.poNumber,
        vendorSlug: input.vendorSlug ?? po.vendorSlug ?? '',
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        paymentTerms: input.paymentTerms ?? 'NET_30',
        status: match.status,
        paymentHold: match.paymentHold,
      })
      .returning();

    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      await tx.insert(invoiceLineItems).values({
        organizationId: ctx.orgId,
        id: `${input.invoiceNumber}-L${i + 1}`,
        invoiceNumber: input.invoiceNumber,
        sku: l.sku,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      });
    }

    await tx.insert(auditEvents).values({
      organizationId: ctx.orgId,
      actorUserId: ctx.userId,
      actorName: ctx.name,
      action: 'INVOICE_REGISTER',
      entityType: 'vendor_invoice',
      entityId: input.invoiceNumber,
      requestId: opts.requestId ?? null,
      before: null,
      after: { poNumber: input.poNumber, lineCount: input.lines.length, status: match.status },
    });

    const [matchEvent] = await tx
      .insert(auditEvents)
      .values({
        organizationId: ctx.orgId,
        actorUserId: ctx.userId,
        actorName: ctx.name,
        action: match.status === 'MATCHED' ? 'MATCH_RECONCILED' : 'MATCH_DISPUTED',
        entityType: 'vendor_invoice',
        entityId: input.invoiceNumber,
        requestId: opts.requestId ?? null,
        before: null,
        after: {
          status: match.status,
          paymentHold: match.paymentHold,
          holdCents: match.holdCents,
          lines: match.lines.map((l) => ({
            sku: l.sku, poQty: l.poQty, grnQty: l.grnQty, invQty: l.invQty, matched: l.matched,
          })),
        },
      })
      .returning({ id: auditEvents.id });

    return {
      number: inv.number,
      poNumber: inv.poNumber,
      vendorSlug: inv.vendorSlug,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      paymentTerms: inv.paymentTerms,
      status: inv.status as InvoiceDossier['status'],
      paymentHold: inv.paymentHold,
      lines: match.lines,
      holdCents: match.holdCents,
      holdFormatted: match.holdFormatted,
      auditTrailId: matchEvent.id,
      grnCount: grnRows.length,
      createdAt: inv.createdAt.toISOString(),
    };
  };

  if (!opts.idempotencyKey) {
    return db.transaction(exec);
  }

  const hash = requestHash(input);
  return db.transaction(async (tx) => {
    const res = await withIdempotency(tx, ctx.orgId, opts.idempotencyKey, 'procurement.invoice', hash, async () => {
      const body = await exec(tx);
      return { status: 201, body };
    });
    return res.body;
  });
}

export async function listInvoices(
  db: Db,
  ctx: AuthContext,
  filter: { poNumber?: string; limit?: number } = {},
): Promise<{ number: string; poNumber: string; status: string; paymentHold: boolean; invoiceDate: string; createdAt: string }[]> {
  const conditions = [eq(invoices.organizationId, ctx.orgId)];
  if (filter.poNumber) conditions.push(eq(invoices.poNumber, filter.poNumber));
  const rows = await db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt))
    .limit(filter.limit ?? 50);
  return rows.map((r) => ({
    number: r.number,
    poNumber: r.poNumber,
    status: r.status,
    paymentHold: r.paymentHold,
    invoiceDate: r.invoiceDate,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getInvoiceDossier(
  db: Db,
  ctx: AuthContext,
  number: string,
): Promise<InvoiceDossier> {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(
      eq(invoices.organizationId, ctx.orgId),
      eq(invoices.number, number),
    ))
    .limit(1);
  if (!inv) throw notFound('VENDOR_INVOICE', number);

  const [invLines, poLines, grnRows, matchEvents] = await Promise.all([
    db.select().from(invoiceLineItems).where(and(
      eq(invoiceLineItems.organizationId, ctx.orgId),
      eq(invoiceLineItems.invoiceNumber, number),
    )),
    db.select().from(poLineItems).where(and(
      eq(poLineItems.organizationId, ctx.orgId),
      eq(poLineItems.documentNumber, inv.poNumber),
    )),
    db.select().from(goodsReceiptNotes).where(and(
      eq(goodsReceiptNotes.organizationId, ctx.orgId),
      eq(goodsReceiptNotes.poNumber, inv.poNumber),
    )),
    db.select({ id: auditEvents.id })
      .from(auditEvents)
      .where(and(
        eq(auditEvents.organizationId, ctx.orgId),
        eq(auditEvents.entityType, 'vendor_invoice'),
        eq(auditEvents.entityId, number),
        inArray(auditEvents.action, ['MATCH_RECONCILED', 'MATCH_DISPUTED']),
      ))
      .orderBy(desc(auditEvents.id))
      .limit(1),
  ]);

  const grnQtyBySku = new Map<string, number>();
  for (const g of grnRows) {
    if (!g.skuReceived || g.qtyReceived == null) continue;
    grnQtyBySku.set(g.skuReceived, (grnQtyBySku.get(g.skuReceived) ?? 0) + g.qtyReceived);
  }
  const match = computeMatch(poLines, grnQtyBySku, invLines);

  return {
    number: inv.number,
    poNumber: inv.poNumber,
    vendorSlug: inv.vendorSlug,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    paymentTerms: inv.paymentTerms,
    status: inv.status as InvoiceDossier['status'],
    paymentHold: inv.paymentHold,
    lines: match.lines,
    holdCents: match.holdCents,
    holdFormatted: match.holdFormatted,
    auditTrailId: matchEvents[0]?.id ?? null,
    grnCount: grnRows.length,
    createdAt: inv.createdAt.toISOString(),
  };
}
