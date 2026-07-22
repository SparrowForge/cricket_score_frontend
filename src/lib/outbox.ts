'use client';

import { api, ApiError, uuid } from './api';

export interface QueuedBall {
  client_event_id: string;
  [key: string]: unknown;
}

export interface DrainResult {
  left: number;
  /** True only when the server actively rejected a specific ball (rules
   *  violation) — the queue is stuck on it until it's discarded or edited.
   *  False for a plain network failure, which just needs a retry. */
  stuck: boolean;
  errorMessage: string | null;
  /** Authoritative live state the batch endpoint returns once it applies the
   *  queue — the caller adopts it so the display reconciles onto server truth
   *  the moment a sync lands, without waiting on the websocket echo. Null when
   *  nothing was sent (empty queue) or the request failed. */
  state: unknown | null;
}

const storageKey = (matchId: string) => `outbox:${matchId}`;

function readQueue(matchId: string): QueuedBall[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(matchId));
    return raw ? (JSON.parse(raw) as QueuedBall[]) : [];
  } catch {
    // Corrupt entry (shouldn't happen — we're the only writer) — treat as empty
    // rather than throwing, so scoring can still proceed from a clean queue.
    return [];
  }
}

function writeQueue(matchId: string, queue: QueuedBall[]) {
  if (typeof window === 'undefined') return;
  if (queue.length === 0) localStorage.removeItem(storageKey(matchId));
  else localStorage.setItem(storageKey(matchId), JSON.stringify(queue));
}

// Guards against two overlapping drains for the same match (e.g. the retry
// interval and an explicit "Sync now" click landing at the same moment).
const draining = new Set<string>();

// A request that stalls (no response, no error — a dead connection, not a
// clean failure) must not hold the drain lock forever, or every later retry
// tick would silently no-op against a lock nothing will ever release. The
// underlying fetch may still resolve late; its result is simply discarded
// (harmless — a since-synced ball just comes back 'duplicate' next drain).
const DRAIN_TIMEOUT_MS = 15000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), DRAIN_TIMEOUT_MS);
    p.then((v) => { clearTimeout(timer); resolve(v); },
           (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Durable, local-first queue for scored balls, keyed per match — the web
 * counterpart of the mobile app's Outbox (lib/features/scoring/outbox.dart),
 * sharing the same sync contract against POST /matches/:id/balls/batch so a
 * ball queued on one platform drains cleanly through the same endpoint.
 *
 * Every ball is written to localStorage synchronously, before any network
 * call is attempted. Score entry never waits on the server round-trip — that
 * round-trip is what makes tap-by-tap scoring feel slow against a cold or
 * high-latency backend. A background drain then pushes the queue to the
 * server one ball at a time, in order, retrying on failure.
 */
export const Outbox = {
  pending(matchId: string): QueuedBall[] {
    return readQueue(matchId);
  },

  /** Enqueue a ball. Returns the new queue length. */
  add(matchId: string, ball: Record<string, unknown>): number {
    const queue = readQueue(matchId);
    // Queued balls must not carry expected_seq — the server applies them in
    // order against whatever state it has once the drain reaches them.
    const rest = { ...ball };
    delete rest.expected_seq;
    queue.push({
      ...rest,
      client_event_id: (ball.client_event_id as string) ?? uuid(),
    });
    writeQueue(matchId, queue);
    return queue.length;
  },

  /** Remove the most recently queued (not-yet-synced) ball — local undo. */
  removeLast(matchId: string): number {
    const queue = readQueue(matchId);
    queue.pop();
    writeQueue(matchId, queue);
    return queue.length;
  },

  /** Drop the head-of-queue ball (scorer chose to discard a rejected entry). */
  discardFirst(matchId: string): number {
    const queue = readQueue(matchId);
    queue.shift();
    writeQueue(matchId, queue);
    return queue.length;
  },

  /** Push the queue to the server in order. Never throws — failures stay queued. */
  async drain(matchId: string): Promise<DrainResult> {
    if (draining.has(matchId)) return { left: readQueue(matchId).length, stuck: false, errorMessage: null, state: null };
    draining.add(matchId);
    try {
      const queue = readQueue(matchId);
      if (queue.length === 0) return { left: 0, stuck: false, errorMessage: null, state: null };

      let data: {
        results: { client_event_id: string; status: string; error?: { message?: string } }[];
        state?: unknown;
      };
      try {
        data = await withTimeout(
          api(`/matches/${matchId}/balls/batch`, { method: 'POST', body: { balls: queue } }),
        );
      } catch (err) {
        // Whole-request failure: offline, timed out, or the server rejected the
        // request itself (e.g. an expired session the refresh couldn't save).
        // Either way nothing was applied — leave the queue untouched for the
        // next try. (The lock still releases via `finally` below even though
        // the underlying fetch, if merely stalled rather than erroring, may
        // still be in flight — withTimeout stops waiting on it, it doesn't
        // cancel it.)
        const message = err instanceof ApiError ? err.message : null; // null = no server reached, not a rules error
        return { left: queue.length, stuck: false, errorMessage: message, state: null };
      }

      const resolvedIds = new Set<string>();
      let failedEventId: string | null = null;
      let errorMessage: string | null = null;
      for (const r of data.results) {
        if (r.status === 'applied' || r.status === 'duplicate') resolvedIds.add(r.client_event_id);
        else { failedEventId = r.client_event_id; errorMessage = r.error?.message ?? 'Ball rejected'; break; }
      }

      // Re-read the queue rather than trust the `queue` snapshot taken above:
      // the request just awaited was in flight for a while, and a ball can be
      // added (a tap mid-sync) or removed (a local undo/discard) in that
      // window. Dropping resolved ids from whatever is *currently* stored —
      // instead of overwriting with a stale slice of the old snapshot —
      // is what makes that safe: anything that arrived after the snapshot,
      // including a ball behind a conflicting one, survives untouched.
      const current = readQueue(matchId);
      const remaining = current.filter((b) => !resolvedIds.has(b.client_event_id));
      writeQueue(matchId, remaining);
      return { left: remaining.length, stuck: failedEventId !== null, errorMessage, state: data.state ?? null };
    } finally {
      draining.delete(matchId);
    }
  },
};
