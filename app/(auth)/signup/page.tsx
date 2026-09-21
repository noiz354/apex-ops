import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth/SignupForm';
import { getSessionContext } from '@/lib/auth/context';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx) redirect('/');
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <SignupForm redirectTo={safeNext} />;
}
