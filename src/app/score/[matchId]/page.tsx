'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, uuid, ApiError } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useLiveMatch, LiveState } from '@/lib/useLive';
import { MatchDetail, SquadPlayer, Team, oversFromBalls } from '@/lib/types';
import { BallChip, ErrorBox, Modal, Spinner, StatusBadge } from '@/components/ui';

type ExtraMode = null | 'wide' | 'no_ball' | 'bye' | 'leg_bye';
// A no-ball can ALSO have byes/leg-byes run off it — the no-ball penalty
// stays a no-ball, the extra runs are scored (and charged) as byes/leg-byes,
// never lumped into the no-ball or dropped. Off by default (no_ball runs
// are off the bat unless the scorer flags this).
type NoBallByes = null | 'bye' | 'leg_bye';
interface Pick { id: string; name: string }

/**
 * Named field regions for one-tap shot placement. Angles feed the wagon-wheel
 * chart (0° = straight down the ground, clockwise; right-hand batter's off
 * side to the right); distance is a typical depth for the position.
 */
const FIELD_REGIONS = [
  // --- OFF SIDE (Behind the Wicket) ---
  { region: 'wicket_keeper',      label: 'Wicket Keeper',       angle: 180,  dist: 25 },
  { region: 'first_slip',         label: 'First Slip',          angle: 170,  dist: 28 },
  { region: 'second_slip',        label: 'Second Slip',         angle: 162,  dist: 29 },
  { region: 'third_slip',         label: 'Third Slip',          angle: 154,  dist: 30 },
  { region: 'fourth_slip',        label: 'Fourth Slip',         angle: 146,  dist: 31 },
  { region: 'fly_slip',           label: 'Fly Slip',            angle: 160,  dist: 55 },
  { region: 'third_man',          label: 'Third Man',           angle: 135,  dist: 85 },
  { region: 'gully',              label: 'Gully',               angle: 120,  dist: 45 },

  // --- OFF SIDE (In Front / Square of Wicket) ---
  { region: 'silly_point',        label: 'Silly Point',         angle: 85,   dist: 12 },
  { region: 'point',              label: 'Point',               angle: 90,   dist: 60 },
  { region: 'deep_point',         label: 'Deep Point',          angle: 90,   dist: 90 },
  { region: 'cover',              label: 'Cover',               angle: 55,   dist: 65 },
  { region: 'deep_cover',         label: 'Deep Cover',          angle: 55,   dist: 90 },
  { region: 'extra_cover',        label: 'Extra Cover',         angle: 35,   dist: 60 },
  { region: 'deep_extra_cover',   label: 'Deep Extra Cover',    angle: 35,   dist: 90 },
  { region: 'silly_mid_off',      label: 'Silly Mid-Off',       angle: 15,   dist: 12 },
  { region: 'mid_off',            label: 'Mid Off',             angle: 25,   dist: 55 },
  { region: 'long_off',           label: 'Long Off',            angle: 15,   dist: 90 },

  // --- LEG SIDE / ON SIDE (In Front / Straight) ---
  { region: 'silly_mid_on',       label: 'Silly Mid-On',        angle: -15,  dist: 12 },
  { region: 'mid_on',             label: 'Mid On',              angle: -25,  dist: 55 },
  { region: 'long_on',            label: 'Long On',             angle: -15,  dist: 90 },
  { region: 'mid_wicket',         label: 'Mid Wicket',          angle: -55,  dist: 60 },
  { region: 'deep_mid_wicket',    label: 'Deep Mid-Wicket',     angle: -55,  dist: 90 },

  // --- LEG SIDE / ON SIDE (Square / Behind Wicket) ---
  { region: 'forward_short_leg',  label: 'Forward Short Leg',   angle: -75,  dist: 12 },
  { region: 'square_leg',         label: 'Square Leg',          angle: -90,  dist: 60 },
  { region: 'deep_square_leg',    label: 'Deep Square Leg',     angle: -90,  dist: 90 },
  { region: 'short_leg',          label: 'Short Leg',           angle: -115, dist: 12 },
  { region: 'leg_gully',          label: 'Leg Gully',           angle: -130, dist: 35 },
  { region: 'leg_slip',           label: 'Leg Slip',            angle: -165, dist: 25 },
  { region: 'fine_leg',           label: 'Fine Leg',            angle: -145, dist: 80 },
  { region: 'deep_fine_leg',      label: 'Deep Fine Leg',       angle: -145, dist: 95 },
] as const;

