'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { useLiveMatch } from '@/lib/useLive';
import { MatchDetail, fmtDate, oversFromBalls } from '@/lib/types';
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
  // seq in the deps keeps the header innings scores fresh on every ball
  const { data: match, reload } = useApi<MatchDetail>(`/matches/${id}`, [state?.status, seq]);
  const { data: canScoreData } = useApi<{ can_score: boolean }>(user ? `/matches/${id}/can-score` : null, [user?.id]);
  const [tab, setTab] = useState('summary');

  if (!match) return <Spinner label="Loading match…" />;

  const isLive = ['live', 'innings_break', 'rain_delay', 'toss'].includes(match.status);

  // Header scores: innings in batting order, one line per team ("&"-joined for
  // two-innings formats). Teams that haven't faced a ball yet show nothing.
  const rules = (match.rules_snapshot ?? {}) as { wickets_to_fall?: number; balls_per_over?: number };
  const teamScores: { name: string; scores: string[] }[] = [];
  for (const inn of [...(match.innings ?? [])].sort((a, b) => a.seq - b.seq)) {
    if (inn.legal_balls <= 0 && inn.total_runs <= 0 && inn.total_wickets <= 0) continue;
    const allOut = inn.total_wickets >= (rules.wickets_to_fall ?? 10);
    const score = `${inn.total_runs}${allOut ? ' all out' : `/${inn.total_wickets}`} (${oversFromBalls(inn.legal_balls, rules.balls_per_over ?? 6)})`;
    const entry = teamScores.find((t) => t.name === inn.batting_team);
    if (entry) entry.scores.push(score);
    else teamScores.push({ name: inn.batting_team, scores: [score] });
  }

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
        {teamScores.length > 0 && (
          <div className="mt-2 space-y-1">
            {teamScores.map((t) => (
              <div key={t.name} className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-bold">{t.name}</span>
                <span className="score-digits text-lg font-black text-grass">{t.scores.join(' & ')}</span>
              </div>
            ))}
          </div>
        )}
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
      {tab === 'commentary' && <CommentaryTab matchId={id} seq={seq} canScore={canScoreData?.can_score} />}
      {tab === 'overs' && <OversTab matchId={id} seq={seq} />}
      {tab === 'stats' && <StatsTab matchId={id} seq={seq} />}
      {tab === 'mvp' && <MvpTab matchId={id} seq={seq} />}
      {tab === 'squads' && <SquadsTab matchId={id} />}
    </div>
  );
}
