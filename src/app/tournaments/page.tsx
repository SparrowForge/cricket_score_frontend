'use client';

import Link from 'next/link';
import { useApi } from '@/lib/hooks';
import { Tournament } from '@/lib/types';
import { Empty, Spinner, StatusBadge } from '@/components/ui';

export default function TournamentsPage() {
  const { data, loading } = useApi<Tournament[]>('/tournaments');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">Tournaments</h1>
      {loading ? <Spinner /> : !data?.length ? (
        <Empty>No public tournaments yet.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`} className="card block p-4 hover:border-grass/50">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-bold">{t.name}</h2>
                <StatusBadge status={t.status} />
              </div>
              <p className="text-xs text-mut">
                {t.format}{t.season ? ` · ${t.season}` : ''} · {t.team_count} teams · {t.match_count} matches
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
