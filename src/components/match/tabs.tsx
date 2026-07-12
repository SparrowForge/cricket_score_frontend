'use client';

import { useApi } from '@/lib/hooks';
import { LiveState } from '@/lib/useLive';
import { InningsRow, MatchDetail, SquadPlayer, oversFromBalls } from '@/lib/types';
import { BallChip, Empty, Spinner } from '@/components/ui';

// ============ Summary (live) ============
export function SummaryTab({ state, match }: { state: LiveState | null; match: MatchDetail }) {
  if (!state) return <Spinner />;
  const s = state.summary;
  const batters = Object.entries(state.batters ?? {}).filter(([, b]) => !b.out);
  const bowler = state.current_bowler ? state.bowlers?.[state.current_bowler] : null;

  return (
    <div className="space-y-4">
      {state.result_summary && (
        <div className="card border-grass/40 bg-grass/10 p-4 text-center font-bold text-grass">
          {state.result_summary}
        </div>
      )}
      {match.dls_applied && (
        <div className="rounded-lg bg-gold/10 px-4 py-2 text-xs font-semibold text-gold">
          Rain-revised (DLS): {state.dls?.revised_overs ? `${state.dls.revised_overs} overs` : ''}
          {state.dls?.revised_target ? ` · target ${state.dls.revised_target}` : ''}
        </div>
      )}

      {s && (
        <div className="card p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-mut">{s.batting_team} batting</div>
              <div className="score-digits text-4xl font-black">
                {s.score} <span className="text-lg font-semibold text-mut">({s.overs} ov)</span>
              </div>
            </div>
            <div className="text-right text-sm text-mut">
              <div>CRR <span className="font-bold text-ink">{s.current_rr}</span></div>
              {s.required_rr != null && <div>RRR <span className="font-bold text-gold">{s.required_rr}</span></div>}
              {s.target != null && <div className="mt-1 font-semibold text-ink">Target {s.target}</div>}
            </div>
          </div>
          {state.this_over && state.this_over.length > 0 && (
            <div className="mt-4 flex items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-mut">This over</span>
              {state.this_over.map((b, i) => <BallChip key={i} label={b} />)}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mut">Batters</div>
          {batters.length === 0 ? <div className="text-sm text-mut">Waiting for openers…</div> : (
            <table className="w-full text-sm">
              <tbody>
                {batters.map(([id, b]) => (
                  <tr key={id} className="border-t border-line/50 first:border-0">
                    <td className="py-1.5 font-semibold">
                      {b.name}{state.engine?.strikerId === id && <span className="text-grass"> *</span>}
                    </td>
                    <td className="score-digits py-1.5 text-right font-bold">{b.runs}</td>
                    <td className="score-digits py-1.5 pl-3 text-right text-mut">({b.balls})</td>
                    <td className="py-1.5 pl-3 text-right text-xs text-mut">{b.fours}×4 {b.sixes}×6</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mut">Bowling</div>
          {bowler ? (
            <div className="text-sm">
              <div className="font-semibold">{bowler.name}</div>
              <div className="score-digits mt-1 text-mut">
                {oversFromBalls(bowler.legal_balls)}-{bowler.maidens}-{bowler.runs}-<span className="font-bold text-cherry">{bowler.wickets}</span>
                <span className="ml-3">Econ {bowler.legal_balls > 0 ? ((bowler.runs * 6) / bowler.legal_balls).toFixed(2) : '—'}</span>
              </div>
            </div>
          ) : <div className="text-sm text-mut">—</div>}
          {state.engine?.freeHitPending && (
            <div className="mt-3 inline-block rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold">FREE HIT</div>
          )}
        </div>
      </div>

      <InningsStrip innings={match.innings} />
    </div>
  );
}

function InningsStrip({ innings }: { innings: InningsRow[] }) {
  if (!innings?.length) return null;
  return (
    <div className="card divide-y divide-line/50 p-0">
      {innings.map((i) => (
        <div key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
          <span className="font-semibold">
            {i.batting_team} — {i.seq}{['st', 'nd', 'rd'][i.seq - 1] ?? 'th'} innings
            {i.is_follow_on && <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">FOLLOW-ON</span>}
          </span>
          <span className="score-digits font-bold">
            {i.total_runs}/{i.total_wickets} <span className="font-normal text-mut">({oversFromBalls(i.legal_balls)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ============ Scorecard ============
interface ScorecardInnings extends InningsRow {
  batting_short: string; bowling_short: string;
  batting: { id: string; full_name: string; balls: number; runs: number; fours: number; sixes: number; is_out: boolean; dismissal: string | null }[];
  bowling: { id: string; full_name: string; legal_balls: number; runs_conceded: number; wickets: number }[];
  fall_of_wickets: { over_number: number; ball_in_over: number; batter: string; wicket_type: string; wicket_number: number; score_at: number }[];
}

export function ScorecardTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<ScorecardInnings[]>(`/matches/${matchId}/scorecard`, [seq]);
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty>Scorecard appears once play begins.</Empty>;

  return (
    <div className="space-y-6">
      {data.map((inn) => (
        <div key={inn.id} className="card overflow-hidden">
          <div className="flex items-center justify-between bg-panel-2 px-4 py-2.5">
            <span className="font-bold">{inn.batting_team} — innings {inn.seq}{inn.is_follow_on ? ' (follow-on)' : ''}</span>
            <span className="score-digits font-black">{inn.total_runs}/{inn.total_wickets} ({oversFromBalls(inn.legal_balls)})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-mut">
                  <th className="px-4 py-2">Batter</th><th className="px-2 py-2 text-right">R</th>
                  <th className="px-2 py-2 text-right">B</th><th className="px-2 py-2 text-right">4s</th>
                  <th className="px-2 py-2 text-right">6s</th><th className="px-4 py-2 text-right">SR</th>
                </tr>
              </thead>
              <tbody>
                {inn.batting.map((b) => (
                  <tr key={b.id} className="border-t border-line/40">
                    <td className="px-4 py-2">
                      <span className="font-semibold">{b.full_name}</span>
                      <span className="ml-2 text-xs text-mut">{b.is_out ? (b.dismissal ?? 'out').replace(/_/g, ' ') : 'not out'}</span>
                    </td>
                    <td className="score-digits px-2 py-2 text-right font-bold">{b.runs}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{b.balls}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{b.fours}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{b.sixes}</td>
                    <td className="score-digits px-4 py-2 text-right text-mut">{b.balls ? ((b.runs * 100) / b.balls).toFixed(1) : '—'}</td>
                  </tr>
                ))}
                <tr className="border-t border-line/40 text-xs text-mut">
                  <td className="px-4 py-2" colSpan={6}>
                    Extras: {inn.extras_wides}wd {inn.extras_no_balls}nb {inn.extras_byes}b {inn.extras_leg_byes}lb
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {inn.fall_of_wickets?.length > 0 && (
            <div className="border-t border-line/40 px-4 py-2 text-xs text-mut">
              <span className="font-semibold text-ink">Fall: </span>
              {inn.fall_of_wickets.map((f) => `${f.score_at}/${f.wicket_number} (${f.batter}, ${f.over_number}.${f.ball_in_over})`).join(' · ')}
            </div>
          )}
          <div className="overflow-x-auto border-t border-line/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-mut">
                  <th className="px-4 py-2">Bowler</th><th className="px-2 py-2 text-right">O</th>
                  <th className="px-2 py-2 text-right">R</th><th className="px-2 py-2 text-right">W</th>
                  <th className="px-4 py-2 text-right">Econ</th>
                </tr>
              </thead>
              <tbody>
                {inn.bowling.map((b) => (
                  <tr key={b.id} className="border-t border-line/40">
                    <td className="px-4 py-2 font-semibold">{b.full_name}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{oversFromBalls(b.legal_balls)}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{b.runs_conceded}</td>
                    <td className="score-digits px-2 py-2 text-right font-bold text-cherry">{b.wickets}</td>
                    <td className="score-digits px-4 py-2 text-right text-mut">{b.legal_balls ? ((b.runs_conceded * 6) / b.legal_balls).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Commentary ============
export function CommentaryTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<{ id: string; body: string; is_highlight: boolean; author: string | null; created_at: string; over_number: number | null; ball_in_over: number | null }[]>(
    `/matches/${matchId}/commentary`, [seq],
  );
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty>No commentary yet.</Empty>;
  return (
    <div className="space-y-3">
      {data.map((c) => (
        <div key={c.id} className={`card p-4 ${c.is_highlight ? 'border-gold/50' : ''}`}>
          <div className="mb-1 flex items-center gap-2 text-xs text-mut">
            {c.over_number != null && <span className="font-bold text-ink">{c.over_number}.{c.ball_in_over}</span>}
            {c.author && <span>{c.author}</span>}
            <span className="ml-auto">{new Date(c.created_at).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm">{c.body}</p>
        </div>
      ))}
    </div>
  );
}

// ============ Overs (Manhattan) ============
export function OversTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<{ innings: number; batting_team: string; over_number: number; runs: number; wickets: number; bowler: string; cumulative_runs: number }[]>(
    `/matches/${matchId}/overs`, [seq],
  );
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty>Over data appears once play begins.</Empty>;

  const byInnings = data.reduce<Record<string, typeof data>>((acc, o) => {
    const key = `${o.innings}-${o.batting_team}`;
    (acc[key] ??= []).push(o);
    return acc;
  }, {});
  const max = Math.max(...data.map((o) => o.runs), 12);

  return (
    <div className="space-y-6">
      {Object.entries(byInnings).map(([key, overs]) => (
        <div key={key} className="card p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">
            {overs[0].batting_team} — runs per over
          </div>
          <div className="flex h-40 items-end gap-1">
            {overs.map((o) => (
              <div key={o.over_number} className="group relative flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-mut opacity-0 group-hover:opacity-100">{o.runs}</span>
                <div
                  className={`w-full rounded-t ${o.wickets > 0 ? 'bg-cherry' : 'bg-grass'}`}
                  style={{ height: `${Math.max((o.runs / max) * 100, 3)}%` }}
                  title={`Over ${o.over_number + 1}: ${o.runs} runs, ${o.wickets} wkt (${o.bowler}) — ${o.cumulative_runs} total`}
                />
                <span className="text-[10px] text-mut">{o.over_number + 1}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-mut">Red bars = overs with a wicket. Hover for details.</p>
    </div>
  );
}

// ============ Stats (wagon wheel + partnerships) ============
export function StatsTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<{
    wagon_wheel: { batter: string; wagon: { angle_deg: number; distance_pct: number }; runs_batter: number; is_boundary_four: boolean; is_boundary_six: boolean; innings: number }[];
    partnerships: { innings: number; batting_team: string; batters: string[]; runs: number; balls: number; wicket_number: number; unbeaten: boolean }[];
  }>(`/matches/${matchId}/stats`, [seq]);
  if (loading) return <Spinner />;
  const wagon = data?.wagon_wheel ?? [];
  const partnerships = data?.partnerships ?? [];
  const maxP = Math.max(...partnerships.map((p) => p.runs), 1);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Wagon wheel</div>
        {wagon.length === 0 ? (
          <div className="py-10 text-center text-sm text-mut">No shot data captured for this match.</div>
        ) : (
          <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-xs">
            <circle cx="100" cy="100" r="95" fill="none" stroke="var(--color-line)" strokeWidth="1" />
            <circle cx="100" cy="100" r="45" fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
            <rect x="97" y="88" width="6" height="24" rx="2" fill="var(--color-panel-2)" stroke="var(--color-line)" />
            {wagon.map((w, i) => {
              const rad = ((w.wagon.angle_deg - 90) * Math.PI) / 180;
              const dist = (w.wagon.distance_pct / 100) * 92;
              const x = 100 + Math.cos(rad) * dist;
              const y = 100 + Math.sin(rad) * dist;
              const color = w.is_boundary_six ? 'var(--color-gold)' : w.is_boundary_four ? 'var(--color-grass)' : 'var(--color-mut)';
              return (
                <g key={i}>
                  <line x1="100" y1="100" x2={x} y2={y} stroke={color} strokeWidth="1.5" opacity="0.8" />
                  <circle cx={x} cy={y} r="2.5" fill={color} />
                </g>
              );
            })}
          </svg>
        )}
        <div className="mt-2 flex justify-center gap-4 text-[10px] text-mut">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />Six</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-grass" />Four</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-mut" />Other</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Partnerships</div>
        {partnerships.length === 0 ? (
          <div className="py-10 text-center text-sm text-mut">No partnerships yet.</div>
        ) : (
          <div className="space-y-2">
            {partnerships.map((p, i) => (
              <div key={i}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="text-mut">{p.batters.join(' & ')} <span className="opacity-60">(inn {p.innings})</span></span>
                  <span className="score-digits font-bold">{p.runs} ({p.balls}){p.unbeaten ? '*' : ''}</span>
                </div>
                <div className="h-2 rounded-full bg-panel-2">
                  <div className="h-2 rounded-full bg-grass" style={{ width: `${(p.runs / maxP) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ MVP ============
export function MvpTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<{ player_id: string; full_name: string; team: string; batting_points: string; bowling_points: string; fielding_points: string; total_points: string }[]>(
    `/matches/${matchId}/mvp`, [seq],
  );
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty>MVP standings are computed when the match completes.</Empty>;
  const max = Math.max(...data.map((r) => Number(r.total_points)), 1);
  return (
    <div className="card divide-y divide-line/40 p-0">
      {data.map((r, i) => (
        <div key={r.player_id} className="flex items-center gap-3 px-4 py-3">
          <span className={`w-6 text-center font-black ${i === 0 ? 'text-gold' : 'text-mut'}`}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{r.full_name} <span className="text-xs text-mut">({r.team})</span></span>
              <span className="score-digits font-bold">{Number(r.total_points).toFixed(1)}</span>
            </div>
            <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-panel-2" title={`Bat ${r.batting_points} · Bowl ${r.bowling_points} · Field ${r.fielding_points}`}>
              <div className="bg-grass" style={{ width: `${(Number(r.batting_points) / max) * 100}%` }} />
              <div className="bg-cherry" style={{ width: `${(Number(r.bowling_points) / max) * 100}%` }} />
              <div className="bg-gold" style={{ width: `${(Number(r.fielding_points) / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Squads ============
export function SquadsTab({ matchId }: { matchId: string }) {
  const { data, loading } = useApi<SquadPlayer[]>(`/matches/${matchId}/squads`);
  if (loading) return <Spinner />;
  if (!data?.length) return <Empty>Squads have not been announced.</Empty>;
  const teams = [...new Set(data.map((p) => p.team))];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {teams.map((team) => (
        <div key={team} className="card p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-mut">{team}</div>
          <ul className="space-y-1.5 text-sm">
            {data.filter((p) => p.team === team).map((p) => (
              <li key={p.player_id} className="flex items-center gap-2">
                <span className="font-semibold">{p.full_name}</span>
                {p.is_captain && <span className="rounded bg-panel-2 px-1 text-[10px] font-bold text-gold">C</span>}
                {p.is_wicket_keeper && <span className="rounded bg-panel-2 px-1 text-[10px] font-bold text-grass">WK</span>}
                {p.is_twelfth && <span className="rounded bg-panel-2 px-1 text-[10px] font-bold text-mut">12th</span>}
                <span className="ml-auto text-xs text-mut">{p.primary_role.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
