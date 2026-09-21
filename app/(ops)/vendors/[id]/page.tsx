import { notFound } from 'next/navigation';
import { VendorDetail } from '@/components/vendors/VendorDetail';
import { CANON } from '@/lib/canon';

export function generateStaticParams() {
  return [
    { id: CANON.vendorSlug },
    { id: 'abb-grid-power-automation' },
    { id: 'siemens-building-technologies' },
    { id: 'johnson-controls-tyco-fire' },
    { id: 'grainger-industrial-supply' },
  ];
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{3,50}$/.test(id)) notFound();

  return <VendorDetail vendorSlug={id} />;
}
