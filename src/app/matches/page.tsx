'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hooks';
import { MatchListItem } from '@/lib/types';
import { MatchCard } from '@/components/match-card';
import { Empty, Spinner, Tabs } from '@/components/ui';

const LIVE_STATUSES = ['live', 'innings_break', 'rain_delay', 'toss'];

export default function HomePage() {
  const { data: matches, loading } = useApi<MatchListItem[]>('/matches');
  const [tab, setTab] = useState('all');

  const filtered = useMemo(() => {
    if (!matches) return [];
    if (tab === 'live') return matches.filter((m) => LIVE_STATUSES.includes(m.status));
    if (tab === 'upcoming') return matches.filter((m) => m.status === 'scheduled');
    if (tab === 'results') return matches.filter((m) => ['completed', 'abandoned', 'no_result'].includes(m.status));
    return matches;
  }, [matches, tab]);

  const liveCount = matches?.filter((m) => LIVE_STATUSES.includes(m.status)).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Matches</h1>
        <p className="text-sm text-mut">
          {liveCount > 0 ? <><span className="live-dot mr-1.5" />{liveCount} match{liveCount > 1 ? 'es' : ''} live now</> : 'Follow every ball, live.'}
        </p>
      </div>

      <Tabs
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'live', label: `Live${liveCount ? ` (${liveCount})` : ''}` },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'results', label: 'Results' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty>No matches here yet. {tab === 'all' && 'Create a tournament in Manage to get started.'}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => <MatchCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}
