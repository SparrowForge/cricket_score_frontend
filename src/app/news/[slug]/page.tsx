'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { Empty, Spinner } from '@/components/ui';

interface Article {
  id: string; title: string; excerpt: string | null; body: { text?: string } | null;
  tags: string[]; published_at: string; author: string; cover_url: string | null;
  tournament_id: string | null; match_id: string | null;
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: a, error, loading } = useApi<Article>(`/news/${slug}`);

  if (loading) return <Spinner />;
  if (error || !a) return <Empty>Article not found.</Empty>;

  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/news" className="text-xs text-mut hover:text-grass">← All news</Link>
        <h1 className="mt-1 text-3xl font-black leading-tight">{a.title}</h1>
        <p className="mt-2 text-xs text-mut">
          {a.author} · {new Date(a.published_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
        </p>
      </div>
      {a.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.cover_url} alt="" className="w-full rounded-xl border border-line object-cover" />
      )}
      {a.excerpt && <p className="text-base font-semibold text-ink">{a.excerpt}</p>}
      <div className="space-y-4 text-sm leading-relaxed text-mut">
        {(a.body?.text ?? '').split('\n\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {a.match_id && <Link href={`/matches/${a.match_id}`} className="btn-ghost !py-1 text-xs">Related match →</Link>}
        {a.tournament_id && <Link href={`/tournaments/${a.tournament_id}`} className="btn-ghost !py-1 text-xs">Tournament →</Link>}
        {a.tags?.map((t) => <span key={t} className="rounded-full bg-panel-2 px-2.5 py-1 text-xs text-mut">#{t}</span>)}
      </div>
    </article>
  );
}
