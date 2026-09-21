import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ops/EmptyState';
import { RunChecklist } from '@/components/field/RunChecklist';
import { CANON, ID_FORMATS } from '@/lib/canon';

export function generateStaticParams() {
  return [{ id: CANON.inspection }, { id: 'INS-2026-0415' }, { id: 'INS-2026-0418' }];
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_FORMATS.inspection.test(id)) notFound();
  if (id !== CANON.inspection) {
    return (
      <main className="w-full max-w-3xl mx-auto px-4 pt-[124px]">
        <EmptyState
          title={`Run ${id}`}
          description="Outside the field seed — this run opens once dispatched to E. Voronova (TODO Fase 2)."
          action={
            <Link href={`/field/audits/${CANON.inspection}/run`}>
              <Button>Resume {CANON.inspection} instead</Button>
            </Link>
          }
        />
      </main>
    );
  }
  return <RunChecklist auditId={id} />;
}
