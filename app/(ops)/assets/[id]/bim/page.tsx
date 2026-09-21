import { notFound } from 'next/navigation';
import { AssetBim } from '@/components/assets/AssetBim';
import { CANON, ID_FORMATS } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.assetSeal },
    { id: 'AST-HVAC-001' },
    { id: 'AST-ELEC-002' },
    { id: 'AST-FIRE-003' },
  ];
}

export default async function AssetBimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_FORMATS.asset.test(id)) notFound();

  return <AssetBim assetId={id} />;
}
