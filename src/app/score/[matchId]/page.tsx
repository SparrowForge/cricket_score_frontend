'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, uuid, ApiError } from '@/lib/api';
import { Outbox, QueuedBall } from '@/lib/outbox';
import { predict } from '@/lib/predict';
import { useApi } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { useLiveMatch, LiveState } from '@/lib/useLive';
import { MatchDetail, SquadMember, SquadPlayer, Team, oversFromBalls } from '@/lib/types';
import { BallChip, ErrorBox, Modal, Spinner, StatusBadge } from '@/components/ui';
import { DroppedCatchIcon, MisfieldIcon, RunOutMissedIcon } from '@/components/icons/fielding';

// Retry an unsynced outbox in the background at this cadence. Short enough
// that a ball reaches the server soon after connectivity returns, long enough
// not to hammer a backend that's already struggling (e.g. cold-starting).
const SYNC_RETRY_MS = 5000;

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

/**
 * Round cricket-field picker for shot placement — a visual companion to the
 * text chips. Every position is plotted from its region angle/distance using
 * the SAME convention as the Stats wagon wheel (0° straight down the ground,
 * clockwise, right-hand batter's off side to the right, `(angle − 90)`), so a
 * dot here lands exactly where that shot shows up in the wagon wheel. Tapping a
 * dot drives the same `selected` state the chips use, so the two stay in sync:
 * pick "Long On" on the field and its chip lights up, and vice-versa.
 */
function FieldDiagram({ selected, onSelect }: {
  selected: FieldRegion | null;
  onSelect: (r: FieldRegion) => void;
}) {
  const pos = (angle: number, dist: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const d = (dist / 100) * 92;
    return { x: 100 + Math.cos(rad) * d, y: 100 + Math.sin(rad) * d };
  };
  const sel = FIELD_REGIONS.find((r) => r.region === selected) ?? null;
  const selPos = sel ? pos(sel.angle, sel.dist) : null;
  return (
    <svg viewBox="0 0 200 200" className="w-full select-none" style={{ touchAction: 'manipulation' }}>
      {/* boundary + 30-yard ring + pitch — mirrors WagonWheelSvg */}
      <circle cx="100" cy="100" r="96" fill="var(--color-grass)" fillOpacity="0.06" stroke="var(--color-line)" strokeWidth="1" />
      <circle cx="100" cy="100" r="45" fill="var(--color-grass)" fillOpacity="0.10" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
      <rect x="97" y="85" width="6" height="30" rx="2" fill="var(--color-panel-2)" stroke="var(--color-line)" />
      {/* side hints (right-hand batter) */}
      <text x="197" y="103" textAnchor="end" fontSize="7" fill="var(--color-mut)">OFF</text>
      <text x="3" y="103" textAnchor="start" fontSize="7" fill="var(--color-mut)">LEG</text>
      {FIELD_REGIONS.map((r) => {
        const { x, y } = pos(r.angle, r.dist);
        const on = selected === r.region;
        return (
          <g key={r.region} onClick={() => onSelect(r.region)} style={{ cursor: 'pointer' }}>
            {/* generous invisible hit target for touch */}
            <circle cx={x} cy={y} r="7" fill="transparent" />
            {on && <circle cx={x} cy={y} r="6" fill="var(--color-grass)" fillOpacity="0.25" />}
            <circle cx={x} cy={y} r={on ? 3.6 : 2.4}
              fill={on ? 'var(--color-grass)' : 'var(--color-mut)'} />
          </g>
        );
      })}
      {/* batter at the striker's end */}
      <circle cx="100" cy="100" r="2" fill="var(--color-ink)" />
      {/* label for the selected position — flipped below the dot near the top
          edge, and anchored to the side near the left/right edge so long labels
          (e.g. "Deep Square Leg") stay inside the viewBox instead of clipping */}
      {sel && selPos && (
        <text x={selPos.x < 40 ? 3 : selPos.x > 160 ? 197 : selPos.x}
          y={selPos.y < 18 ? selPos.y + 12 : selPos.y - 8}
          textAnchor={selPos.x < 40 ? 'start' : selPos.x > 160 ? 'end' : 'middle'}
          fontSize="8" fontWeight="bold" fill="var(--color-grass)">
          {sel.label}
        </text>
      )}
    </svg>
  );
}


