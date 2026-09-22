import { redirect } from 'next/navigation';
import { AssetRegistry } from '@/components/assets/AssetRegistry';
import { getSessionContext } from '@/lib/auth/context';
import { getDb } from '@/db/client';
import { listAssets } from '@/lib/services/asset-service';

export default async function AssetsPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect('/login');
  const rows = await listAssets(getDb(), ctx);
  return <AssetRegistry rows={rows} />;
}
