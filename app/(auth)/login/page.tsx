import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getSessionContext } from '@/lib/auth/context';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx) redirect('/');
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <LoginForm redirectTo={safeNext} />;
}
