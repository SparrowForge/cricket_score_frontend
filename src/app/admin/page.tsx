'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Org } from '@/lib/types';
import { Empty, ErrorBox, Spinner } from '@/components/ui';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { data: orgs, loading, reload } = useApi<Org[]>(user ? '/orgs' : null);
  const [name, setName] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (authLoading) return <Spinner />;
  if (!user) { router.push('/login'); return <Spinner />; }

  const createOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/orgs', { method: 'POST', body: { name, slug: slugify(name) || `org-${Date.now()}` } });
      setName('');
      await reload();
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Your organizations</h1>
          <p className="text-sm text-mut">Clubs and leagues you manage. Everything — teams, tournaments, scoring — lives inside an organization.</p>
        </div>
        {user.roles.includes('super_admin') && (
          <Link href="/admin/cms" className="btn-ghost !py-1.5 text-xs">🌐 Marketing site CMS</Link>
        )}
      </div>

      {loading ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs?.map((o) => (
            <Link key={o.id} href={`/admin/${o.id}`} className="card block p-4 hover:border-grass/50">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{o.name}</h2>
                {o.plan && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-bold uppercase text-mut">{o.plan}</span>}
              </div>
              <p className="mt-1 text-xs text-mut">{o.is_owner ? 'Owner' : 'Member'} · /{o.slug}</p>
            </Link>
          ))}
          <form onSubmit={createOrg} className="card flex flex-col gap-3 border-dashed p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-mut">New organization</div>
            <input className="input" placeholder="e.g. Dhaka Cricket Club" value={name} onChange={(e) => setName(e.target.value)} required />
            <ErrorBox error={error} />
            <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create organization'}</button>
          </form>
        </div>
      )}
      {!loading && !orgs?.length && <Empty>Create your first organization to start running tournaments.</Empty>}
    </div>
  );
}
