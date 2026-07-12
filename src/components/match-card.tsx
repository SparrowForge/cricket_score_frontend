'use client';

import Link from 'next/link';
import { MatchListItem, fmtDate } from '@/lib/types';
import { StatusBadge } from './ui';

function TeamRow({ name, short, logo, score }: { name: string; short: string; logo: string | null; score?: string }) {
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
      <span className="font-semibold">{name}</span>
      {score && <span className="score-digits ml-auto font-bold text-grass">{score}</span>}
    </div>
  );
}

export function MatchCard({ m }: { m: MatchListItem }) {
  const live = ['live', 'innings_break', 'rain_delay', 'toss'].includes(m.status);
  const battingA = m.live_summary?.batting_team === m.team_a_short;
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
        <TeamRow name={m.team_a} short={m.team_a_short} logo={m.team_a_logo}
          score={live && battingA ? `${m.live_summary?.score} (${m.live_summary?.overs})` : undefined} />
        <TeamRow name={m.team_b} short={m.team_b_short} logo={m.team_b_logo}
          score={live && !battingA && m.live_summary ? `${m.live_summary?.score} (${m.live_summary?.overs})` : undefined} />
      </div>
      <div className="mt-3 border-t border-line pt-2 text-xs text-mut">
        {m.result_summary ?? (live ? (m.live_summary?.target ? `Target ${m.live_summary.target}` : 'In progress') : fmtDate(m.scheduled_start))}
        {m.venue ? ` · ${m.venue}` : ''}
      </div>
    </Link>
  );
}
