'use client';

/** Gold / Silver / Bronze medals for the overall Top Performers boards
 *  (Most Runs, Most Wickets, MVP) — shown on the leaderboard ranks and as
 *  achievement badges on player profiles. */

export interface LeaderRow {
  player_id: string; full_name: string; photo_url: string | null; team_short_name: string | null;
  matches_played: number;
  runs_scored?: number; highest_score?: number; strike_rate?: string | null;
  wickets_taken?: number; economy?: string | null;
  mvp_points?: string;
}
export interface Leaders { runs: LeaderRow[]; wickets: LeaderRow[]; mvp: LeaderRow[] }

export type LeaderMetric = 'runs' | 'wickets' | 'mvp';
export const METRIC_LABEL: Record<LeaderMetric, string> = {
  runs: 'Most Runs', wickets: 'Most Wickets', mvp: 'MVP',
};

const MEDALS = [
  { emoji: '🥇', name: 'Gold', cls: 'border-gold/50 bg-gold/15 text-gold' },
  { emoji: '🥈', name: 'Silver', cls: 'border-silver/50 bg-silver/15 text-silver' },
  { emoji: '🥉', name: 'Bronze', cls: 'border-bronze/50 bg-bronze/15 text-bronze' },
] as const;

/** Compact medal for leaderboard rank cells (ranks 1–3), plain number otherwise. */
export function RankCell({ rank }: { rank: number }) {
  const m = MEDALS[rank - 1];
  if (!m) return <span className="w-6 text-center font-black text-mut">{rank}</span>;
  return <span className="w-6 text-center text-lg leading-none" title={`${m.name} — rank ${rank}`}>{m.emoji}</span>;
}

/** Achievement pill, e.g. "🥇 Most Runs" — used on player profiles. */
export function MedalBadge({ rank, metric }: { rank: 1 | 2 | 3; metric: LeaderMetric }) {
  const m = MEDALS[rank - 1];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${m.cls}`}
      title={`${m.name} — rank ${rank} overall`}>
      {m.emoji} {METRIC_LABEL[metric]}
    </span>
  );
}

/** A player's top-3 finishes across the overall boards. */
export function playerMedals(leaders: Leaders | null, playerId: string): { metric: LeaderMetric; rank: 1 | 2 | 3 }[] {
  if (!leaders) return [];
  return (['runs', 'wickets', 'mvp'] as const).flatMap((metric) => {
    const i = (leaders[metric] ?? []).findIndex((r) => r.player_id === playerId);
    return i >= 0 && i < 3 ? [{ metric, rank: (i + 1) as 1 | 2 | 3 }] : [];
  });
}
