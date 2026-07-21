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
import { DroppedCatchIcon, MisfieldIcon, RunOutMissedIcon } from '@/components/icons/fielding';

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
  { region: 'straight',           label: 'Straight',            angle: 0,   dist: 90 },
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nextBowler, setNextBowler] = useState<string | null>(null);
  const [customRuns, setCustomRuns] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // Full squad pool (XI + substitutes) — used for fielding selectors only.
  const fieldingPoolFor = useCallback((teamId: string | undefined): Pick[] => {
    if (!teamId) return [];
    const fromMatch = (squads ?? []).filter((s) => s.team_id === teamId && (s.is_playing_xi || s.is_twelfth));
    if (fromMatch.length) return fromMatch.map((s) => ({ id: s.player_id, name: s.full_name }));
    const team = teamId === match?.team_a_id ? teamA : teamB;
    return (team?.squad ?? []).map((p) => ({ id: p.id, name: p.full_name }));
  }, [squads, match, teamA, teamB]);

  // Playing-XI-only pool — used for batting/bowling (substitutes cannot bat or bowl).
  // Falls back to full squad when no explicit XI has been confirmed yet.
  const xiPoolFor = useCallback((teamId: string | undefined): Pick[] => {
    if (!teamId) return [];
    const xi = (squads ?? []).filter((s) => s.team_id === teamId && s.is_playing_xi);
    if (xi.length) return xi.map((s) => ({ id: s.player_id, name: s.full_name }));
    return fieldingPoolFor(teamId);
  }, [squads, fieldingPoolFor]);

  const currentInnings = useMemo(
    () => match?.innings?.find((i) => i.seq === (state?.innings_seq ?? match.innings.length)),
    [match, state],
  );
  const battingPool = xiPoolFor(currentInnings?.batting_team_id);
  const bowlingPool = xiPoolFor(currentInnings?.bowling_team_id);
  const fieldingPool = fieldingPoolFor(currentInnings?.bowling_team_id);

  // Whether both teams have a confirmed playing XI registered for this match.
  const xiConfirmed = useMemo(() => {
    if (!match || !squads?.length) return false;
    const hasXI = (teamId: string) => (squads ?? []).some((s) => s.team_id === teamId && s.is_playing_xi);
    return hasXI(match.team_a_id) && hasXI(match.team_b_id);
  }, [squads, match]);

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
      setCustomRuns('');
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
  // Settings can be edited before the toss and between innings (backend allows
  // scheduled/toss/innings_break); while open it replaces the current stage form.
  const settingsVisible = ['scheduled', 'toss', 'innings_break'].includes(status) && settingsOpen;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/matches/${matchId}`} className="text-xs text-mut hover:text-grass">← Match center</Link>
          <h1 className="text-lg font-black">{match.team_a_short} vs {match.team_b_short} — Scorer</h1>
        </div>
        <div className="flex items-center gap-2">
          {['scheduled', 'toss', 'innings_break'].includes(status) && (
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => setSettingsOpen(!settingsOpen)}>
              ⚙️ Settings
            </button>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      <ScoreHeader state={state} />
      <ErrorBox error={error} />

      {status === 'scheduled' && !xiConfirmed && !settingsVisible && (
        <PlayingXIForm
          match={match}
          teamA={teamA}
          teamB={teamB}
          busy={busy}
          onConfirm={async (teamAIds, teamBIds) => {
            await call(async () => {
              const squadPayload = (teamId: string, squad: { id: string }[], selectedIds: string[]) => ({
                team_id: teamId,
                players: squad.map((p) => ({
                  player_id: p.id,
                  is_playing_xi: selectedIds.includes(p.id),
                  is_twelfth: !selectedIds.includes(p.id),
                })),
              });
              await api(`/matches/${matchId}/squads`, { method: 'PUT', body: squadPayload(match.team_a_id, teamA?.squad ?? [], teamAIds) });
              await api(`/matches/${matchId}/squads`, { method: 'PUT', body: squadPayload(match.team_b_id, teamB?.squad ?? [], teamBIds) });
              await reloadSquads();
            });
          }}
        />
      )}

      {settingsVisible && (
        <SettingsForm
          match={match}
          busy={busy}
          onSave={(settings) =>
            call(async () => {
              await api(`/matches/${matchId}/settings`, { method: 'PATCH', body: settings });
              // Settings are committed — reload what the Playing XI step reads
              // before showing it again: the match carries the new squad size,
              // the squads carry the roster/selection. Fetched in parallel so
              // the panel closes on fresh data, never on the pre-save values.
              await Promise.all([reloadMatch(), reloadSquads()]);
              setSettingsOpen(false);
            })
          }
        />
      )}

      {status === 'scheduled' && xiConfirmed && !settingsVisible && (
        <TossForm
          match={match}
          busy={busy}
          onToss={(winner, decision) =>
            call(async () => {
              await api(`/matches/${matchId}/toss`, { method: 'POST', body: { winner_team_id: winner, decision } });
              await reloadMatch();
              await reloadSquads();
            })}
          onBack={() =>
            call(async () => {
              // Clear XI selections to allow re-selection
              if (match?.team_a_id)
                await api(`/matches/${matchId}/squads`, { method: 'PUT', body: { team_id: match.team_a_id, players: (squads ?? []).filter((s) => s.team_id === match.team_a_id).map((s) => ({ player_id: s.player_id, is_playing_xi: false, is_twelfth: true })) } });
              if (match?.team_b_id)
                await api(`/matches/${matchId}/squads`, { method: 'PUT', body: { team_id: match.team_b_id, players: (squads ?? []).filter((s) => s.team_id === match.team_b_id).map((s) => ({ player_id: s.player_id, is_playing_xi: false, is_twelfth: true })) } });
              await reloadSquads();
            })
          }
        />
      )}

      {status === 'toss' && match.toss_winner_id && !settingsVisible && (
        <div className="card space-y-3 p-4">
          <p className="text-center text-sm font-bold">
            {match.toss_winner_id === match.team_a_id ? match.team_a_short : match.team_b_short} won the toss and chose to {match.toss_decision}
          </p>
          <button className="btn-ghost w-full text-xs" disabled={busy}
            onClick={() => call(async () => {
              await api(`/matches/${matchId}/toss`, { method: 'DELETE' });
              await reloadMatch();
            })}>
            ↩ Undo toss — go back to squad selection
          </button>
        </div>
      )}

      {followOn && !settingsVisible && (
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

      {needsOpeners && !settingsVisible && (
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
          {status === 'toss' && (
            <button className="btn-ghost w-full text-xs" disabled={busy}
              onClick={() => call(async () => {
                await api(`/matches/${matchId}/toss`, { method: 'DELETE' });
                await reloadMatch();
              })}>
              ↩ Undo toss — go back to squad selection
            </button>
          )}
          {status === 'innings_break' && match.innings && match.innings.length === 1 && (
            <button className="btn-ghost w-full text-xs" disabled={busy}
              onClick={() => call(async () => {
                await api(`/matches/${matchId}/toss`, { method: 'DELETE' });
                await reloadMatch();
              })}>
              ↩ Undo toss — go back to squad selection
            </button>
          )}
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
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
                <button key={r} onClick={() => scoreRuns(r)} disabled={busy}
                  className={`h-14 rounded-xl text-2xl font-black transition-colors disabled:opacity-40 ${
                    r === 4 ? 'bg-grass/20 text-grass hover:bg-grass hover:text-black'
                    : r === 6 ? 'bg-gold/20 text-gold hover:bg-gold hover:text-black'
                    : r === 5 || r === 7 ? 'bg-sky/20 text-sky hover:bg-sky hover:text-black'
                    : 'bg-panel-2 hover:bg-line'}`}>
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" disabled={busy}
                onClick={() => setCustomRuns((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
                className="h-10 w-10 flex-none rounded-lg border border-line text-xl font-bold text-mut hover:text-ink disabled:opacity-40">
                −
              </button>
              <input
                type="number" min="0" inputMode="numeric" placeholder="Any…"
                value={customRuns}
                onChange={(e) => setCustomRuns(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const n = parseInt(customRuns, 10);
                    if (!isNaN(n) && n >= 0) void scoreRuns(n);
                  }
                }}
                className="input min-w-0 flex-1 text-center text-xl font-bold"
              />
              <button type="button" disabled={busy}
                onClick={() => setCustomRuns((v) => String((parseInt(v, 10) || 0) + 1))}
                className="h-10 w-10 flex-none rounded-lg border border-line text-xl font-bold text-mut hover:text-ink disabled:opacity-40">
                +
              </button>
              <button type="button"
                disabled={busy || customRuns === '' || isNaN(parseInt(customRuns, 10)) || parseInt(customRuns, 10) < 0}
                onClick={() => { const n = parseInt(customRuns, 10); if (!isNaN(n) && n >= 0) void scoreRuns(n); }}
                className="h-10 flex-none rounded-lg bg-panel-2 px-4 text-sm font-bold hover:bg-line disabled:opacity-40">
                Score {customRuns !== '' && !isNaN(parseInt(customRuns, 10)) ? parseInt(customRuns, 10) : ''}
              </button>
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
          <CommentaryBox matchId={matchId} bowlingPool={fieldingPool} />
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
        <WicketModal state={state} fieldingPool={fieldingPool} battingPool={battingPool} busy={busy}
          onClose={() => setWicketOpen(false)}
          onSubmit={(w) => {
            const { runs_batter, ...wicket } = w;
            setWicketOpen(false);
            void postBall({ ...(runs_batter ? { runs_batter } : {}), wicket });
          }} />
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
          battingPool={[...fieldingPoolFor(match.team_a_id), ...fieldingPoolFor(match.team_b_id)]}
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

function PlayingXIForm({ match, teamA, teamB, busy, onConfirm }: {
  match: MatchDetail; teamA: Team | null; teamB: Team | null; busy: boolean;
  onConfirm: (teamAIds: string[], teamBIds: string[]) => void;
}) {
  const n = (match.rules_snapshot as { players_per_side?: number } | null)?.players_per_side ?? 11;
  const [selA, setSelA] = useState<Set<string>>(new Set());
  const [selB, setSelB] = useState<Set<string>>(new Set());

  const toggle = (sel: Set<string>, setSel: (s: Set<string>) => void, id: string) => {
    const next = new Set(sel);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setSel(next);
  };

  const squadA = teamA?.squad ?? [];
  const squadB = teamB?.squad ?? [];
  const canConfirm = selA.size >= 1 && selB.size >= 1;

  const TeamPanel = ({ label, squad, sel, setSel }: {
    label: string; squad: { id: string; full_name: string; primary_role: string; is_captain: boolean; is_wicket_keeper: boolean }[];
    sel: Set<string>; setSel: (s: Set<string>) => void;
  }) => (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-mut">{label}</span>
        <span className={`text-xs font-semibold ${sel.size === n ? 'text-grass' : sel.size > n ? 'text-cherry' : 'text-gold'}`}>
          {sel.size} / {n} selected
        </span>
      </div>
      {squad.length === 0 ? (
        <p className="text-xs text-mut">No squad registered — add players to this team&apos;s squad in Manage.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {squad.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              sel.has(p.id) ? 'border-grass bg-grass/10' : 'border-line hover:border-ink/30'
            }`}>
              <input type="checkbox" className="shrink-0" checked={sel.has(p.id)} onChange={() => toggle(sel, setSel, p.id)} />
              <span className="flex-1 font-medium">{p.full_name}</span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] text-mut">
                {p.is_captain && <span className="rounded bg-gold/15 px-1 font-bold text-gold">C</span>}
                {p.is_wicket_keeper && <span className="rounded bg-grass/15 px-1 font-bold text-grass">WK</span>}
                <span>{p.primary_role.replace(/_/g, ' ')}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {squad.length > 0 && (
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-ghost flex-1 !py-1 text-xs"
            onClick={() => setSel(new Set(squad.slice(0, n).map((p) => p.id)))}>
            Select first {n}
          </button>
          <button type="button" className="btn-ghost flex-1 !py-1 text-xs"
            onClick={() => setSel(new Set(squad.map((p) => p.id)))}>
            All
          </button>
          <button type="button" className="btn-ghost flex-1 !py-1 text-xs"
            onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Select Playing {n}</h2>
        <span className="text-xs text-mut">Pick the match squad for each team before the toss</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <TeamPanel label={match.team_a_name} squad={squadA} sel={selA} setSel={setSelA} />
        <TeamPanel label={match.team_b_name} squad={squadB} sel={selB} setSel={setSelB} />
      </div>
      {selA.size > n && (
        <p className="text-xs text-cherry">Team A has {selA.size} selected — only {n} allowed. Deselect {selA.size - n}.</p>
      )}
      {selB.size > n && (
        <p className="text-xs text-cherry">Team B has {selB.size} selected — only {n} allowed. Deselect {selB.size - n}.</p>
      )}
      <button className="btn-primary w-full" disabled={busy || !canConfirm || selA.size > n || selB.size > n}
        onClick={() => onConfirm([...selA], [...selB])}>
        Confirm Playing {n}s — proceed to toss
      </button>
    </div>
  );
}

