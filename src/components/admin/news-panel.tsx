'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { UploadButton } from '@/components/upload';
import { Empty, ErrorBox, Spinner } from '@/components/ui';

interface OrgArticle {
  id: string; title: string; slug: string; excerpt: string | null; status: string;
  published_at: string | null; created_at: string; cover_url: string | null; cover_asset_id: string | null;
  tags: string[];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

export function NewsPanel({ orgId }: { orgId: string }) {
  const { data: articles, error: listError, loading, reload } = useApi<OrgArticle[]>(`/orgs/${orgId}/news`);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [form, setForm] = useState({ title: '', excerpt: '', body: '', tags: '' });
  const [cover, setCover] = useState<{ id: string; cdn_url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await reload(); }
    catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  const create = () =>
    run(async () => {
      await api(`/orgs/${orgId}/news`, {
        method: 'POST',
        body: {
          title: form.title,
          slug: `${slugify(form.title)}-${Date.now().toString(36).slice(-4)}`,
          excerpt: form.excerpt || undefined,
          body: { text: form.body },
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
          cover_asset_id: cover?.id,
        },
      });
      setForm({ title: '', excerpt: '', body: '', tags: '' });
      setCover(null);
    });

  if (loading) return <Spinner />;
  // Backend endpoint added recently — if the deployed API predates it, explain instead of erroring
  if (listError && (listError as { status?: number }).status === 404) {
    return <Empty>The deployed API is missing GET /orgs/:id/news — redeploy the backend to enable the news manager.</Empty>;
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-mut">Write a story</h3>
        <input className="input" placeholder="Headline" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="input" placeholder="Excerpt (one-line teaser)" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        <textarea className="input min-h-32" placeholder="Body — separate paragraphs with a blank line"
          value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex flex-wrap items-center gap-3">
          <input className="input max-w-60" placeholder="tags, comma, separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <UploadButton label={cover ? 'Replace cover' : 'Cover image'} folder="news" onUploaded={setCover} />
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.cdn_url} alt="cover" className="h-10 rounded border border-line object-cover" />
          )}
          <button className="btn-primary ml-auto" disabled={busy || !form.title || !form.body} onClick={create}>
            Save draft
          </button>
        </div>
        <ErrorBox error={error} />
      </div>

      {!articles?.length ? <Empty>No stories yet.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {articles.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              {a.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.cover_url} alt="" className="h-9 w-14 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{a.title}</div>
                <div className="text-xs text-mut">
                  {a.status === 'published' && a.published_at
                    ? `Published ${new Date(a.published_at).toLocaleDateString()}`
                    : a.status}
                </div>
              </div>
              {a.status === 'published' ? (
                <>
                  <Link href={`/news/${a.slug}`} className="btn-ghost !py-1 text-xs">View</Link>
                  <button className="btn-ghost !py-1 text-xs" disabled={busy}
                    onClick={() => run(() => api(`/news-admin/${a.id}/unpublish`, { method: 'POST' }))}>
                    Unpublish
                  </button>
                </>
              ) : (
                <button className="btn-primary !py-1 text-xs" disabled={busy}
                  onClick={() => run(() => api(`/news-admin/${a.id}/publish`, { method: 'POST' }))}>
                  Publish
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
