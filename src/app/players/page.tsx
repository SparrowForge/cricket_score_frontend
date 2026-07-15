'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Empty, Spinner } from '@/components/ui';
import { calcAge, Player } from '@/lib/types';
import { Leaders, RankCell } from '@/components/medals';

/** Overall (all matches, all tournaments) top performers — same look as the
 *  tournament page's Top Performers tab. */
function TopPerformers() {
  const { data, loading } = useApi<Leaders>('/players/leaders');
  const [metric, setMetric] = useState<'runs' | 'wickets' | 'mvp'>('runs');
  if (loading) return <Spinner />;
  const leaders = data?.[metric] ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black tracking-tight">Top performers</h2>
        <p className="text-sm text-mut">Career leaders across every match on CricLive.</p>
      </div>
      <div className="flex gap-2">
        {(['runs', 'wickets', 'mvp'] as const).map((m) => (
          <button key={m} onClick={() => setMetric(m)}
            className={metric === m ? 'btn-primary !py-1.5' : 'btn-ghost !py-1.5'}>
            {m === 'runs' ? 'Most Runs' : m === 'wickets' ? 'Most Wickets' : 'MVP'}
          </button>
        ))}
      </div>
      {!leaders.length ? <Empty>Stats appear after the first completed match.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {leaders.map((l, i) => (
            <div key={l.player_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <RankCell rank={i + 1} />
              {l.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-xs font-bold text-mut">
                  {l.full_name.charAt(0)}
                </span>
              )}
              <Link href={`/players/${l.player_id}`} className="font-semibold hover:text-grass hover:underline">{l.full_name}</Link>
              <span className="text-xs text-mut">{l.team_short_name ? `${l.team_short_name} · ` : ''}{l.matches_played}m</span>
              <span className="score-digits ml-auto font-bold">
                {metric === 'runs' && <>{l.runs_scored} <span className="text-xs font-normal text-mut">runs · HS {l.highest_score} · SR {l.strike_rate ?? '—'}</span></>}
                {metric === 'wickets' && <>{l.wickets_taken} <span className="text-xs font-normal text-mut">wkts · Econ {l.economy ?? '—'}</span></>}
                {metric === 'mvp' && <>{Number(l.mvp_points).toFixed(1)} <span className="text-xs font-normal text-mut">pts</span></>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Public, sitewide player search — no login required. */
export default function PlayersSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!query) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api<Player[]>(`/players?search=${encodeURIComponent(query)}&limit=30`)
        .then((r) => { if (alive) setResults(r); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250); // debounce
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Players</h1>
        <p className="text-sm text-mut">Search every player on CricLive and view their profile and career stats.</p>
      </div>

      <input
        className="input text-base"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {loading ? <Spinner /> : query ? (
        !results?.length ? <Empty>No players match “{query}”.</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <Link key={p.id} href={`/players/${p.id}`} className="card flex items-center gap-3 p-4 hover:border-grass/50">
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-lg font-bold text-mut">
                    {p.full_name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate font-bold">{p.full_name}</div>
                  <div className="truncate text-xs text-mut">
                    {p.primary_role.replace(/_/g, ' ')}
                    {p.country ? ` · ${p.country}` : ''}
                    {p.date_of_birth ? ` · ${calcAge(p.date_of_birth)}y` : ''}
                  </div>
                  {p.major_teams && p.major_teams.length > 0 && (
                    <div className="truncate text-[11px] text-grass">{p.major_teams.join(', ')}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        <TopPerformers />
      )}
    </div>
  );
}
