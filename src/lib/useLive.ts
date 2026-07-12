'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL, getToken } from './api';

export interface LiveState {
  status: string;
  seq: number;
  result_summary?: string | null;
  innings_id?: string | null;
  innings_seq?: number;
  engine?: {
    totalRuns: number; totalWickets: number; legalBalls: number;
    strikerId: string; nonStrikerId: string; target: number | null;
    maxOvers: number | null; freeHitPending: boolean;
  } | null;
  batters?: Record<string, { name: string; runs: number; balls: number; fours: number; sixes: number; out?: boolean }>;
  bowlers?: Record<string, { name: string; legal_balls: number; runs: number; wickets: number; maidens: number }>;
  this_over?: string[];
  current_bowler?: string | null;
  pending_new_batter?: string | null;
  follow_on_available?: { lead: number; deficit: number } | null;
  dls?: { revised_target?: number | null; revised_overs?: number | null } | null;
  summary?: {
    batting_team?: string; score?: string; overs?: string;
    target?: number | null; current_rr?: number; required_rr?: number | null;
  };
  source?: string;
  [key: string]: unknown;
}

let socket: Socket | null = null;
function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/live`, { transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
  }
  return socket;
}

/**
 * Live match state over WebSocket with REST fallback.
 * Listeners are attached before join (the snapshot arrives with the ack).
 */
export function useLiveMatch(matchId: string | null) {
  const [state, setState] = useState<LiveState | null>(null);
  const [presence, setPresence] = useState<{ viewers: number; scorers: number }>({ viewers: 0, scorers: 0 });
  const [connected, setConnected] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!matchId) return;
    const s = getSocket();
    const room = `match:${matchId}`;

    const resync = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/matches/${matchId}/state`);
        if (res.ok) setState(await res.json());
      } catch { /* offline */ }
    };

    const onEvent = (data: { state?: LiveState }) => { if (data?.state) setState(data.state); };
    const onState = (full: LiveState) => setState(full);
    const onPresence = (p: { viewers: number; scorers: number }) => setPresence(p);
    const join = () => s.emit('join', { room, token: getToken() ?? undefined });

    s.on('state', onState);
    s.on('ball', onEvent);
    s.on('status', onEvent);
    s.on('correction', onEvent);
    s.on('presence', onPresence);
    s.on('connect', () => { setConnected(true); join(); });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => {
      setConnected(false);
      if (!pollTimer.current) pollTimer.current = setInterval(resync, 4000);
    });

    if (s.connected) { setConnected(true); join(); }
    void resync(); // instant paint regardless of socket timing

    return () => {
      s.emit('leave', { room });
      s.off('state', onState); s.off('ball', onEvent); s.off('status', onEvent);
      s.off('correction', onEvent); s.off('presence', onPresence);
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [matchId]);

  return { state, presence, connected, setState };
}
