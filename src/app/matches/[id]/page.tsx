'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { useLiveMatch } from '@/lib/useLive';
import { MatchDetail, fmtDate } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { Spinner, StatusBadge, Tabs } from '@/components/ui';
import {
  CommentaryTab, MvpTab, OversTab, ScorecardTab, SquadsTab, StatsTab, SummaryTab,
} from '@/components/match/tabs';

export default function MatchCenterPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { state, presence, connected } = useLiveMatch(id);
  const seq = state?.seq ?? 0;
  const { data: match, reload } = useApi<MatchDetail>(`/matches/${id}`, [state?.status]);
  const [tab, setTab] = useState('summary');

  if (!match) return <Spinner label="Loading match…" />;

  const isLive = ['live', 'innings_break', 'rain_delay', 'toss'].includes(match.status);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-mut">
          {match.tournament_name && (
            <Link href={`/tournaments/${match.tournament_id}`} className="hover:text-grass">{match.tournament_name}</Link>
          )}
          {match.venue_name && <span>· {match.venue_name}</span>}
          <span>· {fmtDate(match.scheduled_start)}</span>
          <span className="ml-auto flex items-center gap-2">
            {isLive && <span className="text-mut">{presence.viewers} watching{connected ? '' : ' (reconnecting…)'}</span>}
            <StatusBadge status={match.status} />
          </span>
        </div>
        <h1 className="text-xl font-black sm:text-2xl">
          {match.team_a_name} <span className="text-mut">vs</span> {match.team_b_name}
          {match.is_super_over && <span className="ml-2 rounded bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">SUPER OVER</span>}
        </h1>
        {match.toss_winner_id && (
          <p className="mt-1 text-xs text-mut">
            {match.toss_winner_id === match.team_a_id ? match.team_a_short : match.team_b_short} won the toss and chose to {match.toss_decision}
          </p>
        )}
        {match.result_summary && <p className="mt-1 text-sm font-bold text-grass">{match.result_summary}</p>}
        {match.player_of_match_name && (
          <p className="mt-1 text-xs text-mut">
            Player of the Match: <span className="font-bold text-gold">{match.player_of_match_name}</span>
          </p>
        )}
        {match.child_matches?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {match.child_matches.map((c) => (
              <Link key={c.id} href={`/matches/${c.id}`}
                className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold hover:bg-gold/20">
                {c.stage_label} → {c.result_summary ?? c.status}
              </Link>
            ))}
          </div>
        )}
        {user && (
          <div className="mt-3">
            <Link href={`/score/${match.id}`} className="btn-ghost !py-1.5 text-xs">Open scorer console →</Link>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { key: 'summary', label: 'Summary' },
          { key: 'scorecard', label: 'Scorecard' },
          { key: 'commentary', label: 'Commentary' },
          { key: 'overs', label: 'Overs' },
          { key: 'stats', label: 'Stats' },
          { key: 'mvp', label: 'MVP' },
          { key: 'squads', label: 'Squads' },
        ]}
        active={tab}
        onChange={(t) => { setTab(t); void reload(); }}
      />

      {tab === 'summary' && <SummaryTab state={state} match={match} />}
      {tab === 'scorecard' && <ScorecardTab matchId={id} seq={seq} />}
      {tab === 'commentary' && <CommentaryTab matchId={id} seq={seq} />}
      {tab === 'overs' && <OversTab matchId={id} seq={seq} />}
      {tab === 'stats' && <StatsTab matchId={id} seq={seq} />}
      {tab === 'mvp' && <MvpTab matchId={id} seq={seq} />}
      {tab === 'squads' && <SquadsTab matchId={id} />}
    </div>
  );
}
