'use client';

import type { LiveState } from './useLive';
import type { QueuedBall } from './outbox';
import { oversFromBalls } from './types';

/**
 * Client-side optimistic scoring — the missing half of local-first entry.
 *
 * The authoritative cricket engine lives on the server (backend
 * rules-engine.ts). Without a client copy, the displayed score can't move
 * until the server round-trips: the number sits still, the over doesn't roll,
 * strike doesn't rotate on odd runs, a wicket doesn't register — which reads
 * as "stuck". This mirrors the engine's *apply* math (deliberately WITHOUT
 * its validation guards — the server stays the sole validator) so the display
 * updates the instant a ball is tapped.
 *
 * `predict(serverState, pendingBalls)` folds the not-yet-synced outbox balls
 * onto the last server-confirmed state. It's self-correcting: as balls sync
 * and drop from the outbox — and the server pushes fresh state back — the
 * overlay shrinks and the prediction converges on the truth. A predicted
 * value that later disagrees with the server is simply replaced when the
 * server state arrives (the server always wins).
 */

interface Rules {
  balls_per_over: number;
  wide: { runs: number };
  no_ball: { runs: number; free_hit: boolean };
  wickets_to_fall: number;
}

// Dismissals that don't put a new batter's number against the bowler and
// don't increment the fall-of-wicket count the usual way.
const NON_STRIKER_OUT_TYPES = new Set(['retired_hurt']);

function ruleDefaults(raw: unknown): Rules {
  const r = (raw ?? {}) as Record<string, unknown>;
  const wide = (r.wide as { runs?: number } | undefined) ?? {};
  const noBall = (r.no_ball as { runs?: number; free_hit?: boolean } | undefined) ?? {};
  return {
    balls_per_over: (r.balls_per_over as number) ?? 6,
    wide: { runs: wide.runs ?? 1 },
    no_ball: { runs: noBall.runs ?? 1, free_hit: noBall.free_hit ?? false },
    wickets_to_fall: (r.wickets_to_fall as number) ?? 10,
  };
}

/** Chip label for the current over — mirrors the server's ballLabel exactly. */
function ballLabel(b: QueuedBall): string {
  const runsBatter = (b.runs_batter as number) ?? 0;
  const runsExtras = (b.runs_extras as number) ?? 0;
  const extra = b.extra_type as string | undefined;
  if (b.wicket) return runsBatter ? `${runsBatter}W` : 'W';
  if (extra === 'wide') return `${runsExtras ? runsExtras + 1 : ''}wd`;
  if (extra === 'no_ball' && b.secondary_extra_type)
    return `nb+${runsExtras}${b.secondary_extra_type === 'bye' ? 'b' : 'lb'}`;
  if (extra === 'no_ball') return `${runsBatter ? runsBatter : ''}nb`;
  if (extra === 'bye') return `${runsExtras}b`;
  if (extra === 'leg_bye') return `${runsExtras}lb`;
  if (runsBatter === 6) return '6';
  if (runsBatter === 4) return '4';
  return String(runsBatter);
}

type Engine = NonNullable<LiveState['engine']> & {
  currentOverBalls?: number;
  lastOverBowlerId?: string | null;
};

/**
 * Apply one wire-format ball to a LiveState, returning a new state. Ported
 * from applyBall()'s "Apply" section (backend rules-engine.ts lines 112-188),
 * minus the guard clauses — an optimistic paint must never refuse to advance,
 * or we'd be back to a frozen display.
 */
