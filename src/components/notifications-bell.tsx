'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { enablePush, initPushIfEnabled, pushEnabled, PushStatus } from '@/lib/firebase';

interface Notification {
  id: string; event_type: string; title: string; body: string;
  data: { match_id?: string; tournament_id?: string }; read_at: string | null; created_at: string;
}

export function NotificationsBell() {
  const { data, reload } = useApi<Notification[]>('/me/notifications');
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushStatus | 'off'>('off');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => void reload(), 30_000);
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    // Refresh the FCM token for browsers that already opted in (tokens rotate)
    if (pushEnabled()) { setPush('granted'); void initPushIfEnabled(); }
    return () => { clearInterval(t); document.removeEventListener('mousedown', onDoc); };
  }, [reload]);

  const onEnablePush = async () => {
    setPush(await enablePush());
  };

  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const markAll = async () => {
    await api('/me/notifications/read-all', { method: 'POST' });
    await reload();
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-lg p-2 text-mut hover:bg-panel-2 hover:text-ink" aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cherry px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-bold uppercase text-mut">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-xs text-grass hover:underline">Mark all read</button>}
          </div>
          <div className="border-b border-line px-3 py-2">
            {push === 'granted' ? (
              <span className="text-xs text-grass">✓ Push notifications enabled on this device</span>
            ) : push === 'denied' ? (
              <span className="text-xs text-mut">Push blocked — allow notifications in your browser settings</span>
            ) : push === 'unsupported' ? (
              <span className="text-xs text-mut">Push isn&apos;t supported in this browser</span>
            ) : push === 'error' ? (
              <span className="text-xs text-cherry">Couldn&apos;t enable push — try again later</span>
            ) : (
              <button onClick={onEnablePush} className="text-xs font-semibold text-grass hover:underline">
                🔔 Enable push notifications on this device
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-line/40 overflow-y-auto">
            {!data?.length ? (
              <p className="px-3 py-6 text-center text-sm text-mut">Nothing yet — follow teams and matches to get updates.</p>
            ) : data.slice(0, 20).map((n) => {
              const href = n.data?.match_id ? `/matches/${n.data.match_id}` : n.data?.tournament_id ? `/tournaments/${n.data.tournament_id}` : '#';
              return (
                <Link key={n.id} href={href} onClick={() => setOpen(false)}
                  className={`block px-3 py-2.5 hover:bg-panel-2/60 ${n.read_at ? 'opacity-60' : ''}`}>
                  <div className="text-sm font-semibold leading-snug">{n.title}</div>
                  <div className="mt-0.5 text-xs text-mut">{n.body}</div>
                  <div className="mt-0.5 text-[10px] text-mut">{new Date(n.created_at).toLocaleString()}</div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
