'use client';

import Link from 'next/link';
import { MatchListItem, fmtDate, oversFromBalls } from '@/lib/types';
import { StatusBadge } from './ui';

function TeamRow(
  { name, short, logo, score, isWinner }:
  { name: string; short: string; logo: string | null; score?: string; isWinner?: boolean },
) {
  return (
    <div className="flex items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={short} className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel-2 text-[10px] font-bold text-mut">
          {short.slice(0, 3)}
        </span>
      )}
      <span className={isWinner ? 'font-black text-grass' : 'font-semibold'}>{name}</span>
      {score && (
        <span className={`score-digits ml-auto font-bold ${isWinner ? 'text-grass' : 'text-mut'}`}>{score}</span>
      )}
    </div>
  );
}

export function MatchCard({ m }: { m: MatchListItem }) {
  const live = ['live', 'innings_break', 'rain_delay', 'toss'].includes(m.status);
  const completed = m.status === 'completed';

  // The innings rows are updated per-ball in the same transaction as the
  // live state, so they're safe to show mid-match — this is what keeps a
  // finished first innings visible while the chase is live.
  const inningsScore = (runs: number | null, wkts: number | null, balls: number | null) => {
    if (runs == null) return undefined;
    const allOut = wkts != null && wkts >= (m.wickets_to_fall ?? 10);
    return `${runs}${allOut ? ' all out' : `/${wkts}`} (${oversFromBalls(balls ?? 0)})`;
  };
  // The batting side's running score also lives in live_summary, refreshed
  // every ball. Fall back to it when the innings row has nothing to show yet,
  // so a live card is never blank while runs are on the board.
  const liveScoreFor = (short: string) => {
    const s = m.live_summary;
    if (!live || !s?.score || s.batting_team !== short) return undefined;
    return `${s.score}${s.overs ? ` (${s.overs})` : ''}`;
  };
  const scoreA = (live || completed
    ? inningsScore(m.team_a_runs, m.team_a_wickets, m.team_a_balls)
    : undefined) ?? liveScoreFor(m.team_a_short);
  const scoreB = (live || completed
    ? inningsScore(m.team_b_runs, m.team_b_wickets, m.team_b_balls)
    : undefined) ?? liveScoreFor(m.team_b_short);

  // Once the toss is done it is the headline fact of a match that has not
  // finished — surface it instead of leaving the card looking empty.
  const tossShort = m.toss_winner_id === m.team_a_id ? m.team_a_short
    : m.toss_winner_id === m.team_b_id ? m.team_b_short
    : null;
  const tossLine = tossShort && m.toss_decision && !completed
    ? `${tossShort} won the toss & chose to ${m.toss_decision}`
    : null;

  return (
    <Link href={`/matches/${m.id}`} className="card block p-4 transition-colors hover:border-grass/50">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs text-mut">
          {m.tournament_name ?? 'Friendly'}{m.match_number ? ` · Match ${m.match_number}` : ''}
          {m.stage_label ? ` · ${m.stage_label}` : ''}
        </span>
        <StatusBadge status={m.status} />
      </div>
      <div className="space-y-2">
        <TeamRow name={m.team_a} short={m.team_a_short} logo={m.team_a_logo} score={scoreA}
          isWinner={completed && m.winner_team_id === m.team_a_id} />
        <TeamRow name={m.team_b} short={m.team_b_short} logo={m.team_b_logo} score={scoreB}
          isWinner={completed && m.winner_team_id === m.team_b_id} />
      </div>
      {tossLine && <p className="mt-2 text-xs text-mut">{tossLine}</p>}
      <div className="mt-3 border-t border-line pt-2 text-xs text-mut">
        {m.result_summary ?? (live ? (m.live_summary?.target ? `Target ${m.live_summary.target}` : 'In progress') : fmtDate(m.scheduled_start))}
        {m.venue ? ` · ${m.venue}` : ''}
      </div>
    </Link>
  );
}
