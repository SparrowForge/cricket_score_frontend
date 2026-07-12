'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { BlockRenderer, CmsBlock } from '@/components/blocks';
import { Empty, Spinner } from '@/components/ui';

interface CmsPage { slug: string; title: string; blocks: CmsBlock[] }

/** Catch-all CMS page renderer — /features, /demo, /contact, and any published page. */
export default function CmsCatchAllPage() {
  const params = useParams<{ slug: string[] }>();
  const slug = (params.slug ?? []).join('/');
  const { data: page, error, loading } = useApi<CmsPage>(`/cms/pages/${slug}`);

  if (loading) return <Spinner label="Loading page…" />;
  if (error || !page) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-3xl font-black">404</h1>
        <Empty>This page doesn&apos;t exist (or isn&apos;t published).</Empty>
        <Link href="/" className="btn-ghost">← Back home</Link>
      </div>
    );
  }
  return (
    <div>
      {page.blocks.length === 0 ? (
        <div className="py-16 text-center">
          <h1 className="text-3xl font-black">{page.title}</h1>
          <p className="mt-3 text-sm text-mut">Content coming soon.</p>
        </div>
      ) : (
        <BlockRenderer blocks={page.blocks} />
      )}
    </div>
  );
}
