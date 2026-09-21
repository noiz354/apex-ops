import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { FindingDesk } from '@/components/field/FindingDesk';
import { CANON, ID_FORMATS } from '@/lib/canon';

export function generateStaticParams() {
  return [{ id: CANON.finding }, { id: 'FND-2026-0185' }, { id: 'FND-2026-0182' }];
}

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_FORMATS.finding.test(id)) notFound();
  if (id !== CANON.finding) {
    return (
      <EmptyState
        title={`Finding ${id}`}
        description="Outside the field seed — full triage desk for this record ships in wave 2 (TODO Fase 2)."
        action={
          <Link href={`/field/findings/${CANON.finding}`}>
            <Button>Open {CANON.finding} instead</Button>
          </Link>
        }
      />
    );
  }
  return <FindingDesk />;
}
