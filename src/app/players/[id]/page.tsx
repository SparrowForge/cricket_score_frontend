'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApi } from '@/lib/hooks';
import { Empty, Spinner } from '@/components/ui';
import { calcAge, fmtHeight, PlayerProfile } from '@/lib/types';

const FORMAT_LABEL: Record<string, string> = {
  t20: 'T20', one_day: 'ODI', test: 'Test', t10: 'T10', sixes: 'Sixes', custom: 'Custom',
};

/** Public player profile — bio + career stats by format + recent matches. Anyone can view. */
export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, loading } = useApi<PlayerProfile>(`/players/${id}`);

  if (loading) return <Spinner label="Loading player…" />;
  if (error || !p) return <Empty>Player not found.</Empty>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo_url} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-panel-2 text-3xl font-black text-mut">
              {p.full_name.charAt(0)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black">{p.full_name}</h1>
            {p.display_name && p.display_name !== p.full_name && <p className="text-sm text-mut">&ldquo;{p.display_name}&rdquo;</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-mut">
              <span className="font-semibold text-ink">{p.primary_role.replace(/_/g, ' ')}</span>
              {p.country && <span>🌍 {p.country}</span>}
              {p.date_of_birth && <span>🎂 {calcAge(p.date_of_birth)} years ({new Date(p.date_of_birth).toLocaleDateString()})</span>}
              {p.height_cm && <span>📏 {fmtHeight(p.height_cm)}</span>}
              {p.batting_style && <span>🏏 {p.batting_style.replace('_', ' ')}</span>}
              {p.bowling_style && p.bowling_style !== 'none' && <span>⚾ {p.bowling_style.replace(/_/g, ' ')}</span>}
            </div>
            {p.teams.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.teams.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5 rounded-full bg-panel-2 px-2.5 py-1 text-xs font-semibold">
                    {t.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logo_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                    )}
                    {t.name}
                  </span>
                ))}
              </div>
            )}
            {p.major_teams && p.major_teams.length > 0 && (
              <p className="mt-2 text-xs text-mut">Also represented: <span className="text-ink">{p.major_teams.join(', ')}</span></p>
            )}
          </div>
        </div>
        {p.bio && <p className="mt-4 border-t border-line/40 pt-4 text-sm text-mut">{p.bio}</p>}
      </div>

      {/* Career stats */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mut">Career statistics</h2>
        {p.career_stats.length === 0 ? (
          <Empty>No completed matches yet.</Empty>
        ) : (
          <div className="space-y-4">
            {p.career_stats.map((s) => {
              const battingAvg = s.innings_batted - s.not_outs > 0 ? (s.runs_scored / (s.innings_batted - s.not_outs)).toFixed(2) : '—';
              const strikeRate = s.balls_faced > 0 ? ((s.runs_scored * 100) / s.balls_faced).toFixed(1) : '—';
              const bowlingAvg = s.wickets_taken > 0 ? (s.runs_conceded / s.wickets_taken).toFixed(2) : '—';
              const economy = s.balls_bowled > 0 ? ((s.runs_conceded * 6) / s.balls_bowled).toFixed(2) : '—';
              return (
                <div key={s.format_family} className="card overflow-hidden">
                  <div className="bg-panel-2 px-4 py-2 text-sm font-bold">{FORMAT_LABEL[s.format_family] ?? s.format_family}</div>
                  <div className="grid grid-cols-2 divide-x divide-line/40 sm:grid-cols-2">
                    <div className="p-4">
                      <div className="mb-2 text-xs font-bold uppercase text-mut">Batting</div>
                      <dl className="grid grid-cols-2 gap-y-1 text-sm">
                        <dt className="text-mut">Matches</dt><dd className="score-digits text-right font-semibold">{s.matches_played}</dd>
                        <dt className="text-mut">Runs</dt><dd className="score-digits text-right font-semibold">{s.runs_scored}</dd>
                        <dt className="text-mut">Average</dt><dd className="score-digits text-right font-semibold">{battingAvg}</dd>
                        <dt className="text-mut">Strike rate</dt><dd className="score-digits text-right font-semibold">{strikeRate}</dd>
                        <dt className="text-mut">High score</dt><dd className="score-digits text-right font-semibold">{s.highest_score}</dd>
                        <dt className="text-mut">50s / 100s</dt><dd className="score-digits text-right font-semibold">{s.fifties} / {s.hundreds}</dd>
                        <dt className="text-mut">4s / 6s</dt><dd className="score-digits text-right font-semibold">{s.fours} / {s.sixes}</dd>
                      </dl>
                    </div>
                    <div className="p-4">
                      <div className="mb-2 text-xs font-bold uppercase text-mut">Bowling &amp; fielding</div>
                      <dl className="grid grid-cols-2 gap-y-1 text-sm">
                        <dt className="text-mut">Wickets</dt><dd className="score-digits text-right font-semibold">{s.wickets_taken}</dd>
                        <dt className="text-mut">Average</dt><dd className="score-digits text-right font-semibold">{bowlingAvg}</dd>
                        <dt className="text-mut">Economy</dt><dd className="score-digits text-right font-semibold">{economy}</dd>
                        <dt className="text-mut">Best</dt>
                        <dd className="score-digits text-right font-semibold">{s.best_bowling ? `${s.best_bowling.wickets}/${s.best_bowling.runs}` : '—'}</dd>
                        <dt className="text-mut">5-wkt hauls</dt><dd className="score-digits text-right font-semibold">{s.five_wkt_hauls}</dd>
                        <dt className="text-mut">Catches</dt><dd className="score-digits text-right font-semibold">{s.catches}</dd>
                        <dt className="text-mut">Stumpings</dt><dd className="score-digits text-right font-semibold">{s.stumpings}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent matches */}
      {p.recent_matches.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-mut">Recent matches</h2>
          <div className="card divide-y divide-line/40 p-0">
            {p.recent_matches.map((m) => (
              <Link key={m.match_id} href={`/matches/${m.match_id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-panel-2/50">
                <span className="text-xs text-mut">{new Date(m.scheduled_start).toLocaleDateString()}</span>
                <span className="score-digits font-semibold">{m.runs_scored} runs{m.wickets_taken ? `, ${m.wickets_taken} wkt` : ''}</span>
                <span className="ml-auto text-xs text-mut">{m.result_summary ?? ''}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