type FieldRegion = (typeof FIELD_REGIONS)[number]['region'];


export default function ScorerConsolePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { state, setState } = useLiveMatch(matchId);
  const { data: match, reload: reloadMatch } = useApi<MatchDetail>(`/matches/${matchId}`, [state?.status]);
  const { data: squads, reload: reloadSquads } = useApi<SquadPlayer[]>(`/matches/${matchId}/squads`);
  const { data: teamA } = useApi<Team>(match ? `/teams/${match.team_a_id}` : null);
  const { data: teamB } = useApi<Team>(match ? `/teams/${match.team_b_id}` : null);

  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [extraMode, setExtraMode] = useState<ExtraMode>(null);
  const [nbByes, setNbByes] = useState<NoBallByes>(null);
  const [shotArea, setShotArea] = useState<FieldRegion | null>(null);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [nextBowler, setNextBowler] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // Player pools per team: match squad if set, else the team's registered squad
  const poolFor = useCallback((teamId: string | undefined): Pick[] => {
    if (!teamId) return [];
    const fromMatch = (squads ?? []).filter((s) => s.team_id === teamId && (s.is_playing_xi || s.is_twelfth));
    if (fromMatch.length) return fromMatch.map((s) => ({ id: s.player_id, name: s.full_name }));
    const team = teamId === match?.team_a_id ? teamA : teamB;
    return (team?.squad ?? []).map((p) => ({ id: p.id, name: p.full_name }));
  }, [squads, match, teamA, teamB]);

  const currentInnings = useMemo(
    () => match?.innings?.find((i) => i.seq === (state?.innings_seq ?? match.innings.length)),
    [match, state],
  );
  const battingPool = poolFor(currentInnings?.batting_team_id);
  const bowlingPool = poolFor(currentInnings?.bowling_team_id);

  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (err) {
      const e = err as ApiError;
      if (e.body?.code === 'SEQ_CONFLICT') setError({ message: 'State was stale — resynced. Try again.' });
      else setError(e);
    } finally { setBusy(false); }
  };

  const postBall = (payload: Record<string, unknown>) =>
    call(async () => {
      const area = FIELD_REGIONS.find((r) => r.region === shotArea);
      const res = await api<{ seq: number; state: LiveState }>(`/matches/${matchId}/balls`, {
        method: 'POST',
        body: {
          client_event_id: uuid(),
          expected_seq: state?.seq,
          ...(nextBowler ? { bowler_id: nextBowler } : {}),
          ...(area ? { wagon: { region: area.region, angle_deg: area.angle, distance_pct: area.dist } } : {}),
          ...payload,
        },
      });
      if (res.state) setState({ ...res.state, status: res.state.status ?? 'live', seq: res.seq } as LiveState);
      setExtraMode(null);
      setNbByes(null);
      setShotArea(null);
      setNextBowler(null);
    });

  const scoreRuns = (runs: number) => {
    if (extraMode === 'wide') return postBall({ extra_type: 'wide', runs_extras: runs });
    if (extraMode === 'no_ball' && nbByes) {
      return postBall({ extra_type: 'no_ball', runs_extras: runs, secondary_extra_type: nbByes });
    }
    if (extraMode === 'no_ball') return postBall({ extra_type: 'no_ball', runs_batter: runs });
    if (extraMode === 'bye') return postBall({ extra_type: 'bye', runs_extras: runs });
    if (extraMode === 'leg_bye') return postBall({ extra_type: 'leg_bye', runs_extras: runs });
    return postBall({ runs_batter: runs });
  };

  if (authLoading || !match || !state) return <Spinner label="Loading scorer console…" />;

  const status = state.status ?? match.status;
  const needsNewBatter = !!state.pending_new_batter;
  const followOn = state.follow_on_available;
  // Defensive: a match can occasionally land on status 'live' with no engine
  // yet (e.g. an innings was reopened after having zero balls scored, so no
  // striker/bowler could be recovered). Treat that exactly like "openers not
  // set yet" instead of showing a run pad that will just error.
  const needsOpeners = (status === 'toss' || status === 'innings_break' || (status === 'live' && !state.engine)) && !followOn;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/matches/${matchId}`} className="text-xs text-mut hover:text-grass">← Match center</Link>
          <h1 className="text-lg font-black">{match.team_a_short} vs {match.team_b_short} — Scorer</h1>
        </div>
        <StatusBadge status={status} />
      </div>

      <ScoreHeader state={state} />
      <ErrorBox error={error} />

      {status === 'scheduled' && (
        <TossForm match={match} busy={busy} onToss={(winner, decision) =>
          call(async () => { await api(`/matches/${matchId}/toss`, { method: 'POST', body: { winner_team_id: winner, decision } }); await reloadMatch(); await reloadSquads(); })} />
      )}

      {followOn && (
        <div className="card space-y-3 p-4">
          <p className="text-sm font-bold text-gold">
            Follow-on available — lead of {followOn.lead} (deficit ≥ {followOn.deficit})
          </p>
          <div className="flex gap-3">
            <button className="btn-primary flex-1" disabled={busy}
              onClick={() => call(async () => { await api(`/matches/${matchId}/follow-on`, { method: 'POST', body: { enforce: true } }); await reloadMatch(); })}>
              Enforce follow-on
            </button>
            <button className="btn-ghost flex-1" disabled={busy}
              onClick={() => call(async () => { await api(`/matches/${matchId}/follow-on`, { method: 'POST', body: { enforce: false } }); await reloadMatch(); })}>
              Bat normally
            </button>
          </div>
          <button className="btn-ghost w-full text-xs" disabled={busy}
            onClick={() => call(async () => {
              await api(`/matches/${matchId}/innings/reopen`, { method: 'POST' });
              await reloadMatch();
            })}>
            ↩ Undo innings close — reopen previous innings
          </button>
        </div>
      )}

      {needsOpeners && (
        <>
          {status === 'live' && (
            <div className="rounded-lg bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
              This innings needs a striker, non-striker and bowler before scoring can continue.
            </div>
          )}
          <OpenersForm batting={battingPool} bowling={bowlingPool} busy={busy}
            onStart={(striker, nonStriker, bowler) =>
              call(async () => {
                await api(`/matches/${matchId}/openers`, {
                  method: 'POST', body: { striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler },
                });
                await reloadMatch();
              })} />
          {status === 'innings_break' && (
            <button className="btn-ghost w-full text-xs" disabled={busy}
              onClick={() => call(async () => {
                await api(`/matches/${matchId}/innings/reopen`, { method: 'POST' });
                await reloadMatch();
              })}>
              ↩ Undo innings close — reopen previous innings
            </button>
          )}
        </>
      )}

      {status === 'live' && !needsNewBatter && state.engine && (
        <>
          <BowlerBar state={state} bowling={bowlingPool} nextBowler={nextBowler} onPick={setNextBowler} />
          <div className="card p-4">
            {state.engine?.freeHitPending && (
              <div className="mb-3 rounded-lg bg-gold/15 px-3 py-1.5 text-center text-xs font-black text-gold">FREE HIT</div>
            )}
            <div className="mb-3 flex gap-2">
              {(['wide', 'no_ball', 'bye', 'leg_bye'] as const).map((m) => (
                <button key={m} onClick={() => { setExtraMode(extraMode === m ? null : m); setNbByes(null); }}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold uppercase ${
                    extraMode === m ? 'border-gold bg-gold/15 text-gold' : 'border-line text-mut hover:text-ink'}`}>
                  {m === 'wide' ? 'WD' : m === 'no_ball' ? 'NB' : m === 'bye' ? 'BYE' : 'LB'}
                </button>
              ))}
            </div>
            {extraMode === 'no_ball' && (
              <div className="mb-3 flex gap-2">
                {(['bye', 'leg_bye'] as const).map((m) => (
                  <button key={m} onClick={() => setNbByes(nbByes === m ? null : m)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold uppercase ${
                      nbByes === m ? 'border-gold bg-gold/15 text-gold' : 'border-line text-mut hover:text-ink'}`}>
                    + {m === 'bye' ? 'Bye' : 'Leg Bye'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 6].map((r) => (
                <button key={r} onClick={() => scoreRuns(r)} disabled={busy}
                  className={`h-16 rounded-xl text-2xl font-black transition-colors disabled:opacity-40 ${
                    r === 4 ? 'bg-grass/20 text-grass hover:bg-grass hover:text-black'
                    : r === 6 ? 'bg-gold/20 text-gold hover:bg-gold hover:text-black'
                    : 'bg-panel-2 hover:bg-line'}`}>
                  {r}
                </button>
              ))}
            </div>
            {extraMode && (
              <p className="mt-2 text-center text-xs text-gold">
                {extraMode.replace('_', ' ').toUpperCase()} selected — tap runs {
                  extraMode === 'no_ball'
                    ? (nbByes ? `run as ${nbByes === 'bye' ? 'byes' : 'leg byes'} (plus the no-ball)` : 'off the bat')
                    : 'completed'
                } (0 for none)
              </p>
            )}
            <div className="mt-3 border-t border-line/40 pt-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">
                Shot area <span className="font-normal normal-case">— optional, applies to the next ball</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FIELD_REGIONS.map((r) => (
                  <button key={r.region} onClick={() => setShotArea(shotArea === r.region ? null : r.region)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                      shotArea === r.region ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut hover:text-ink'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-danger h-12 text-base" disabled={busy} onClick={() => setWicketOpen(true)}>WICKET</button>
              <button className="btn-ghost h-12 text-base" disabled={busy}
                onClick={() => call(async () => { await api(`/matches/${matchId}/balls/last`, { method: 'DELETE' }); })}>
                ↩ Undo
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 text-xs" disabled={busy}
              onClick={() => call(async () => { await api(`/matches/${matchId}/interruptions`, { method: 'POST', body: { reason: 'rain' } }); })}>
              🌧 Rain / stop play
            </button>
            <button className="btn-ghost flex-1 text-xs" disabled={busy}
              onClick={() => call(async () => { await api(`/matches/${matchId}/innings/close`, { method: 'POST', body: { reason: 'declared' } }); await reloadMatch(); })}>
              Declare innings
            </button>
          </div>
          <CommentaryBox matchId={matchId} />
        </>
      )}

      {status === 'rain_delay' && (
        <div className="card space-y-3 p-4 text-center">
          <p className="text-sm font-bold text-gold">🌧 Play stopped</p>
          <button className="btn-primary w-full" onClick={() => setResumeOpen(true)}>Resume play…</button>
        </div>
      )}

      {needsNewBatter && (
        <Modal title="Next batter in">
          <div className="space-y-2">
            {battingPool
              .filter((p) => p.id !== state.pending_new_batter && !state.batters?.[p.id])
              .map((p) => (
                <button key={p.id} className="btn-ghost w-full justify-start" disabled={busy}
                  onClick={() => call(async () => { await api(`/matches/${matchId}/new-batter`, { method: 'POST', body: { player_id: p.id } }); })}>
                  {p.name}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {wicketOpen && (
        <WicketModal state={state} bowlingPool={bowlingPool} battingPool={battingPool} busy={busy}
          onClose={() => setWicketOpen(false)}
          onSubmit={(w) => { setWicketOpen(false); void postBall({ wicket: w }); }} />
      )}

      {resumeOpen && (
        <ResumeModal busy={busy} onClose={() => setResumeOpen(false)}
          onSubmit={(body) => call(async () => {
            await api(`/matches/${matchId}/interruptions/resume`, { method: 'POST', body });
            setResumeOpen(false);
          })} />
      )}

      {status === 'completed' && (
        <CompletedPanel match={match} state={state} busy={busy}
          battingPool={[...poolFor(match.team_a_id), ...poolFor(match.team_b_id)]}
          onFinalize={(pom) => call(async () => {
            await api(`/matches/${matchId}/finalize`, { method: 'POST', body: pom ? { player_of_match_id: pom } : {} });
            await reloadMatch();
          })}
          onSuperOver={() => call(async () => {
            const child = await api<{ id: string }>(`/matches/${matchId}/super-over`, { method: 'POST' });
            router.push(`/score/${child.id}`);
          })} />
      )}
    </div>
  );
}

// ---------- pieces ----------

function ScoreHeader({ state }: { state: LiveState }) {
  const s = state.summary;
  if (!s?.score) return null;
  const batters = Object.entries(state.batters ?? {}).filter(([, b]) => !b.out);
  return (
    <div className="card p-4">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-xs font-bold uppercase text-mut">{s.batting_team}</span>
          <div className="score-digits text-3xl font-black">{s.score} <span className="text-base text-mut">({s.overs})</span></div>
        </div>
        <div className="text-right text-xs text-mut">
          {s.target != null && <div className="font-bold text-ink">Target {s.target}</div>}
          <div>CRR {s.current_rr}{s.required_rr != null ? ` · RRR ${s.required_rr}` : ''}</div>
        </div>
      </div>
      {batters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-mut">
          {batters.map(([id, b]) => (
            <span key={id}>{b.name}{state.engine?.strikerId === id ? '*' : ''} <b className="text-ink">{b.runs}</b>({b.balls})</span>
          ))}
        </div>
      )}
      {state.this_over && state.this_over.length > 0 && (
        <div className="mt-2 flex gap-1">{state.this_over.map((b, i) => <BallChip key={i} label={b} />)}</div>
      )}
    </div>
  );
}

function TossForm({ match, busy, onToss }: {
  match: MatchDetail; busy: boolean;
  onToss: (winnerId: string, decision: 'bat' | 'bowl') => void;
}) {
  const [winner, setWinner] = useState(match.team_a_id);
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  return (
    <div className="card space-y-4 p-4">
      <h2 className="font-bold">Toss</h2>
      <div>
        <label className="label">Won by</label>
        <div className="flex gap-2">
          {[{ id: match.team_a_id, n: match.team_a_name }, { id: match.team_b_id, n: match.team_b_name }].map((t) => (
            <button key={t.id} onClick={() => setWinner(t.id)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${winner === t.id ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut'}`}>
              {t.n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Elected to</label>
        <div className="flex gap-2">
          {(['bat', 'bowl'] as const).map((d) => (
            <button key={d} onClick={() => setDecision(d)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold uppercase ${decision === d ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <button className="btn-primary w-full" disabled={busy} onClick={() => onToss(winner, decision)}>
        Confirm toss — start match
      </button>
    </div>
  );
}

function OpenersForm({ batting, bowling, busy, onStart }: {
  batting: Pick[]; bowling: Pick[]; busy: boolean;
  onStart: (striker: string, nonStriker: string, bowler: string) => void;
}) {
  const [striker, setStriker] = useState('');
  const [nonStriker, setNonStriker] = useState('');
  const [bowler, setBowler] = useState('');
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-bold">Openers & opening bowler</h2>
      {batting.length === 0 && (
        <p className="text-xs text-gold">No squad registered for the batting side — add players to the team squad in Manage.</p>
      )}
      <div>
        <label className="label">Striker</label>
        <select className="input" value={striker} onChange={(e) => setStriker(e.target.value)}>
          <option value="">Select…</option>
          {batting.map((p) => <option key={p.id} value={p.id} disabled={p.id === nonStriker}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Non-striker</label>
        <select className="input" value={nonStriker} onChange={(e) => setNonStriker(e.target.value)}>
          <option value="">Select…</option>
          {batting.map((p) => <option key={p.id} value={p.id} disabled={p.id === striker}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Opening bowler</label>
        <select className="input" value={bowler} onChange={(e) => setBowler(e.target.value)}>
          <option value="">Select…</option>
          {bowling.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button className="btn-primary w-full" disabled={busy || !striker || !nonStriker || !bowler}
        onClick={() => onStart(striker, nonStriker, bowler)}>
        Start innings
      </button>
    </div>
  );
}

function BowlerBar({ state, bowling, nextBowler, onPick }: {
  state: LiveState; bowling: Pick[]; nextBowler: string | null; onPick: (id: string | null) => void;
}) {
  const engine = state.engine as (LiveState['engine'] & { currentOverBalls?: number; lastOverBowlerId?: string | null }) | null;
  const newOverDue = (engine?.currentOverBalls ?? 0) === 0 && (engine?.legalBalls ?? 0) > 0;
  const bowler = state.current_bowler ? state.bowlers?.[state.current_bowler] : null;
  const picked = nextBowler ? bowling.find((p) => p.id === nextBowler) : null;

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
      <span className="text-xs font-bold uppercase text-mut">Bowler</span>
      {picked ? (
        <span className="font-semibold text-grass">→ {picked.name} (next ball)</span>
      ) : bowler ? (
        <span className="font-semibold">
          {bowler.name} <span className="score-digits text-mut">{oversFromBalls(bowler.legal_balls)}-{bowler.maidens}-{bowler.runs}-{bowler.wickets}</span>
        </span>
      ) : null}
      <select className="input ml-auto max-w-52" value={nextBowler ?? ''}
        onChange={(e) => onPick(e.target.value || null)}>
        <option value="">{newOverDue ? 'New over — select bowler…' : 'Same bowler'}</option>
        {bowling
          .filter((p) => !newOverDue || p.id !== engine?.lastOverBowlerId)
          .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {newOverDue && !nextBowler && (
        <span className="w-full text-xs text-gold">Start of over — pick the bowler, then score the first ball.</span>
      )}
    </div>
  );
}

function WicketModal({ state, bowlingPool, battingPool, busy, onClose, onSubmit }: {
  state: LiveState; bowlingPool: Pick[]; battingPool: Pick[]; busy: boolean;
  onClose: () => void;
  onSubmit: (w: { type: string; dismissed_player_id?: string; fielder_id?: string }) => void;
}) {
  const [type, setType] = useState('bowled');
  const [dismissed, setDismissed] = useState<string>('');
  const [fielder, setFielder] = useState<string>('');
  const needsFielder = ['caught', 'caught_behind', 'run_out', 'stumped'].includes(type);
  const needsDismissed = type === 'run_out';
  const striker = state.engine?.strikerId;
  const nonStriker = state.engine?.nonStrikerId;
  const atCrease = [striker, nonStriker]
    .map((id) => ({ id: id!, name: state.batters?.[id!]?.name ?? battingPool.find((p) => p.id === id)?.name ?? '?' }));

  return (
    <Modal title="Wicket!" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {['bowled', 'caught', 'caught_behind', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt'].map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-lg border px-2 py-2 text-xs font-bold ${type === t ? 'border-cherry bg-cherry/15 text-cherry' : 'border-line text-mut'}`}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        {needsDismissed && (
          <div>
            <label className="label">Who was out?</label>
            <div className="flex gap-2">
              {atCrease.map((b) => (
                <button key={b.id} onClick={() => setDismissed(b.id)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${dismissed === b.id ? 'border-cherry text-cherry' : 'border-line text-mut'}`}>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {needsFielder && (
          <div>
            <label className="label">Fielder</label>
            <select className="input" value={fielder} onChange={(e) => setFielder(e.target.value)}>
              <option value="">Select…</option>
              {bowlingPool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <button className="btn-danger w-full" disabled={busy || (needsDismissed && !dismissed)}
          onClick={() => onSubmit({
            type,
            ...(dismissed ? { dismissed_player_id: dismissed } : {}),
            ...(fielder ? { fielder_id: fielder } : {}),
          })}>
          Confirm wicket
        </button>
      </div>
    </Modal>
  );
}

function ResumeModal({ busy, onClose, onSubmit }: {
  busy: boolean; onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [oversLost, setOversLost] = useState('');
  const [revisedOvers, setRevisedOvers] = useState('');
  const [revisedTarget, setRevisedTarget] = useState('');
  return (
    <Modal title="Resume play" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-mut">Leave revision fields blank to resume unchanged. Fill them to apply a DLS/manual rain revision.</p>
        <div><label className="label">Overs lost</label>
          <input className="input" type="number" min={0} value={oversLost} onChange={(e) => setOversLost(e.target.value)} /></div>
        <div><label className="label">Revised innings overs</label>
          <input className="input" type="number" min={1} value={revisedOvers} onChange={(e) => setRevisedOvers(e.target.value)} /></div>
        <div><label className="label">Revised target (chase only)</label>
          <input className="input" type="number" min={1} value={revisedTarget} onChange={(e) => setRevisedTarget(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={busy}
          onClick={() => onSubmit({
            ...(oversLost ? { overs_lost: Number(oversLost) } : {}),
            ...(revisedOvers ? { revised_max_overs: Number(revisedOvers) } : {}),
            ...(revisedTarget ? { revised_target: Number(revisedTarget), method: 'DLS' } : {}),
          })}>
          Resume
        </button>
      </div>
    </Modal>
  );
}

/** Manual commentary entry — supplements the auto ball-by-ball feed. */
const FIELDING_EVENTS = [
  { tag: 'DROPPED CATCH!', label: 'Dropped catch' },
  { tag: 'RUN OUT MISSED!', label: 'Run out missed' },
  { tag: 'MISFIELD!', label: 'Misfield' },
] as const;

function CommentaryBox({ matchId }: { matchId: string }) {
  const [body, setBody] = useState('');
  const [highlight, setHighlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async (text: string, isHighlight: boolean) => {
    setBusy(true); setMsg(null);
    try {
      await api(`/matches/${matchId}/commentary`, {
        method: 'POST', body: { body: text, is_highlight: isHighlight },
      });
      setBody(''); setHighlight(false);
      setMsg('Posted ✓');
      setTimeout(() => setMsg(null), 1500);
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  };

  // One-tap fielding events; any typed text becomes the detail suffix.
  const quick = (tag: string) => send(body.trim() ? `${tag} ${body.trim()}` : tag, true);

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-mut">Commentary</span>
        {msg && <span className="text-xs text-grass">{msg}</span>}
      </div>
      <textarea className="input min-h-16" placeholder="Add color commentary… (every ball is auto-narrated already)"
        value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        {FIELDING_EVENTS.map((ev) => (
          <button key={ev.tag} className="btn-ghost !py-1 text-xs text-gold" disabled={busy}
            title={`Post "${ev.tag}" (typed text is appended as detail)`}
            onClick={() => quick(ev.tag)}>
            {ev.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-mut">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
          Highlight
        </label>
        <button className="btn-primary !py-1.5 text-xs" disabled={busy || !body.trim()} onClick={() => send(body, highlight)}>
          Post
        </button>
      </div>
    </div>
  );
}

function CompletedPanel({ match, state, busy, battingPool, onFinalize, onSuperOver }: {
  match: MatchDetail; state: LiveState; busy: boolean; battingPool: Pick[];
  onFinalize: (pomId: string | null) => void;
  onSuperOver: () => void;
}) {
  const [pom, setPom] = useState('');
  const isTie = match.result_type === 'tie' || state.result_summary === 'Match tied';
  return (
    <div className="card space-y-4 p-4">
      <div className="text-center">
        <p className="text-lg font-black text-grass">{match.result_summary ?? state.result_summary ?? 'Match completed'}</p>
        {match.dls_applied && <p className="text-xs text-gold">DLS applied</p>}
      </div>
      {isTie && (
        <button className="btn-primary w-full" disabled={busy} onClick={onSuperOver}>
          ⚡ Play Super Over
        </button>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label">Player of the match</label>
          <select className="input" value={pom} onChange={(e) => setPom(e.target.value)}>
            <option value="">Select…</option>
            {battingPool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button className="btn-ghost" disabled={busy} onClick={() => onFinalize(pom || null)}>Finalize</button>
      </div>
      <Link href={`/matches/${match.id}`} className="block text-center text-sm text-grass hover:underline">
        View full scorecard →
      </Link>
    </div>
  );
}
