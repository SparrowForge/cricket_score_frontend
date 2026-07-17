'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { LiveState } from '@/lib/useLive';
import { InningsRow, MatchDetail, SquadPlayer, oversFromBalls } from '@/lib/types';
import { BallChip, Empty, Spinner } from '@/components/ui';
import {
  ChartLegend, OverComparisonChart, PlayerRunsChart, TeamFilter, WormChart, WormSeries, teamColorMap,
} from '@/components/match/charts';

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
                      <Link href={`/players/${id}`} className="hover:text-grass hover:underline">{b.name}</Link>
                      {state.engine?.strikerId === id && <span className="text-grass"> *</span>}
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
              <div className="font-semibold">
                <Link href={`/players/${state.current_bowler}`} className="hover:text-grass hover:underline">{bowler.name}</Link>
              </div>
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
  bowling: { id: string; full_name: string; legal_balls: number; maidens: number; runs_conceded: number; wickets: number }[];
  fall_of_wickets: { over_number: number; ball_in_over: number; batter: string; wicket_type: string; wicket_number: number; score_at: number }[];
  /** 'summary' = reconstructed from match-level stats because ball-by-ball detail isn't available for this innings. */
  detail_source: 'balls' | 'summary';
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
          {inn.detail_source === 'summary' && (
            <div className="bg-gold/10 px-4 py-1.5 text-xs text-gold">
              Ball-by-ball detail isn&apos;t available for this innings — figures below are match totals, not a full over-by-over card.
            </div>
          )}
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
                      <Link href={`/players/${b.id}`} className="font-semibold hover:text-grass hover:underline">{b.full_name}</Link>
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
                  <th className="px-2 py-2 text-right">M</th>
                  <th className="px-2 py-2 text-right">R</th><th className="px-2 py-2 text-right">W</th>
                  <th className="px-4 py-2 text-right">Econ</th>
                </tr>
              </thead>
              <tbody>
                {inn.bowling.map((b) => (
                  <tr key={b.id} className="border-t border-line/40">
                    <td className="px-4 py-2">
                      <Link href={`/players/${b.id}`} className="font-semibold hover:text-grass hover:underline">{b.full_name}</Link>
                    </td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{oversFromBalls(b.legal_balls)}</td>
                    <td className="score-digits px-2 py-2 text-right text-mut">{b.maidens}</td>
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
interface CommentaryEntry {
  id: string; body: string; is_highlight: boolean; author: string | null;
  created_at: string; over_number: number | null; ball_in_over: number | null;
  ball_id: string | null;
  runs_batter: number | null; runs_extras: number | null;
  extra_type: string | null; secondary_extra_type: string | null;
  secondary_extra_runs: number | null;
  is_boundary_four: boolean | null; is_boundary_six: boolean | null;
  is_wicket: boolean | null; wicket_type: string | null;
  striker_id: string | null; striker_name: string | null;
  non_striker_id: string | null; non_striker_name: string | null;
  bowler_id: string | null; bowler_name: string | null;
  dismissed_player_id: string | null; dismissed_player_name: string | null;
  fielder_player_id: string | null; fielder_name: string | null;
}
interface InningsSummary {
  seq: number; batting_team: string; total_runs: number; total_wickets: number; legal_balls: number;
  detail_source: 'balls' | 'summary';
}
const COMMENTARY_PAGE = 18; // ~3 overs per fetch; older pages stream in on scroll

const WICKET_TYPES = [
  'bowled', 'caught', 'caught_behind', 'caught_and_bowled', 'lbw',
  'run_out', 'stumped', 'hit_wicket', 'retired_hurt', 'retired_out',
  'obstructing_field', 'timed_out',
];

function BallEditModal({ entry, matchId, onClose, onSaved }: {
  entry: CommentaryEntry; matchId: string; onClose: () => void; onSaved: () => void;
}) {
  const autoPen = entry.extra_type === 'wide' || entry.extra_type === 'no_ball' ? 1 : 0;
  const [runsBatter, setRunsBatter] = useState(entry.runs_batter ?? 0);
  const [extraType, setExtraType] = useState<string | null>(entry.extra_type ?? null);
  const [runsExtras, setRunsExtras] = useState(Math.max(0, (entry.runs_extras ?? 0) - autoPen));
  const [secType, setSecType] = useState<string | null>(entry.secondary_extra_type ?? null);
  const [secRuns, setSecRuns] = useState(entry.secondary_extra_runs ?? 0);
  const [isFour, setIsFour] = useState(entry.is_boundary_four ?? false);
  const [isSix, setIsSix] = useState(entry.is_boundary_six ?? false);
  const [wicketType, setWicketType] = useState<string | null>(entry.wicket_type ?? null);
  const [dismissedId, setDismissedId] = useState<string | null>(entry.dismissed_player_id ?? entry.striker_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtraType = (et: string | null) => {
    setExtraType(et);
    setRunsExtras(0);
    setSecType(null);
    setSecRuns(0);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        runs_batter: runsBatter,
        is_boundary_four: isFour,
        is_boundary_six: isSix,
      };
      if (extraType) {
        payload.extra_type = extraType;
        payload.runs_extras = runsExtras;
        if (extraType === 'no_ball' && secType) {
          payload.secondary_extra_type = secType;
          payload.secondary_extra_runs = secRuns;
        }
      }
      if (wicketType) {
        payload.wicket_type = wicketType;
        if (dismissedId) payload.dismissed_player_id = dismissedId;
      }
      await api(`/matches/${matchId}/balls/${entry.ball_id}`, { method: 'PATCH', body: payload });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="card w-full max-w-sm space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Edit {entry.over_number}.{entry.ball_in_over}</h3>
          <button onClick={onClose} className="text-xl text-mut hover:text-ink">✕</button>
        </div>
        <p className="text-xs text-mut">{entry.bowler_name} to {entry.striker_name}</p>

        {/* Batter runs */}
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">Batter runs</div>
          <div className="grid grid-cols-8 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
              <button key={r} onClick={() => setRunsBatter(r)}
                className={`h-10 rounded-lg text-sm font-bold transition-colors ${
                  runsBatter === r ? 'bg-grass text-black' : 'bg-panel-2 hover:bg-line'
                }`}>{r}</button>
            ))}
          </div>
        </div>

        {/* Boundary */}
        <div className="flex gap-2">
          <button onClick={() => { setIsFour(!isFour); setIsSix(false); }}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              isFour ? 'border border-grass bg-grass/20 text-grass' : 'bg-panel-2 hover:bg-line'
            }`}>FOUR</button>
          <button onClick={() => { setIsSix(!isSix); setIsFour(false); }}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition-colors ${
              isSix ? 'border border-gold bg-gold/20 text-gold' : 'bg-panel-2 hover:bg-line'
            }`}>SIX</button>
        </div>

        {/* Extra type */}
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">Extra</div>
          <div className="flex flex-wrap gap-1.5">
            {[null, 'wide', 'no_ball', 'bye', 'leg_bye'].map((et) => (
              <button key={et ?? 'none'} onClick={() => handleExtraType(et)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  extraType === et
                    ? 'border-grass bg-grass/15 text-grass'
                    : 'border-line text-mut hover:text-ink'
                }`}>{et ?? 'None'}</button>
            ))}
          </div>
        </div>

        {/* Extra runs */}
        {extraType && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">
              {extraType === 'no_ball' ? 'Runs beyond no-ball penalty' : 'Extra runs'}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <button key={r} onClick={() => setRunsExtras(r)}
                  className={`h-9 rounded-lg text-sm font-bold transition-colors ${
                    runsExtras === r ? 'bg-grass text-black' : 'bg-panel-2 hover:bg-line'
                  }`}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {/* No-ball secondary */}
        {extraType === 'no_ball' && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">No-ball extra type</div>
            <div className="flex gap-1.5">
              {([null, 'bye', 'leg_bye'] as const).map((et) => (
                <button key={et ?? 'none'} onClick={() => { setSecType(et); setSecRuns(0); }}
                  className={`flex-1 rounded-full border px-2 py-1 text-xs font-bold transition-colors ${
                    secType === et
                      ? 'border-grass bg-grass/15 text-grass'
                      : 'border-line text-mut hover:text-ink'
                  }`}>{et ?? 'None'}</button>
              ))}
            </div>
            {secType && (
              <div className="mt-2 flex gap-1">
                {[0, 1, 2, 3, 4].map((r) => (
                  <button key={r} onClick={() => setSecRuns(r)}
                    className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors ${
                      secRuns === r ? 'bg-grass text-black' : 'bg-panel-2 hover:bg-line'
                    }`}>{r}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Wicket */}
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">Wicket</div>
          <select value={wicketType ?? ''} onChange={(e) => setWicketType(e.target.value || null)}
            className="w-full rounded-lg border border-line bg-panel p-2 text-sm">
            <option value="">No wicket</option>
            {WICKET_TYPES.map((wt) => (
              <option key={wt} value={wt}>{wt.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Dismissed player */}
        {wicketType && (
          <div>
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">Dismissed</div>
            <div className="flex gap-2">
              <button onClick={() => setDismissedId(entry.striker_id)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                  dismissedId === entry.striker_id
                    ? 'border border-cherry/40 bg-cherry/20 text-cherry'
                    : 'bg-panel-2 hover:bg-line'
                }`}>{entry.striker_name ?? 'Striker'}</button>
              {entry.non_striker_id && (
                <button onClick={() => setDismissedId(entry.non_striker_id)}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-colors ${
                    dismissedId === entry.non_striker_id
                      ? 'border border-cherry/40 bg-cherry/20 text-cherry'
                      : 'bg-panel-2 hover:bg-line'
                  }`}>{entry.non_striker_name ?? 'Non-striker'}</button>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-cherry">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turns known player-name substrings in free-text commentary into profile links. */
function linkifyNames(body: string, mentions: readonly (readonly [string | null, string | null])[]) {
  const known = mentions
    .filter((m): m is readonly [string, string] => !!m[0] && !!m[1])
    .filter((m, i, arr) => arr.findIndex((x) => x[1] === m[1]) === i)
    .sort((a, b) => b[1].length - a[1].length);
  if (known.length === 0) return body;
  const pattern = new RegExp(`(${known.map((m) => escapeRegExp(m[1])).join('|')})`, 'g');
  return body.split(pattern).map((part, i) => {
    const match = known.find((m) => m[1] === part);
    return match
      ? <Link key={i} href={`/players/${match[0]}`} className="font-semibold text-ink hover:text-grass hover:underline">{part}</Link>
      : <span key={i}>{part}</span>;
  });
}

export function CommentaryTab({ matchId, seq, canScore }: { matchId: string; seq: number; canScore?: boolean }) {
  const { data: scorecard } = useApi<InningsSummary[]>(`/matches/${matchId}/scorecard`, [seq]);
  const innings = useMemo(() => scorecard ?? [], [scorecard]);
  const detailInnings = useMemo(() => innings.filter((i) => i.detail_source === 'balls'), [innings]);
  const summaryOnlyInnings = innings.filter((i) => i.detail_source === 'summary');

  // Team/innings selector — defaults to the most recent innings until the user picks one.
  const [inningsSel, setInningsSel] = useState<number | null>(null);
  const latestSeq = detailInnings.length ? detailInnings[detailInnings.length - 1].seq : null;
  const active = inningsSel ?? latestSeq;

  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CommentaryEntry | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    (inningsSeq: number, before?: string) => api<CommentaryEntry[]>(
      `/matches/${matchId}/commentary?limit=${COMMENTARY_PAGE}&innings=${inningsSeq}` +
      (before ? `&before=${encodeURIComponent(before)}` : ''),
    ),
    [matchId],
  );

  // First page whenever the selected innings changes.
  useEffect(() => {
    if (active == null) { setLoading(false); return; }
    let cancel = false;
    setLoading(true); setExhausted(false); setEntries([]);
    fetchPage(active)
      .then((rows) => {
        if (cancel) return;
        setEntries(rows);
        if (rows.length < COMMENTARY_PAGE) setExhausted(true);
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [active, fetchPage]);

  // New ball arrived: merge the fresh newest page on top of what's loaded.
  useEffect(() => {
    if (active == null || seq === 0) return;
    let cancel = false;
    fetchPage(active)
      .then((rows) => {
        if (cancel) return;
        setEntries((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...rows.filter((r) => !seen.has(r.id)), ...prev];
        });
      })
      .catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const loadOlder = useCallback(async () => {
    if (active == null || loadingOlder || exhausted || entries.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldest = entries[entries.length - 1];
      const more = await fetchPage(active, oldest.created_at);
      setEntries((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...more.filter((m) => !seen.has(m.id))];
      });
      if (more.length < COMMENTARY_PAGE) setExhausted(true);
    } finally {
      setLoadingOlder(false);
    }
  }, [active, loadingOlder, exhausted, entries, fetchPage]);

  // Infinite scroll: fetch the next page when the bottom sentinel comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (ents) => { if (ents[0]?.isIntersecting) loadOlder(); },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadOlder]);

  const onBallSaved = useCallback(() => {
    setEditingEntry(null);
    if (active == null) return;
    fetchPage(active).then((rows) => {
      setEntries(rows);
      if (rows.length < COMMENTARY_PAGE) setExhausted(true);
    }).catch(() => {});
  }, [active, fetchPage]);

  if (loading && entries.length === 0 && summaryOnlyInnings.length === 0) return <Spinner />;
  if (!entries.length && summaryOnlyInnings.length === 0 && !loading) return <Empty>No commentary yet.</Empty>;

  const teamLabel = (inn: InningsSummary) =>
    detailInnings.filter((i) => i.batting_team === inn.batting_team).length > 1
      ? `${inn.batting_team} — inns ${inn.seq}` : inn.batting_team;
  const activeBattingTeam = detailInnings.find((i) => i.seq === active)?.batting_team ?? null;

  return (
    <div className="space-y-3">
      {detailInnings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {detailInnings.map((inn) => (
            <button key={inn.seq} onClick={() => setInningsSel(inn.seq)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                active === inn.seq ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut hover:text-ink'}`}>
              {teamLabel(inn)}
            </button>
          ))}
        </div>
      )}
      {summaryOnlyInnings.map((inn) => (
        <div key={inn.seq} className="card border-gold/40 bg-gold/5 p-4 text-xs text-gold">
          {inn.batting_team} — innings {inn.seq}: ball-by-ball commentary isn&apos;t available for this innings
          (final score {inn.total_runs}/{inn.total_wickets}, {oversFromBalls(inn.legal_balls)} overs).
        </div>
      ))}
      {entries.map((c) => {
        const mentions = [
          [c.bowler_id, c.bowler_name], [c.striker_id, c.striker_name],
          [c.non_striker_id, c.non_striker_name],
          [c.dismissed_player_id, c.dismissed_player_name], [c.fielder_player_id, c.fielder_name],
        ] as const;
        if (c.body.startsWith('End of innings')) {
          // Sections are " | "-separated: names contain periods ("Md. …"),
          // so sentence-splitting is unreliable.
          const [head, ...sections] = c.body.split(' | ');
          const m = head.match(/^End of innings (\d+): (.+) (\d+)\/(\d+) \((\d+\.\d+) ov\)(?: — (declared|forfeited))?\./);
          const topBat = sections.find((s) => s.startsWith('BAT: '))?.slice(5).split(' · ') ?? [];
          const topBowl = sections.find((s) => s.startsWith('BOWL: '))?.slice(6).split(' · ') ?? [];
          return (
            <div key={c.id} className="card border-gold/50 bg-gold/5 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-gold">
                Innings {m?.[1] ?? ''} complete{m?.[6] ? ` — ${m[6]}` : ''}
              </div>
              {m ? (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">{m[2]}</span>
                  <span className="text-sm font-black">
                    {m[3]}/{m[4]} <span className="text-xs font-normal text-mut">({m[5]} ov)</span>
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-sm font-semibold">{head}</p>
              )}
              {(topBat.length > 0 || topBowl.length > 0) && (
                <div className="mt-3 grid grid-cols-1 gap-3 border-t border-gold/20 pt-3 sm:grid-cols-2">
                  {topBat.length > 0 && (
                    <div>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-mut">Top batters</div>
                      {topBat.map((b, i) => (
                        <div key={i} className="text-xs font-semibold">{b}</div>
                      ))}
                    </div>
                  )}
                  {topBowl.length > 0 && (
                    <div className="sm:text-right">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-mut">Top bowlers (O-M-R-W)</div>
                      {topBowl.map((b, i) => (
                        <div key={i} className="text-xs font-semibold">{b}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }
        if (c.body.startsWith('End of over')) {
          const isWicketMaiden = c.body.includes('WICKET MAIDEN!');
          const isMaiden = isWicketMaiden || c.body.includes('Maiden over!');
          // New body format: "End of over N — X runs: TOTAL/WKTS. ..."
          // Old (backfilled) format: "End of over N: TOTAL/WKTS. ..." (no per-over run count)
          const overMatch = c.body.match(/^End of over (\d+)(?: — (\d+) runs)?: (\d+)\/(\d+)\./);
          const overNumber = overMatch?.[1] ?? null;
          const overRuns = overMatch?.[2] !== undefined ? Number(overMatch[2]) : null;
          const total = overMatch?.[3] ?? null;
          const wkts = overMatch?.[4] ?? null;
          const wicketMatch = c.body.match(/(\d+) WICKETS?!/);
          const overWickets = isWicketMaiden ? 1 : wicketMatch ? Number(wicketMatch[1]) : 0;
          const crr = total !== null && overNumber !== null && Number(overNumber) > 0
            ? (Number(total) / Number(overNumber)).toFixed(2) : null;

          // Strip the leading score sentence + maiden/wicket flag to split the
          // remainder into "batter figures" and "bowler figures" (the bowler
          // figures are anchored by the distinctive "O.B-M-R-W" pattern, since
          // splitting on ". " would break on "Md." in player names).
          let rest = c.body.replace(/^End of over \d+(?: — \d+ runs)?: \d+\/\d+\.\s*/, '');
          if (rest.startsWith('WICKET MAIDEN! ')) rest = rest.slice('WICKET MAIDEN! '.length);
          else if (rest.startsWith('Maiden over! ')) rest = rest.slice('Maiden over! '.length);
          else { const m = rest.match(/^\d+ WICKETS?! /); if (m) rest = rest.slice(m[0].length); }
          const bowlerMatch = rest.match(/\s*([^.]+\s\d+\.\d+-\d+-\d+-\d+)\s*$/);
          const bowlerLine = bowlerMatch ? bowlerMatch[1].trim() : null;
          const battersLine = (bowlerMatch ? rest.slice(0, rest.length - bowlerMatch[0].length) : rest).replace(/\.\s*$/, '');

          return (
            <div key={c.id} className={`card p-4 ${overWickets > 0 ? 'border-cherry/50 bg-cherry/5' : isMaiden ? 'border-grass/50 bg-grass/5' : 'border-line bg-panel-2/60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold uppercase tracking-wide text-mut">
                    {overNumber !== null ? `Over ${overNumber}` : 'Over summary'}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold">
                    {isMaiden && overWickets>0  ? 'Maiden Wicket' : isMaiden ? 'Maiden Over' : overRuns !== null ? `${overRuns} run${overRuns === 1 ? '' : 's'}` : null}
                    {overWickets > 0 && (
                      <>
                        {(isMaiden || overRuns !== null) && ', '}
                        <span className="text-cherry">{overWickets} wicket{overWickets === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </p>
                </div>
                {total !== null && (
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-black text-ink">
                      {activeBattingTeam && <span className="font-bold text-grass">{activeBattingTeam} </span>}
                      {total}/{wkts}
                    </div>
                    {crr !== null && <div className="text-[10px] text-mut">CRR {crr}</div>}
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-mut">
                <span>{linkifyNames(battersLine, mentions)}</span>
                {bowlerLine && <span className="shrink-0 whitespace-nowrap font-semibold text-ink">{linkifyNames(bowlerLine, mentions)}</span>}
              </div>
              <div className="mt-1 text-right text-[10px] text-mut">{new Date(c.created_at).toLocaleTimeString()}</div>
            </div>
          );
        }
        // Fielding events posted from the scorer console's quick buttons
        const fieldingEvent = c.body.startsWith('DROPPED CATCH!') ? 'DROPPED CATCH'
          : c.body.startsWith('RUN OUT MISSED!') ? 'RUN OUT MISSED'
          : c.body.startsWith('MISFIELD!') ? 'MISFIELD' : null;
        const isBall = c.over_number != null;
        const isWicket = /WICKET!/.test(c.body);
        const isSix = /\bSIX!/.test(c.body);
        const isFour = /\bFOUR!/.test(c.body);
        const isWide = isBall && /, wide/.test(c.body);
        const isNoBall = isBall && /, no ball/.test(c.body);
        const isDot = isBall && /, no run/.test(c.body);
        const chip = isWicket ? 'W' : isSix ? '6' : isFour ? '4'
          : isWide ? 'wd' : isNoBall ? 'nb' : isDot ? '0' : null;
        const textColor = fieldingEvent ? 'text-gold' : isWicket ? 'text-cherry' : isSix ? 'text-gold' : isFour ? 'text-grass' : '';
        const border = fieldingEvent ? 'border-gold/50' : isWicket ? 'border-cherry/50' : isSix ? 'border-gold/50' : isFour ? 'border-grass/50' : c.is_highlight ? 'border-gold/50' : '';
        return (
          <div key={c.id} className={`card p-4 ${border}`}>
            <div className="mb-1 flex items-center gap-2 text-xs text-mut">
              {c.over_number != null && <span className="font-bold text-ink">{c.over_number}.{c.ball_in_over}</span>}
              {fieldingEvent && (
                <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-gold">
                  {fieldingEvent}
                </span>
              )}
              {!fieldingEvent && chip && <BallChip label={chip} />}
              {c.author && <span>{c.author}</span>}
              <span className="ml-auto flex items-center gap-2">
                {new Date(c.created_at).toLocaleTimeString()}
                {canScore && c.ball_id && isBall && (
                  <button onClick={() => setEditingEntry(c)}
                    title="Edit this ball"
                    className="rounded p-0.5 text-mut opacity-60 hover:opacity-100 hover:text-ink transition-opacity">
                    ✏
                  </button>
                )}
              </span>
            </div>
            <p className={`text-sm ${textColor ? `${textColor} font-semibold` : ''}`}>{linkifyNames(c.body, mentions)}</p>
          </div>
        );
      })}
      <div ref={sentinelRef} />
      {loadingOlder && <div className="py-2 text-center text-xs text-mut">Loading older commentary…</div>}
      {exhausted && entries.length > 0 && (
        <div className="py-2 text-center text-[10px] uppercase tracking-wide text-mut">Start of innings</div>
      )}
      {editingEntry && (
        <BallEditModal
          entry={editingEntry}
          matchId={matchId}
          onClose={() => setEditingEntry(null)}
          onSaved={onBallSaved}
        />
      )}
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

  // Over comparison: one bar group per over, one bar per innings.
  const teamsInOrder = [...new Set(data.map((o) => o.batting_team))];
  const colors = teamColorMap(teamsInOrder);
  const inningsKeys = Object.keys(byInnings);
  const teamBatsTwice = inningsKeys.length > teamsInOrder.length;
  const seriesLabel = (overs: typeof data) =>
    teamBatsTwice ? `${overs[0].batting_team} (inn ${overs[0].innings})` : overs[0].batting_team;
  const maxOverNo = Math.max(...data.map((o) => o.over_number));
  const comparisonRows = Array.from({ length: maxOverNo + 1 }, (_, over) => ({
    over,
    values: inningsKeys.flatMap((key) => {
      const o = byInnings[key].find((r) => r.over_number === over);
      return o ? [{ name: seriesLabel(byInnings[key]), color: colors[o.batting_team], runs: o.runs, wickets: o.wickets }] : [];
    }),
  }));

  return (
    <div className="space-y-6">
      {inningsKeys.length > 1 && (
        <div className="card p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Over comparison — runs per over</div>
          <OverComparisonChart rows={comparisonRows} />
          <ChartLegend items={[
            ...inningsKeys.map((key) => ({ label: seriesLabel(byInnings[key]), color: colors[byInnings[key][0].batting_team] })),
            { label: 'Wicket', color: 'var(--color-cherry)' },
          ]} />
        </div>
      )}
      {Object.entries(byInnings).map(([key, overs]) => (
        <div key={key} className="card p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">
            {overs[0].batting_team} — runs per over
          </div>
          <div className="flex items-end gap-1">
            {overs.map((o) => (
              <div key={o.over_number} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-bold text-mut opacity-0 group-hover:opacity-100">{o.runs}</span>
                {/* px height: a % here resolves against the auto-height column and collapses to 0 */}
                <div
                  className={`w-full max-w-6 rounded-t ${o.wickets > 0 ? 'bg-cherry' : 'bg-grass'}`}
                  style={{ height: `${Math.max((o.runs / max) * 120, 4)}px` }}
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

// ============ Wagon Wheel SVG (reusable) ============
function WagonWheelSvg({ shots }: { shots: { wagon: { angle_deg: number; distance_pct: number }; is_boundary_four: boolean; is_boundary_six: boolean }[] }) {
  if (shots.length === 0) {
    return <div className="py-10 text-center text-sm text-mut">No shot data captured.</div>;
  }
  return (
    <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-xs">
      <circle cx="100" cy="100" r="95" fill="none" stroke="var(--color-line)" strokeWidth="1" />
      <circle cx="100" cy="100" r="45" fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
      <rect x="97" y="88" width="6" height="24" rx="2" fill="var(--color-panel-2)" stroke="var(--color-line)" />
      {shots.map((w, i) => {
        const rad = ((w.wagon.angle_deg - 90) * Math.PI) / 180;
        // 4s and 6s extend all the way to the boundary ring
        const dist = (w.is_boundary_four || w.is_boundary_six) ? 95 : (w.wagon.distance_pct / 100) * 92;
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
  );
}

// ============ Stats (graphs + wagon wheel + partnerships) ============
export function StatsTab({ matchId, seq }: { matchId: string; seq: number }) {
  const { data, loading } = useApi<{
    wagon_wheel: { batter: string; wagon: { angle_deg: number; distance_pct: number }; runs_batter: number; is_boundary_four: boolean; is_boundary_six: boolean; innings: number }[];
    partnerships: { innings: number; batting_team: string; batters: string[]; runs: number; balls: number; wicket_number: number; unbeaten: boolean }[];
    run_rate: { innings: number; batting_team: string; over_number: number; runs: number; wickets: number; cumulative_runs: number; cumulative_wickets: number }[];
    batting: { player_id: string; full_name: string; innings: number; team: string; runs: number; balls: number }[];
  }>(`/matches/${matchId}/stats`, [seq]);
  const [teamSel, setTeamSel] = useState('all');
  const [wagPlayerSel, setWagPlayerSel] = useState('');
  if (loading) return <Spinner />;
  const wagon = data?.wagon_wheel ?? [];
  const partnerships = data?.partnerships ?? [];
  const runRate = data?.run_rate ?? [];
  const batting = data?.batting ?? [];
  const maxP = Math.max(...partnerships.map((p) => p.runs), 1);

  // Team → color, stable by first-batting order; filter never repaints survivors.
  const teamsInOrder = [...new Set(runRate.map((r) => r.batting_team))];
  const colors = teamColorMap(teamsInOrder);
  const wantTeam = (team: string) => teamSel === 'all' || teamSel === team;

  // Worm series per innings (a team may bat twice in multi-innings formats)
  const byInnings = runRate.reduce<Record<string, typeof runRate>>((acc, r) => {
    ((acc[`${r.innings}-${r.batting_team}`] ??= []) as typeof runRate).push(r);
    return acc;
  }, {});
  const teamBatsTwice = Object.keys(byInnings).length > teamsInOrder.length;
  const wormSeries: WormSeries[] = Object.values(byInnings)
    .filter((rows) => wantTeam(rows[0].batting_team))
    .map((rows) => ({
      name: teamBatsTwice ? `${rows[0].batting_team} (inn ${rows[0].innings})` : rows[0].batting_team,
      color: colors[rows[0].batting_team],
      points: [{ x: 0, y: 0 }, ...rows.map((r) => ({ x: r.over_number + 1, y: r.cumulative_runs, wickets: r.wickets }))],
    }));
  const rrSeries: WormSeries[] = Object.values(byInnings)
    .filter((rows) => wantTeam(rows[0].batting_team))
    .map((rows) => ({
      name: teamBatsTwice ? `${rows[0].batting_team} (inn ${rows[0].innings})` : rows[0].batting_team,
      color: colors[rows[0].batting_team],
      points: rows.map((r) => ({
        x: r.over_number + 1,
        y: +(r.cumulative_runs / (r.over_number + 1)).toFixed(2),
        wickets: r.wickets,
      })),
    }));

  // Player runs, aggregated across innings, highest first
  const playerRuns = Object.values(
    batting.filter((b) => wantTeam(b.team)).reduce<Record<string, { name: string; playerId: string; team: string; runs: number; balls: number }>>((acc, b) => {
      const key = `${b.team}-${b.player_id}`;
      acc[key] ??= { name: b.full_name, playerId: b.player_id, team: b.team, runs: 0, balls: 0 };
      acc[key].runs += b.runs;
      acc[key].balls += b.balls;
      return acc;
    }, {}),
  ).sort((a, b) => b.runs - a.runs);

  const legendItems = teamsInOrder.filter(wantTeam).map((t) => ({ label: t, color: colors[t] }));

  return (
    <div className="space-y-6">
      {runRate.length > 0 && (
        <>
          {teamsInOrder.length > 1 && <TeamFilter teams={teamsInOrder} value={teamSel} onChange={setTeamSel} />}

          {playerRuns.length > 0 && (
            <div className="card p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Batter runs</div>
              <PlayerRunsChart rows={playerRuns} colors={colors} />
              {legendItems.length > 1 && <ChartLegend items={legendItems} />}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Worm — total runs by over</div>
              <WormChart series={wormSeries} />
              <ChartLegend items={[...legendItems, { label: 'Wicket', color: 'var(--color-cherry)' }]} />
            </div>
            <div className="card p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Run rate by over</div>
              <WormChart series={rrSeries} yFmt={(v) => v.toFixed(1)} />
              <ChartLegend items={[...legendItems, { label: 'Wicket', color: 'var(--color-cherry)' }]} />
            </div>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Wagon wheel — team</div>
        <WagonWheelSvg shots={wagon} />
        <div className="mt-2 flex justify-center gap-4 text-[10px] text-mut">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />Six</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-grass" />Four</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-mut" />Other</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Wagon wheel — player</div>
        {wagon.length === 0 ? (
          <div className="py-10 text-center text-sm text-mut">No shot data captured for this match.</div>
        ) : (
          <>
            {/* Player filter buttons */}
            <div className="mb-3 flex flex-wrap gap-1">
              {[...new Set(wagon.map((w) => w.batter))].map((name) => (
                <button key={name} onClick={() => setWagPlayerSel(wagPlayerSel === name ? '' : name)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    wagPlayerSel === name ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut hover:text-ink'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
            <WagonWheelSvg shots={wagPlayerSel ? wagon.filter((w) => w.batter === wagPlayerSel) : wagon} />
            <div className="mt-2 flex justify-center gap-4 text-[10px] text-mut">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />Six</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-grass" />Four</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-mut" />Other</span>
            </div>
          </>
        )}
      </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
              <span className="font-semibold">
                <Link href={`/players/${r.player_id}`} className="hover:text-grass hover:underline">{r.full_name}</Link>
                {' '}<span className="text-xs text-mut">({r.team})</span>
              </span>
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
                <Link href={`/players/${p.player_id}`} className="font-semibold hover:text-grass hover:underline">{p.full_name}</Link>
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
