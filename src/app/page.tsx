'use client';

import { useApi } from '@/lib/hooks';
import { BlockRenderer, CmsBlock } from '@/components/blocks';
import { LiveScorePanel } from '@/components/live-panel';
import { Spinner } from '@/components/ui';

interface CmsPage {
  slug: string;
  title: string;
  blocks: CmsBlock[];
}

/**
 * Marketing home: CMS-driven blocks with the live score panel pinned
 * right under the hero so guests can jump straight into live matches.
 */
export default function HomePage() {
  const { data: page, loading } = useApi<CmsPage>('/cms/pages/home');

  if (loading) return <Spinner label="Loading..." />;

  const blocks = (page?.blocks ?? []).map((block) =>
    block.type === 'pricing_table'
      ? { ...block, props: { ...(block.props ?? {}), plan_slugs: undefined } }
      : block,
  );
  const [first, ...rest] = blocks;

  return (
    <div className="space-y-12">
      {first && <BlockRenderer blocks={[first]} />}
      <LiveScorePanel />
      {rest.length > 0 && <BlockRenderer blocks={rest} />}
    </div>
  );
}