function applyOne(state: LiveState, ball: QueuedBall, rules: Rules): LiveState {
  const next: LiveState = structuredClone(state);
  const eng = next.engine as Engine | null;
  if (!eng) return next; // no engine yet (pre-openers) — nothing to predict onto

  const runsBatter = (ball.runs_batter as number) ?? 0;
  const runsExtras = (ball.runs_extras as number) ?? 0;
  const extraType = ball.extra_type as 'wide' | 'no_ball' | 'bye' | 'leg_bye' | undefined;
  const secondary = ball.secondary_extra_type as 'bye' | 'leg_bye' | undefined;
  const bowlerId = (ball.bowler_id as string) ?? next.current_bowler ?? '';
  const wicket = ball.wicket as { type?: string; dismissed_player_id?: string } | null | undefined;

  const isLegal = extraType !== 'wide' && extraType !== 'no_ball';
  const bpo = rules.balls_per_over;
  eng.currentOverBalls ??= eng.legalBalls % bpo;

  // ---- Runs (engine lines 117-121) ----
  let extras = runsExtras;
  if (extraType === 'wide') extras += rules.wide.runs;
  if (extraType === 'no_ball') extras += rules.no_ball.runs;
  eng.totalRuns += runsBatter + extras;

  // ---- Free hit (engine lines 123-128) ----
  if (extraType === 'no_ball' && rules.no_ball.free_hit) eng.freeHitPending = true;
  else if (isLegal) eng.freeHitPending = false;

  // ---- Ball count (engine lines 130-134) ----
  if (isLegal) {
    eng.legalBalls += 1;
    eng.currentOverBalls += 1;
  }

  // ---- Batter card: striker faces the ball (except a wide) ----
  const strikerId = eng.strikerId;
  if (next.batters?.[strikerId]) {
    const card = next.batters[strikerId];
    if (extraType !== 'wide') card.balls += 1;
    card.runs += runsBatter;
    if (runsBatter === 4) card.fours += 1;
    if (runsBatter === 6) card.sixes += 1;
  }

  // ---- Bowler card ----
  if (bowlerId && next.bowlers?.[bowlerId]) {
    const card = next.bowlers[bowlerId];
    if (isLegal) card.legal_balls += 1;
    // Charged to the bowler: runs off the bat, the wide/no-ball penalty, and
    // wide runs — but never byes/leg-byes (incl. those run off a no-ball).
    let charged = runsBatter;
    if (extraType === 'wide') charged += rules.wide.runs + runsExtras;
    else if (extraType === 'no_ball') charged += rules.no_ball.runs; // byes off it aren't charged
    card.runs += charged;
  }
  next.current_bowler = bowlerId || next.current_bowler;

  // ---- Wicket ----
  // A run-out can dismiss the striker OR the non-striker (dismissed_player_id
  // says which); every other type dismisses the striker. Only retired-hurt
  // doesn't count as a fall of wicket. run-out / retired / obstructing / timed
  // out aren't credited to the bowler (declared-out IS, per product decision).
  if (wicket) {
    const dismissedId = wicket.dismissed_player_id ?? strikerId;
    if (!NON_STRIKER_OUT_TYPES.has(wicket.type ?? '')) eng.totalWickets += 1;
    if (next.bowlers?.[bowlerId] &&
        !['run_out', 'retired_hurt', 'retired_out', 'obstructing_field', 'timed_out']
          .includes(wicket.type ?? '')) {
      next.bowlers[bowlerId].wickets += 1;
    }
    if (next.batters?.[dismissedId]) next.batters[dismissedId].out = true;
    // Prompt the scorer for the incoming batter, same as the server would.
    next.pending_new_batter = dismissedId;
  }

  // ---- Strike rotation on odd runs (engine lines 157-167) ----
  // Runs run (off the bat, plus byes/leg-byes/wides that were run) swap the
  // strike when odd. For a run-out this is the completed-runs crossing, which
  // combined with dismissed_player_id above puts the right batter in the right
  // place; the incoming batter's exact end is finalized server-side when the
  // scorer picks them (predict stops the overlay at the wicket regardless).
  const runningExtra =
    extraType === 'bye' || extraType === 'leg_bye' || extraType === 'wide'
      ? runsExtras
      : extraType === 'no_ball' && secondary
        ? runsExtras
        : 0;
  if ((runsBatter + runningExtra) % 2 === 1) {
    [eng.strikerId, eng.nonStrikerId] = [eng.nonStrikerId, eng.strikerId];
  }

  // ---- This-over chips ----
  next.this_over = [...(next.this_over ?? []), ballLabel(ball)];

  // ---- Over complete: reset count, swap strike, clear chips (engine 170-175) ----
  if (isLegal && eng.currentOverBalls === bpo) {
    eng.currentOverBalls = 0;
    eng.lastOverBowlerId = bowlerId;
    [eng.strikerId, eng.nonStrikerId] = [eng.nonStrikerId, eng.strikerId];
    next.this_over = []; // mirrors the server clearing this_over at over end
  }

  // ---- Summary (what ScoreHeader actually renders) ----
  const overs = oversFromBalls(eng.legalBalls, bpo);
  const crr = eng.legalBalls > 0
    ? +((eng.totalRuns * bpo) / eng.legalBalls).toFixed(2)
    : 0;
  next.summary = {
    ...next.summary,
    score: `${eng.totalRuns}/${eng.totalWickets}`,
    overs,
    current_rr: crr,
    required_rr:
      eng.target != null && eng.maxOvers != null
        ? (() => {
            const ballsLeft = eng.maxOvers * bpo - eng.legalBalls;
            return ballsLeft > 0
              ? +(((eng.target - eng.totalRuns) * bpo) / ballsLeft).toFixed(2)
              : null;
          })()
        : (next.summary?.required_rr ?? null),
  };

  next.engine = eng;
  return next;
}

/**
 * Fold the not-yet-synced balls onto the last server-confirmed state. Returns
 * `base` untouched when there's nothing pending (the server state is already
 * authoritative and complete). A wicket anywhere in the queue stops the
 * overlay: the incoming batter isn't known until the scorer picks them, so
 * predicting past it would use the wrong striker — the display holds at the
 * fall of wicket, which is exactly where the scorer's attention is anyway.
 */
export function predict(
  base: LiveState | null,
  pending: QueuedBall[],
  rawRules: unknown,
): LiveState | null {
  if (!base || pending.length === 0) return base;
  const rules = ruleDefaults(rawRules);
  let state = base;
  for (const ball of pending) {
    state = applyOne(state, ball, rules);
    if (ball.wicket) break;
  }
  return state;
}
