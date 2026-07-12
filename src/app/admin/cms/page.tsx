'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { Empty, ErrorBox, Spinner, StatusBadge } from '@/components/ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PageRow { id: string; slug: string; title: string; status: string; published_at: string | null; revisions: number }

/**
 * Marketing-site CMS manager (super admin). Pages are block documents:
 * edit the JSON here, preview on the live route, publish to snapshot a revision.
 */
export default function CmsAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: pages, loading, reload } = useApi<PageRow[]>(user?.roles.includes('super_admin') ? '/cms/admin/pages' : null);
  const [editing, setEditing] = useState<any | null>(null);
  const [draft, setDraft] = useState({ title: '', blocks: '' });
  const [newSlug, setNewSlug] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (authLoading) return <Spinner />;
  if (!user?.roles.includes('super_admin')) {
    return <Empty>The CMS is only available to the platform super admin.</Empty>;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await reload(); }
    catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  const openEditor = (id: string) =>
    run(async () => {
      const page = await api<any>(`/cms/admin/pages/${id}`);
      setEditing(page);
      setDraft({ title: page.title, blocks: JSON.stringify(page.blocks, null, 2) });
    });

  const save = () =>
    run(async () => {
      let blocks: unknown;
      try { blocks = JSON.parse(draft.blocks); } catch { throw new Error('Blocks must be valid JSON (an array of {id,type,props})'); }
      await api(`/cms/admin/pages/${editing.id}`, { method: 'PATCH', body: { title: draft.title, blocks } });
    });

  const publish = (id: string, on: boolean) =>
    run(() => api(`/cms/admin/pages/${id}/${on ? 'publish' : 'unpublish'}`, { method: 'POST' }));

  const createPage = () =>
    run(async () => {
      await api('/cms/admin/pages', { method: 'POST', body: { slug: newSlug, title: newSlug } });
      setNewSlug('');
    });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-xs text-mut hover:text-grass">← Manage</Link>
        <h1 className="text-2xl font-black tracking-tight">Marketing site CMS</h1>
        <p className="text-sm text-mut">Block-based pages rendered at their slug (e.g. <code>/features</code>). Publish snapshots a revision.</p>
      </div>
      <ErrorBox error={error} />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label">New page slug</label>
          <input className="input" placeholder="e.g. about-us" value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, '-'))} />
        </div>
        <button className="btn-primary" disabled={busy || !newSlug} onClick={createPage}>Create page</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card divide-y divide-line/40 p-0">
          {pages?.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-bold">/{p.slug}</span>
              <span className="text-mut">{p.title}</span>
              <StatusBadge status={p.status} />
              <span className="text-xs text-mut">{p.revisions} revision{p.revisions === 1 ? '' : 's'}</span>
              <span className="ml-auto flex gap-2">
                <Link href={`/${p.slug === 'home' ? '' : p.slug}`} className="btn-ghost !py-1 text-xs">View</Link>
                <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => openEditor(p.id)}>Edit</button>
                {p.status === 'published'
                  ? <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => publish(p.id, false)}>Unpublish</button>
                  : <button className="btn-primary !py-1 text-xs" disabled={busy} onClick={() => publish(p.id, true)}>Publish</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Editing /{editing.slug}</h2>
            <button className="text-mut hover:text-ink" onClick={() => setEditing(null)}>✕ Close</button>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Blocks (JSON — types: hero, feature_grid, pricing_table, cta_banner, faq, rich_text, contact_form)</label>
            <textarea className="input min-h-80 font-mono text-xs" spellCheck={false}
              value={draft.blocks} onChange={(e) => setDraft({ ...draft, blocks: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={save}>Save draft</button>
            <button className="btn-ghost" disabled={busy} onClick={() => publish(editing.id, true)}>Save & publish</button>
          </div>
        </div>
      )}
    </div>
  );
}
