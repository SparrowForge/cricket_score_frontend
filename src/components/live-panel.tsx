'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { MatchListItem, fmtDate } from '@/lib/types';
import { StatusBadge } from './ui';

const LIVE = ['live', 'innings_break', 'rain_delay', 'toss'];

/**
 * Marketing-site live score panel: every live match plus the upcoming
 * schedule, refreshed every 15s. Guests click through to the match center.
 */
export function LiveScorePanel() {
  const { data: matches, reload } = useApi<MatchListItem[]>('/matches');

  useEffect(() => {
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [reload]);

  const live = (matches ?? []).filter((m) => LIVE.includes(m.status));
  const upcoming = (matches ?? []).filter((m) => m.status === 'scheduled').slice(0, 6);
  if (!matches) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-panel-2 px-4 py-2.5">
        <h2 className="text-sm font-black uppercase tracking-wide">
          {live.length > 0 ? <><span className="live-dot mr-2" />Live now</> : 'Match centre'}
        </h2>
        <Link href="/matches" className="text-xs font-semibold text-grass hover:underline">All matches →</Link>
      </div>

      {live.length === 0 && upcoming.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-mut">No matches right now — check back soon.</p>
      ) : (
        <div className="divide-y divide-line/40">
          {live.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2/50">
              <span className="live-dot shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{m.team_a_short} vs {m.team_b_short}</div>
                <div className="truncate text-xs text-mut">{m.tournament_name ?? 'Friendly'}</div>
              </div>
              {m.live_summary?.score && (
                <div className="score-digits text-right">
                  <div className="font-black text-grass">{m.live_summary.score}</div>
                  <div className="text-xs text-mut">{m.live_summary.overs} ov{m.live_summary.target ? ` · T ${m.live_summary.target}` : ''}</div>
                </div>
              )}
              <StatusBadge status={m.status} />
            </Link>
          ))}
          {upcoming.length > 0 && (
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-mut">Upcoming</div>
          )}
          {upcoming.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2/50">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.team_a_short} vs {m.team_b_short}</div>
                <div className="truncate text-xs text-mut">{m.tournament_name ?? 'Friendly'}{m.venue ? ` · ${m.venue}` : ''}</div>
              </div>
              <span className="text-xs text-mut">{fmtDate(m.scheduled_start)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
