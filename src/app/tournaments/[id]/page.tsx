'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { MatchListItem, PointsRow } from '@/lib/types';
import { MatchCard } from '@/components/match-card';
import { Empty, Spinner, StatusBadge, Tabs } from '@/components/ui';

interface TournamentDetail {
  id: string; name: string; season: string | null; status: string; description: string | null;
  format_name: string; banner_url: string | null;
  groups: { id: string; name: string }[];
  teams: { id: string; name: string; short_name: string; logo_url: string | null }[];
}

interface Leader {
  player_id: string; full_name: string; team_short_name: string;
  runs_scored: number; wickets_taken: number; strike_rate: string | null; economy: string | null; mvp_points: string;
  matches_played: number;
}

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, loading } = useApi<TournamentDetail>(`/tournaments/${id}`);
  const { data: fixtures } = useApi<MatchListItem[]>(`/matches?tournament=${id}`);
  const { data: points } = useApi<PointsRow[]>(`/tournaments/${id}/points-table`);
  const [tab, setTab] = useState('fixtures');
  const [metric, setMetric] = useState<'runs' | 'wickets' | 'mvp'>('runs');
  const { data: leaders } = useApi<Leader[]>(`/tournaments/${id}/stats/leaders?metric=${metric}`, [metric]);

  if (loading || !t) return <Spinner label="Loading tournament…" />;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-black">{t.name}</h1>
          <StatusBadge status={t.status} />
        </div>
        <p className="text-sm text-mut">{t.format_name}{t.season ? ` · ${t.season}` : ''} · {t.teams.length} teams</p>
        {t.description && <p className="mt-2 text-sm text-mut">{t.description}</p>}
      </div>

      <Tabs
        tabs={[
          { key: 'fixtures', label: 'Fixtures & Results' },
          { key: 'points', label: 'Points Table' },
          { key: 'stats', label: 'Top Performers' },
          { key: 'teams', label: 'Teams' },
        ]}
        active={tab} onChange={setTab}
      />

      {tab === 'fixtures' && (
        !fixtures?.length ? <Empty>No fixtures scheduled yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {fixtures.map((m) => <MatchCard key={m.id} m={m} />)}
          </div>
        )
      )}

      {tab === 'points' && (
        !points?.length ? <Empty>Points table appears once teams are added.</Empty> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-mut">
                  <th className="px-4 py-2.5">#</th><th className="px-2 py-2.5">Team</th>
                  <th className="px-2 py-2.5 text-right">P</th><th className="px-2 py-2.5 text-right">W</th>
                  <th className="px-2 py-2.5 text-right">L</th><th className="px-2 py-2.5 text-right">T</th>
                  <th className="px-2 py-2.5 text-right">NR</th>
                  <th className="px-2 py-2.5 text-right font-bold">Pts</th>
                  <th className="px-4 py-2.5 text-right">NRR</th>
                </tr>
              </thead>
              <tbody>
                {points.map((r, i) => (
                  <tr key={r.team_id} className="border-t border-line/40">
                    <td className="px-4 py-2.5 text-mut">{r.rank ?? i + 1}</td>
                    <td className="px-2 py-2.5 font-semibold">{r.team_name}</td>
                    <td className="score-digits px-2 py-2.5 text-right">{r.played}</td>
                    <td className="score-digits px-2 py-2.5 text-right text-grass">{r.won}</td>
                    <td className="score-digits px-2 py-2.5 text-right text-cherry">{r.lost}</td>
                    <td className="score-digits px-2 py-2.5 text-right text-mut">{r.tied}</td>
                    <td className="score-digits px-2 py-2.5 text-right text-mut">{r.no_result}</td>
                    <td className="score-digits px-2 py-2.5 text-right font-black">{r.points}</td>
                    <td className={`score-digits px-4 py-2.5 text-right ${Number(r.net_run_rate) >= 0 ? 'text-grass' : 'text-cherry'}`}>
                      {Number(r.net_run_rate) > 0 ? '+' : ''}{r.net_run_rate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['runs', 'wickets', 'mvp'] as const).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={metric === m ? 'btn-primary !py-1.5' : 'btn-ghost !py-1.5'}>
                {m === 'runs' ? 'Most Runs' : m === 'wickets' ? 'Most Wickets' : 'MVP'}
              </button>
            ))}
          </div>
          {!leaders?.length ? <Empty>Stats appear after the first completed match.</Empty> : (
            <div className="card divide-y divide-line/40 p-0">
              {leaders.slice(0, 15).map((l, i) => (
                <div key={l.player_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`w-6 text-center font-black ${i === 0 ? 'text-gold' : 'text-mut'}`}>{i + 1}</span>
                  <Link href={`/players/${l.player_id}`} className="font-semibold hover:text-grass hover:underline">{l.full_name}</Link>
                  <span className="text-xs text-mut">{l.team_short_name} · {l.matches_played}m</span>
                  <span className="score-digits ml-auto font-bold">
                    {metric === 'runs' && <>{l.runs_scored} <span className="text-xs font-normal text-mut">runs · SR {l.strike_rate ?? '—'}</span></>}
                    {metric === 'wickets' && <>{l.wickets_taken} <span className="text-xs font-normal text-mut">wkts · Econ {l.economy ?? '—'}</span></>}
                    {metric === 'mvp' && <>{Number(l.mvp_points).toFixed(1)} <span className="text-xs font-normal text-mut">pts</span></>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'teams' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.teams.map((team) => (
            <div key={team.id} className="card flex items-center gap-3 p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-2 text-xs font-bold text-mut">
                {team.short_name}
              </span>
              <span className="font-semibold">{team.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