function TossForm({ match, busy, onToss, onBack }: {
  match: MatchDetail; busy: boolean;
  onToss: (winnerId: string, decision: 'bat' | 'bowl') => void;
  onBack?: () => void;
}) {
  const [winner, setWinner] = useState(match.team_a_id);
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Toss</h2>
        {onBack && (
          <button className="btn-ghost text-xs" disabled={busy} onClick={onBack}>
            ← Back to squad selection
          </button>
        )}
      </div>
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

function WicketModal({ state, fieldingPool, battingPool, busy, onClose, onSubmit }: {
  state: LiveState; fieldingPool: Pick[]; battingPool: Pick[]; busy: boolean;
  onClose: () => void;
  onSubmit: (w: { type: string; runs_batter?: number; dismissed_player_id?: string; fielder_id?: string; wicket_broken_end?: 'striker_end' | 'non_striker_end' }) => void;
}) {
  const [type, setType] = useState('bowled');
  const [dismissed, setDismissed] = useState<string>('');
  const [fielder, setFielder] = useState<string>('');
  const [runsBefore, setRunsBefore] = useState(0);
  const [wicketBrokenEnd, setWicketBrokenEnd] = useState<'striker_end' | 'non_striker_end'>('striker_end');
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
            <button key={t} onClick={() => { setType(t); if (t !== 'run_out') setRunsBefore(0); }}
              className={`rounded-lg border px-2 py-2 text-xs font-bold ${type === t ? 'border-cherry bg-cherry/15 text-cherry' : 'border-line text-mut'}`}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        {type === 'run_out' && (
          <div>
            <label className="label">Runs completed before wicket</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <button key={r} onClick={() => setRunsBefore(r)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-bold ${runsBefore === r ? 'border-cherry bg-cherry/15 text-cherry' : 'border-line text-mut'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
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
            <label className="label">Fielder <span className="text-[10px] font-normal text-mut">(XI + substitutes)</span></label>
            <select className="input" value={fielder} onChange={(e) => setFielder(e.target.value)}>
              <option value="">Select…</option>
              {fieldingPool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {type === 'run_out' && (
          <div>
            <label className="label">Wicket broken at</label>
            <div className="flex gap-2">
              {['striker_end', 'non_striker_end'].map((end) => (
                <button key={end} onClick={() => setWicketBrokenEnd(end as 'striker_end' | 'non_striker_end')}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold ${wicketBrokenEnd === end ? 'border-cherry bg-cherry/15 text-cherry' : 'border-line text-mut'}`}>
                  {end === 'striker_end' ? 'Striker end' : 'Non-striker end'}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="btn-danger w-full" disabled={busy || (needsDismissed && !dismissed)}
          onClick={() => onSubmit({
            type,
            ...(type === 'run_out' ? { runs_batter: runsBefore, wicket_broken_end: wicketBrokenEnd } : {}),
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
// Icons match the badges the commentary feed renders for these tags, so the
// button a scorer presses looks like the entry it produces.
const FIELDING_EVENTS = [
  { tag: 'DROPPED CATCH!', label: 'Dropped catch', Icon: DroppedCatchIcon },
  { tag: 'RUN OUT MISSED!', label: 'Run out missed', Icon: RunOutMissedIcon },
  { tag: 'MISFIELD!', label: 'Misfield', Icon: MisfieldIcon },
] as const;

function CommentaryBox({ matchId, bowlingPool }: { matchId: string; bowlingPool: Pick[] }) {
  const [body, setBody] = useState('');
  const [highlight, setHighlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fieldingTag, setFieldingTag] = useState<string | null>(null);
  const [fielderPlayerId, setFielderPlayerId] = useState('');

  const send = async (text: string, isHighlight: boolean, fielderPid?: string) => {
    setBusy(true); setMsg(null);
    try {
      await api(`/matches/${matchId}/commentary`, {
        method: 'POST', body: {
          body: text,
          is_highlight: isHighlight,
          ...(fielderPid ? { fielder_player_id: fielderPid } : {}),
        },
      });
      setBody(''); setHighlight(false); setFieldingTag(null); setFielderPlayerId('');
      setMsg('Posted ✓');
      setTimeout(() => setMsg(null), 1500);
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  };

  const postFieldingEvent = () => {
    if (!fieldingTag) return;
    const detail = body.trim();
    const fielderName = bowlingPool.find((p) => p.id === fielderPlayerId)?.name;
    const text = [fieldingTag, fielderName ? `(${fielderName})` : '', detail].filter(Boolean).join(' ');
    send(text, true, fielderPlayerId || undefined);
  };

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-mut">Commentary</span>
        {msg && <span className="text-xs text-grass">{msg}</span>}
      </div>
      <textarea className="input min-h-16" placeholder="Add color commentary… (every ball is auto-narrated already)"
        value={body} onChange={(e) => setBody(e.target.value)} />

      {/* Fielding event quick buttons */}
      <div className="flex flex-wrap gap-2">
        {FIELDING_EVENTS.map((ev) => (
          <button key={ev.tag}
            className={`btn-ghost !py-1 text-xs ${fieldingTag === ev.tag ? 'border-gold text-gold bg-gold/10' : 'text-gold'}`}
            disabled={busy}
            onClick={() => setFieldingTag(fieldingTag === ev.tag ? null : ev.tag)}>
            <span className="inline-flex items-center gap-1"><ev.Icon size={13} /> {ev.label}</span>
          </button>
        ))}
      </div>

      {/* Bowling-team player selector — shown only when a fielding event is selected */}
      {fieldingTag && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 space-y-2">
          <div className="text-xs font-semibold text-gold">{fieldingTag} — select fielder (bowling team)</div>
          <select className="input text-sm" value={fielderPlayerId} onChange={(e) => setFielderPlayerId(e.target.value)}>
            <option value="">Unknown / skip</option>
            {bowlingPool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-1.5 text-xs" disabled={busy} onClick={postFieldingEvent}>
              Post event
            </button>
            <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => { setFieldingTag(null); setFielderPlayerId(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

function SettingsForm({ match, busy, onSave }: {
  match: MatchDetail; busy: boolean;
  onSave: (settings: Record<string, unknown>) => void;
}) {
  const [overs, setOvers] = useState(match.rules_snapshot?.overs_per_innings?.toString() ?? '');
  const [players, setPlayers] = useState(match.rules_snapshot?.players_per_side?.toString() ?? '');
  const [maxOversPerBowler, setMaxOversPerBowler] = useState(match.rules_snapshot?.max_overs_per_bowler?.toString() ?? '');
  const [freeHit, setFreeHit] = useState((match.rules_snapshot?.no_ball as any)?.free_hit ?? false);
  const [dlsEnabled, setDlsEnabled] = useState((match.rules_snapshot?.dls as any)?.enabled ?? false);

  return (
    <div className="card space-y-4 p-4">
      <h2 className="font-bold">Match Settings</h2>
      <div>
        <label className="label text-xs">Overs per innings</label>
        <input type="number" value={overs} onChange={(e) => setOvers(e.target.value)} className="input input-sm w-full" />
      </div>
      <div>
        <label className="label text-xs">Players per side</label>
        <input type="number" value={players} onChange={(e) => setPlayers(e.target.value)} className="input input-sm w-full" />
      </div>
      <div>
        <label className="label text-xs">Max overs per bowler</label>
        <input type="number" value={maxOversPerBowler} onChange={(e) => setMaxOversPerBowler(e.target.value)} className="input input-sm w-full" />
      </div>
      <label className="label cursor-pointer gap-2">
        <input type="checkbox" checked={freeHit} onChange={(e) => setFreeHit(e.target.checked)} className="checkbox checkbox-sm" />
        <span className="label-text text-xs">Free hit on no-ball</span>
      </label>
      <label className="label cursor-pointer gap-2">
        <input type="checkbox" checked={dlsEnabled} onChange={(e) => setDlsEnabled(e.target.checked)} className="checkbox checkbox-sm" />
        <span className="label-text text-xs">DLS enabled</span>
      </label>
      <button className="btn-primary w-full" disabled={busy} onClick={() => {
        const settings: Record<string, unknown> = {};
        const oversNum = parseInt(overs, 10);
        const playersNum = parseInt(players, 10);
        const maxOversNum = parseInt(maxOversPerBowler, 10);
        if (!isNaN(oversNum)) settings.overs_per_innings = oversNum;
        if (!isNaN(playersNum)) settings.players_per_side = playersNum;
        if (!isNaN(maxOversNum)) settings.max_overs_per_bowler = maxOversNum;
        settings.free_hit = freeHit;
        settings.dls_enabled = dlsEnabled;
        onSave(settings);
      }}>Save settings</button>
    </div>
  );
}
