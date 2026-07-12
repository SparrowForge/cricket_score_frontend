'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Org } from '@/lib/types';
import { Confirm, Empty, ErrorBox, IconButton, Modal, Spinner } from '@/components/ui';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { data: orgs, loading, reload } = useApi<Org[]>(user ? '/orgs' : null);
  const [name, setName] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Org | null>(null);
  const [deleting, setDeleting] = useState<Org | null>(null);
  const [rowError, setRowError] = useState<{ message?: string } | null>(null);

  const saveEdit = async (name: string) => {
    setBusy(true); setRowError(null);
    try {
      await api(`/orgs/${editing!.id}`, { method: 'PATCH', body: { name } });
      setEditing(null);
      await reload();
    } catch (err) { setRowError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  const confirmDelete = async () => {
    setBusy(true); setRowError(null);
    try {
      await api(`/orgs/${deleting!.id}`, { method: 'DELETE' });
      setDeleting(null);
      await reload();
    } catch (err) { setRowError(err as { message?: string }); }
    finally { setBusy(false); }
  };

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
            <div key={o.id} className="card p-4 transition-colors hover:border-grass/50">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/${o.id}`} className="font-bold hover:text-grass">{o.name}</Link>
                {o.plan && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] font-bold uppercase text-mut">{o.plan}</span>}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-mut">{o.is_owner ? 'Owner' : 'Member'} · /{o.slug}</p>
                {o.is_owner && (
                  <div className="flex gap-1">
                    <IconButton title="Edit organization" onClick={() => { setEditing(o); setRowError(null); }}>✏️ Edit</IconButton>
                    <IconButton title="Delete organization" variant="danger" onClick={() => { setDeleting(o); setRowError(null); }}>🗑</IconButton>
                  </div>
                )}
              </div>
            </div>
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

      {editing && (
        <OrgEditModal org={editing} busy={busy} error={rowError} onSave={saveEdit} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <Confirm
          title={`Delete “${deleting.name}”?`}
          message="This hides the organization and everything in it. In-progress matches must be finished first. This cannot be undone from the UI."
          confirmLabel="Delete organization"
          busy={busy} error={rowError}
          onConfirm={confirmDelete} onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function OrgEditModal({ org, busy, error, onSave, onClose }: {
  org: Org; busy: boolean; error: { message?: string } | null;
  onSave: (name: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(org.name);
  return (
    <Modal title="Edit organization" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || !name.trim()} onClick={() => onSave(name)}>Save</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
