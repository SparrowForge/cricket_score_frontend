'use client';

import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { Empty, Spinner } from '@/components/ui';

interface NewsItem {
  id: string; title: string; slug: string; excerpt: string | null;
  tags: string[]; published_at: string; author: string; cover_url: string | null;
}

export default function NewsPage() {
  const { data, loading } = useApi<NewsItem[]>('/news');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">News</h1>
      {loading ? <Spinner /> : !data?.length ? <Empty>No stories published yet.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((n) => (
            <Link key={n.id} href={`/news/${n.slug}`} className="card block overflow-hidden hover:border-grass/50">
              {n.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.cover_url} alt="" className="h-36 w-full object-cover" />
              )}
              <div className="p-4">
                <h2 className="font-bold leading-snug">{n.title}</h2>
                {n.excerpt && <p className="mt-1 line-clamp-2 text-sm text-mut">{n.excerpt}</p>}
                <p className="mt-2 text-xs text-mut">
                  {n.author} · {new Date(n.published_at).toLocaleDateString()}
                  {n.tags?.length > 0 && <> · {n.tags.join(', ')}</>}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
