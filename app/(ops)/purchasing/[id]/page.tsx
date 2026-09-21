import { notFound } from 'next/navigation';
import { PurchaseDetail, type PurchaseTab } from '@/components/purchasing/PurchaseDetail';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.purchaseOrder },
    { id: 'PO-2026-0302' },
    { id: 'PO-2026-0285' },
    { id: 'PO-2026-0315' },
    { id: 'PR-2026-0314' },
    { id: 'PR-2026-0309' },
    { id: 'PR-2026-0295' },
  ];
}

const TABS: PurchaseTab[] = ['review', 'receiving', 'match', 'signatures'];

export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  if (!/^(PO|PR)-\d{4}-\d{4}$/.test(id)) notFound();

  const { tab } = await searchParams;
  const initialTab: PurchaseTab = TABS.includes(tab as PurchaseTab) ? (tab as PurchaseTab) : 'review';

  return <PurchaseDetail initialTab={initialTab} docId={id} />;
}
