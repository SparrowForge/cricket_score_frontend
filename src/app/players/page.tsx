'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Empty, Spinner } from '@/components/ui';
import { calcAge, Player } from '@/lib/types';

/** Public, sitewide player search — no login required. */
export default function PlayersSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api<Player[]>(`/players?search=${encodeURIComponent(query)}&limit=30`)
        .then((r) => { if (alive) setResults(r); })
        .catch(() => { if (alive) setResults([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 250); // debounce
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Find a player</h1>
        <p className="text-sm text-mut">Search every player on CricLive and view their profile and career stats.</p>
      </div>

      <input
        className="input text-base"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {loading ? <Spinner /> : !results?.length ? (
        <Empty>{query ? `No players match “${query}”.` : 'Start typing a name to search.'}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="card flex items-center gap-3 p-4 hover:border-grass/50">
              {p.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-lg font-bold text-mut">
                  {p.full_name.charAt(0)}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate font-bold">{p.full_name}</div>
                <div className="truncate text-xs text-mut">
                  {p.primary_role.replace(/_/g, ' ')}
                  {p.country ? ` · ${p.country}` : ''}
                  {p.date_of_birth ? ` · ${calcAge(p.date_of_birth)}y` : ''}
                </div>
                {p.major_teams && p.major_teams.length > 0 && (
                  <div className="truncate text-[11px] text-grass">{p.major_teams.join(', ')}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