export default function ScorerConsolePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { state: serverState, setState: setServerState } = useLiveMatch(matchId);
  const { data: match, reload: reloadMatch } = useApi<MatchDetail>(`/matches/${matchId}`, [serverState?.status]);
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
  const [squadEditOpen, setSquadEditOpen] = useState(false);
  const [squadChangeOpen, setSquadChangeOpen] = useState(false);
  const [nextBowler, setNextBowler] = useState<string | null>(null);
  const [customRuns, setCustomRuns] = useState('');

  // Offline-first ball queue (see lib/outbox.ts): `pendingBalls` mirrors what's
  // sitting in localStorage for this match — its balls are overlaid onto the
  // last server state (via predict, below) so the display reflects a tap
  // instantly, before the server has confirmed it. `stuck` is true only when
  // the server actively rejected the head-of-queue ball (a genuine rules
  // conflict, not just "offline") and it needs the scorer's attention.
  const [pendingBalls, setPendingBalls] = useState<QueuedBall[]>([]);
  const [stuck, setStuck] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queued = pendingBalls.length;

  // Re-read the outbox into React state so the prediction (and banner) update.
  const refreshPending = useCallback(() => {
    if (!matchId) return;
    setPendingBalls(Outbox.pending(matchId));
  }, [matchId]);

  const drainQueue = useCallback(async () => {
    if (!matchId) return;
    const result = await Outbox.drain(matchId);
    setPendingBalls(Outbox.pending(matchId));
    setStuck(result.stuck);
    setSyncError(result.errorMessage);
    // Adopt the authoritative state the batch returned so the display
    // reconciles onto server truth the instant a sync lands — no waiting on
    // the websocket echo, no flicker between the two.
    if (result.state) setServerState(result.state as LiveState);
  }, [matchId, setServerState]);

  // The display: the server's confirmed state with the not-yet-synced balls
  // predicted on top. This is what makes entry feel instant — the score,
  // over, strike and wicket move immediately, then converge on the server as
  // the queue drains.
  const state = useMemo(
    () => predict(serverState, pendingBalls, match?.rules_snapshot),
    [serverState, pendingBalls, match?.rules_snapshot],
  );

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  // Pick up anything left over from a previous session (crash, closed tab
  // mid-sync) and try to flush it immediately.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!matchId) return;
    setPendingBalls(Outbox.pending(matchId));
    if (Outbox.pending(matchId).length > 0) void drainQueue();
  }, [matchId, drainQueue]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Background retry while anything is queued, plus an immediate attempt the
  // moment the browser reports connectivity back.
  useEffect(() => {
    if (queued === 0) return;
    const id = setInterval(() => { void drainQueue(); }, SYNC_RETRY_MS);
    return () => clearInterval(id);
  }, [queued, drainQueue]);

  useEffect(() => {
    const onOnline = () => void drainQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drainQueue]);

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

  // Local-first: every ball is written to the outbox (localStorage) and the
  // form resets immediately — nothing here waits on the network, which is
  // what made rapid tap-by-tap scoring feel slow against a cold/high-latency
  // backend. A background drain (see the effects above) then pushes the
  // queue to the server in order; the score display updates once the server
  // applies it and pushes the state back over the websocket, same as it
  // would for any other viewer watching this match.
  const postBall = (payload: Record<string, unknown>) => {
    const area = FIELD_REGIONS.find((r) => r.region === shotArea);
    Outbox.add(matchId, {
      client_event_id: uuid(),
      // Carry the current bowler explicitly so the optimistic prediction (and
      // the server) always know who bowled, even mid-over when no change was
      // picked — `nextBowler` is set only when the scorer changes bowler.
      bowler_id: nextBowler ?? state?.current_bowler ?? undefined,
      ...(area ? { wagon: { region: area.region, angle_deg: area.angle, distance_pct: area.dist } } : {}),
      ...payload,
    });
    refreshPending(); // repaints the display with this ball predicted on top
    setExtraMode(null);
    setNbByes(null);
    setShotArea(null);
    setNextBowler(null);
    setCustomRuns('');
    void drainQueue();
  };

  // If anything is still queued, the most recent ball hasn't reached the
  // server yet — dropping it from the outbox is instant and needs no network
  // round-trip. Only once the queue is empty (everything synced) does undo
  // fall back to the server's own last-ball undo.
  const undoLast = () => call(async () => {
    if (Outbox.pending(matchId).length > 0) {
      Outbox.removeLast(matchId);
      refreshPending();
      return;
    }
    await api(`/matches/${matchId}/balls/last`, { method: 'DELETE' });
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
  // Settings can now be edited at any point until the match is decided — the
  // backend accepts edits in every non-terminal state, and they take effect on
  // the next ball. The panel opens as a modal so it works mid-innings without
  // disturbing the run pad.
  const canEditSettings = !['completed', 'abandoned', 'no_result', 'cancelled', 'forfeited'].includes(status);
  const settingsPanelOpen = settingsOpen && canEditSettings;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/matches/${matchId}`} className="text-xs text-mut hover:text-grass">← Match center</Link>
          <h1 className="text-lg font-black">{match.team_a_short} vs {match.team_b_short} — Scorer</h1>
        </div>
        <div className="flex items-center gap-2">
          {canEditSettings && xiConfirmed && (
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => setSquadEditOpen(true)}>
              👥 Squad
            </button>
          )}
          {['live', 'rain_delay'].includes(status) && (
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => setSquadChangeOpen(true)}>
              🔄 Change
            </button>
          )}
          {canEditSettings && (
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => setSettingsOpen(true)}>
              ⚙️ Settings
            </button>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      <ScoreHeader state={state} onSettings={canEditSettings ? () => setSettingsOpen(true) : undefined} />
      <ErrorBox error={error} />
      {queued > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold">
          <span>
            ☁ {queued} ball{queued > 1 ? 's' : ''} queued{stuck ? ' — rejected' : ' — syncing…'}
            {syncError && <span className="text-mut"> ({syncError})</span>}
          </span>
          <div className="flex gap-2">
            {stuck && (
              <button className="btn-ghost !py-1 text-xs text-cherry" onClick={() => {
                Outbox.discardFirst(matchId);
                refreshPending();
                setStuck(false);
                setSyncError(null);
                void drainQueue();
              }}>
                Discard stuck ball
              </button>
            )}
            <button className="btn-ghost !py-1 text-xs" onClick={() => void drainQueue()}>Sync now</button>
          </div>
        </div>
      )}

      {status === 'scheduled' && !xiConfirmed && (
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

      {settingsPanelOpen && (
        <Modal title="Match settings" onClose={() => setSettingsOpen(false)}>
          <SettingsForm
            match={match}
            state={state}
            busy={busy}
            onSave={(settings) =>
              call(async () => {
                await api(`/matches/${matchId}/settings`, { method: 'PATCH', body: settings });
                // Reload the match (new squad size / rules) and squads in
                // parallel; the modal closes on fresh data, never on pre-save
                // values. Mid-innings, this simply re-reads rules the engine
                // applies from the next ball.
                await Promise.all([reloadMatch(), reloadSquads()]);
                setSettingsOpen(false);
              })
            }
          />
        </Modal>
      )}

      {squadEditOpen && (
        <SquadEditModal
          match={match}
          teamA={teamA}
          teamB={teamB}
          squads={squads ?? []}
          busy={busy}
          onClose={() => setSquadEditOpen(false)}
          onSave={(teamId, players) =>
            call(async () => {
              await api(`/matches/${matchId}/squads`, { method: 'PUT', body: { team_id: teamId, players } });
              await reloadSquads();
            })
          }
        />
      )}

      {squadChangeOpen && (
        <SquadChangeModal
          match={match}
          squads={squads ?? []}
          busy={busy}
          onClose={() => setSquadChangeOpen(false)}
          onSubstitute={(teamId, outPlayerId, inPlayerId) =>
            call(async () => {
              await api(`/matches/${matchId}/substitutions`, {
                method: 'POST',
                body: { team_id: teamId, out_player_id: outPlayerId, in_player_id: inPlayerId },
              });
              await reloadSquads();
            })
          }
        />
      )}

      {status === 'scheduled' && xiConfirmed && (
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

      {status === 'toss' && match.toss_winner_id && (
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
                {shotArea && (
                  <span className="ml-1 font-semibold normal-case text-grass">
                    · {FIELD_REGIONS.find((r) => r.region === shotArea)?.label}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <div className="w-[42%] max-w-[190px] shrink-0 self-start">
                  <FieldDiagram selected={shotArea}
                    onSelect={(r) => setShotArea(shotArea === r ? null : r)} />
                </div>
                <div className="flex flex-1 flex-wrap content-start gap-1.5">
                  {FIELD_REGIONS.map((r) => (
                    <button key={r.region} onClick={() => setShotArea(shotArea === r.region ? null : r.region)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                        shotArea === r.region ? 'border-grass bg-grass/15 text-grass' : 'border-line text-mut hover:text-ink'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-danger h-12 text-base" disabled={busy} onClick={() => setWicketOpen(true)}>WICKET</button>
              <button className="btn-ghost h-12 text-base" disabled={busy} onClick={undoLast}>
                ↩ Undo{queued > 0 ? ' (unsynced)' : ''}
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
                  onClick={() => call(async () => {
                    // The wicket that triggered this prompt may still be sitting
                    // in the outbox (predicted, not yet synced). new-batter is a
                    // direct server call, so flush the queue first — otherwise
                    // the server has no fall-of-wicket to attach the batter to.
                    if (Outbox.pending(matchId).length > 0) await drainQueue();
                    const res = await api<{ state?: LiveState }>(
                      `/matches/${matchId}/new-batter`, { method: 'POST', body: { player_id: p.id } });
                    // Adopt the state the endpoint returns so the run pad comes
                    // straight back with the new batter on strike — the very
                    // next ball then scores offline (predicted on top of this),
                    // no further server round-trip needed to keep going.
                    if (res?.state) setServerState(res.state);
                  })}>
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

function ScoreHeader({ state, onSettings }: { state: LiveState; onSettings?: () => void }) {
  const s = state.summary;
  if (!s?.score) return null;
  const batters = Object.entries(state.batters ?? {}).filter(([, b]) => !b.out);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-bold uppercase text-mut">{s.batting_team}</span>
          <div className="score-digits text-3xl font-black">{s.score} <span className="text-base text-mut">({s.overs})</span></div>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right text-xs text-mut">
            {s.target != null && <div className="font-bold text-ink">Target {s.target}</div>}
            <div>CRR {s.current_rr}{s.required_rr != null ? ` · RRR ${s.required_rr}` : ''}</div>
          </div>
          {onSettings && (
            <button
              onClick={onSettings}
              title="Match settings"
              aria-label="Match settings"
              className="rounded-lg p-1 text-lg text-mut transition-colors hover:bg-panel-2 hover:text-ink"
            >
              ⚙️
            </button>
          )}
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
          {['bowled', 'caught', 'caught_behind', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt', 'declared_out'].map((t) => (
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

/**
 * Edit a team's playing XI at any point in the match. Each team is saved
 * independently (the squads endpoint is per-team). The server refuses to drop
 * a player who has already batted or bowled, so those edits surface an error
 * rather than corrupting the live state.
 */
function SquadEditModal({ match, teamA, teamB, squads, busy, onClose, onSave }: {
  match: MatchDetail; teamA: Team | null; teamB: Team | null;
  squads: SquadPlayer[]; busy: boolean; onClose: () => void;
  onSave: (teamId: string, players: Record<string, unknown>[]) => void;
}) {
  const teams = [
    { id: match.team_a_id, label: match.team_a_short, roster: teamA?.squad ?? [] },
    { id: match.team_b_id, label: match.team_b_short, roster: teamB?.squad ?? [] },
  ];
  const initialXi = (teamId: string) =>
    new Set(squads.filter((s) => s.team_id === teamId && s.is_playing_xi).map((s) => s.player_id));
  const [sel, setSel] = useState<Record<string, Set<string>>>({
    [match.team_a_id]: initialXi(match.team_a_id),
    [match.team_b_id]: initialXi(match.team_b_id),
  });

  const toggle = (teamId: string, playerId: string) => {
    setSel((prev) => {
      const next = new Set(prev[teamId]);
      if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
      return { ...prev, [teamId]: next };
    });
  };

  const save = (teamId: string, roster: SquadMember[]) => {
    const chosen = sel[teamId];
    const players = roster.map((p) => ({
      player_id: p.id,
      is_playing_xi: chosen.has(p.id),
      is_twelfth: !chosen.has(p.id),
      is_captain: p.is_captain,
      is_wicket_keeper: p.is_wicket_keeper,
    }));
    onSave(teamId, players);
  };

  return (
    <Modal title="Change squad" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-mut">
          Tick the players in the XI. A player who has already batted or bowled can&apos;t be removed.
        </p>
        {teams.map((t) => (
          <div key={t.id}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-mut">{t.label}</span>
              <span className="text-xs text-gold">{sel[t.id]?.size ?? 0} in XI</span>
            </div>
            {t.roster.length === 0 ? (
              <p className="text-xs text-mut">No squad registered for this team.</p>
            ) : (
              <>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {t.roster.map((p) => (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      sel[t.id]?.has(p.id) ? 'border-grass bg-grass/10' : 'border-line'}`}>
                      <input type="checkbox" className="shrink-0" checked={sel[t.id]?.has(p.id) ?? false}
                        onChange={() => toggle(t.id, p.id)} />
                      <span className="flex-1">{p.full_name}</span>
                      {p.is_captain && <span className="rounded bg-gold/15 px-1 text-[10px] font-bold text-gold">C</span>}
                      {p.is_wicket_keeper && <span className="rounded bg-grass/15 px-1 text-[10px] font-bold text-grass">WK</span>}
                    </label>
                  ))}
                </div>
                <button className="btn-ghost mt-2 w-full !py-1 text-xs" disabled={busy}
                  onClick={() => save(t.id, t.roster)}>
                  Save {t.label} squad
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function SettingsForm({ match, state, busy, onSave }: {
  match: MatchDetail; state: LiveState; busy: boolean;
  onSave: (settings: Record<string, unknown>) => void;
}) {
  const [overs, setOvers] = useState(match.rules_snapshot?.overs_per_innings?.toString() ?? '');
  const [players, setPlayers] = useState(match.rules_snapshot?.players_per_side?.toString() ?? '');
  const [maxOversPerBowler, setMaxOversPerBowler] = useState(match.rules_snapshot?.max_overs_per_bowler?.toString() ?? '');
  const [freeHit, setFreeHit] = useState((match.rules_snapshot?.no_ball as any)?.free_hit ?? false);
  const [dlsEnabled, setDlsEnabled] = useState((match.rules_snapshot?.dls as any)?.enabled ?? false);

  // Calculate completed overs from live state
  const ballsPerOver = (match.rules_snapshot as any)?.balls_per_over ?? 6;
  const legalBalls = state?.engine?.legalBalls ?? 0;
  const completedOvers = Math.floor(legalBalls / (ballsPerOver as number));
  const oversNum = parseInt(overs, 10);
  const oversInvalid = !isNaN(oversNum) && oversNum < completedOvers;

  return (
    <div className="space-y-4">
      <div>
        <label className="label text-xs">Overs per innings</label>
        <input type="number" value={overs} onChange={(e) => setOvers(e.target.value)} className={`input input-sm w-full ${oversInvalid ? 'border-cherry' : ''}`} />
        {oversInvalid && <p className="mt-1 text-xs text-cherry">Cannot reduce below {completedOvers} completed overs</p>}
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
      <button className="btn-primary w-full" disabled={busy || oversInvalid} onClick={() => {
        const settings: Record<string, unknown> = {};
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

function SquadChangeModal({ match, squads, busy, onClose, onSubstitute }: {
  match: MatchDetail; squads: SquadPlayer[]; busy: boolean;
  onClose: () => void;
  onSubstitute: (teamId: string, outPlayerId: string, inPlayerId: string) => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState(match.team_a_id);
  const [outPlayer, setOutPlayer] = useState('');
  const [inPlayer, setInPlayer] = useState('');

  const teamSquads = squads.filter((s) => s.team_id === selectedTeam && (s.is_playing_xi || s.is_twelfth));
  const benchPlayers = squads.filter(
    (s) => s.team_id === selectedTeam && !s.is_playing_xi && !s.is_twelfth,
  );
  const isValid = selectedTeam && outPlayer && inPlayer && outPlayer !== inPlayer;

  return (
    <Modal title="Squad substitution" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label text-xs">Team</label>
          <select value={selectedTeam} onChange={(e) => { setSelectedTeam(e.target.value); setOutPlayer(''); setInPlayer(''); }} className="input input-sm w-full">
            <option value={match.team_a_id}>{match.team_a_name}</option>
            <option value={match.team_b_id}>{match.team_b_name}</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Player going out (XI or bench)</label>
          <select value={outPlayer} onChange={(e) => setOutPlayer(e.target.value)} className="input input-sm w-full">
            <option value="">Select…</option>
            {teamSquads.map((s) => (
              <option key={s.player_id} value={s.player_id}>
                {s.full_name} {s.is_playing_xi ? '(XI)' : '(Bench)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">Player coming in (bench only)</label>
          <select value={inPlayer} onChange={(e) => setInPlayer(e.target.value)} className="input input-sm w-full">
            <option value="">Select…</option>
            {benchPlayers.map((s) => (
              <option key={s.player_id} value={s.player_id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary w-full"
          disabled={!isValid || busy}
          onClick={() => onSubstitute(selectedTeam, outPlayer, inPlayer)}
        >
          Confirm substitution
        </button>
      </div>
    </Modal>
  );
}
