'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { MatchListItem, Player, Team, Tournament } from '@/lib/types';
import { Empty, ErrorBox, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { UploadButton } from '@/components/upload';
import { BillingPanel } from '@/components/admin/billing-panel';
import { RolesPanel } from '@/components/admin/roles-panel';
import { NewsPanel } from '@/components/admin/news-panel';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function OrgHubPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org } = useApi<{ name: string; plan: string | null }>(`/orgs/${orgId}`);
  const [tab, setTab] = useState('tournaments');

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-xs text-mut hover:text-grass">← Organizations</Link>
        <h1 className="text-2xl font-black tracking-tight">{org?.name ?? '…'}</h1>
      </div>
      <Tabs
        tabs={[
          { key: 'tournaments', label: 'Tournaments' },
          { key: 'matches', label: 'Matches' },
          { key: 'teams', label: 'Teams' },
          { key: 'players', label: 'Players' },
          { key: 'venues', label: 'Venues' },
          { key: 'news', label: 'News' },
          { key: 'roles', label: 'Roles & Access' },
          { key: 'billing', label: 'Billing' },
        ]}
        active={tab} onChange={setTab}
      />
      {tab === 'teams' && <TeamsPanel orgId={orgId} />}
      {tab === 'players' && <PlayersPanel orgId={orgId} />}
      {tab === 'venues' && <VenuesPanel orgId={orgId} />}
      {tab === 'tournaments' && <TournamentsPanel orgId={orgId} />}
      {tab === 'matches' && <MatchesPanel orgId={orgId} />}
      {tab === 'news' && <NewsPanel orgId={orgId} />}
      {tab === 'roles' && <RolesPanel orgId={orgId} />}
      {tab === 'billing' && <BillingPanel orgId={orgId} />}
    </div>
  );
}

// ---------------- Teams ----------------
function TeamsPanel({ orgId }: { orgId: string }) {
  const { data: teams, loading, reload } = useApi<Team[]>(`/orgs/${orgId}/teams`);
  const { data: players } = useApi<Player[]>(`/orgs/${orgId}/players`);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/teams`, {
        method: 'POST',
        body: {
          name, short_name: short || name.slice(0, 3).toUpperCase(), slug: slugify(name),
          ...(logoUrl ? { logo_url: logoUrl } : {}),
        },
      });
      setName(''); setShort(''); setLogoUrl(null);
      await reload();
    } catch (err) { setError(err as { message?: string }); }
  };

  const addPlayer = async (teamId: string, playerId: string) => {
    await api(`/teams/${teamId}/players`, { method: 'POST', body: { player_id: playerId } });
    await reload();
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label className="label">Team name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="w-24"><label className="label">Short</label>
          <input className="input uppercase" maxLength={6} value={short} onChange={(e) => setShort(e.target.value)} /></div>
        <UploadButton label={logoUrl ? 'Logo ✓' : 'Logo'} folder="teams" onUploaded={(a) => setLogoUrl(a.cdn_url)} />
        <button className="btn-primary">Add team</button>
        <ErrorBox error={error} />
      </form>
      {!teams?.length ? <Empty>No teams yet.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">{t.name} <span className="text-xs text-mut">({t.short_name})</span></span>
                <span className="text-xs text-mut">{t.squad_size ?? 0} players</span>
              </div>
              {addTo === t.id ? (
                <div className="mt-3 flex gap-2">
                  <select className="input" defaultValue="" onChange={(e) => e.target.value && addPlayer(t.id, e.target.value)}>
                    <option value="" disabled>Select a player…</option>
                    {players?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                  <button className="btn-ghost" onClick={() => setAddTo(null)}>Done</button>
                </div>
              ) : (
                <button className="btn-ghost mt-3 !py-1 text-xs" onClick={() => setAddTo(t.id)}>+ Add players to squad</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Players ----------------
function PlayersPanel({ orgId }: { orgId: string }) {
  const { data: players, loading, reload } = useApi<Player[]>(`/orgs/${orgId}/players`);
  const [name, setName] = useState('');
  const [role, setRole] = useState('batter');
  const [error, setError] = useState<{ message?: string } | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/players`, { method: 'POST', body: { full_name: name, primary_role: role } });
      setName('');
      await reload();
    } catch (err) { setError(err as { message?: string }); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label className="label">Player name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="batter">Batter</option>
            <option value="bowler">Bowler</option>
            <option value="all_rounder">All-rounder</option>
            <option value="wicket_keeper_batter">WK-Batter</option>
          </select></div>
        <button className="btn-primary">Add player</button>
        <ErrorBox error={error} />
      </form>
      {!players?.length ? <Empty>No players yet.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-semibold">{p.full_name}</span>
              <span className="text-xs text-mut">{p.primary_role.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Venues ----------------
function VenuesPanel({ orgId }: { orgId: string }) {
  const { data: venues, loading, reload } = useApi<{ id: string; name: string; city: string | null }[]>(`/orgs/${orgId}/venues`);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/orgs/${orgId}/venues`, { method: 'POST', body: { name, city: city || undefined } });
    setName(''); setCity('');
    await reload();
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label className="label">Venue name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">City</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <button className="btn-primary">Add venue</button>
      </form>
      {!venues?.length ? <Empty>No venues yet.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {venues.map((v) => (
            <div key={v.id} className="px-4 py-2.5 text-sm">
              <span className="font-semibold">{v.name}</span>
              {v.city && <span className="ml-2 text-xs text-mut">{v.city}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Tournaments ----------------
function TournamentsPanel({ orgId }: { orgId: string }) {
  const { data: tournaments, loading, reload } = useApi<Tournament[]>(`/tournaments?org=${orgId}`);
  const { data: formats } = useApi<{ id: string; name: string; slug: string; is_builtin: boolean }[]>('/formats');
  const { data: teams } = useApi<Team[]>(`/orgs/${orgId}/teams`);
  const { data: venues } = useApi<{ id: string; name: string }[]>(`/orgs/${orgId}/venues`);
  const [name, setName] = useState('');
  const [formatId, setFormatId] = useState('');
  const [overs, setOvers] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyMsg, setBusyMsg] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/tournaments`, {
        method: 'POST',
        body: {
          name, slug: slugify(name), format_id: formatId || formats?.[0]?.id,
          ...(overs ? { rule_overrides: { overs_per_innings: Number(overs) } } : {}),
        },
      });
      setName(''); setOvers('');
      await reload();
    } catch (err) { setError(err as { message?: string }); }
  };

  const attachTeam = async (tid: string, teamId: string) => {
    await api(`/tournaments/${tid}/teams`, { method: 'POST', body: { team_id: teamId } });
    setBusyMsg('Team added ✓'); setTimeout(() => setBusyMsg(''), 1500);
  };

  const generateFixtures = async (tid: string) => {
    setError(null);
    try {
      if (!venues?.length) throw new Error('Add a venue first (Venues tab)');
      setBusyMsg('Generating…');
      const draft = await api<unknown[]>(`/tournaments/${tid}/fixtures/generate`, {
        method: 'POST',
        body: {
          type: 'round_robin', startDate: new Date().toISOString().slice(0, 10),
          matchDays: [1, 2, 3, 4, 5, 6, 7], matchesPerDay: 4, venueIds: venues.map((v) => v.id),
        },
      });
      const res = await api<{ created: number }>(`/tournaments/${tid}/fixtures/confirm`, {
        method: 'POST', body: { fixtures: draft },
      });
      setBusyMsg(`${res.created} fixtures scheduled ✓`);
      await reload();
    } catch (err) { setError(err as { message?: string }); setBusyMsg(''); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1"><label className="label">Tournament name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">Format</label>
          <select className="input" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {formats?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select></div>
        <div className="w-28"><label className="label">Overs (opt.)</label>
          <input className="input" type="number" min={1} placeholder="default" value={overs} onChange={(e) => setOvers(e.target.value)} /></div>
        <button className="btn-primary">Create</button>
      </form>
      <ErrorBox error={error} />
      {busyMsg && <div className="text-sm font-semibold text-grass">{busyMsg}</div>}

      {!tournaments?.length ? <Empty>No tournaments yet.</Empty> : tournaments.map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/tournaments/${t.id}`} className="font-bold hover:text-grass">{t.name}</Link>
            <StatusBadge status={t.status} />
            <span className="text-xs text-mut">{t.team_count} teams · {t.match_count} matches</span>
            <button className="btn-ghost ml-auto !py-1 text-xs" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
              {expanded === t.id ? 'Close' : 'Setup'}
            </button>
          </div>
          {expanded === t.id && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line/40 pt-3">
              <select className="input max-w-56" defaultValue="" onChange={(e) => e.target.value && attachTeam(t.id, e.target.value)}>
                <option value="" disabled>Attach a team…</option>
                {teams?.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
              <button className="btn-ghost text-xs" onClick={() => generateFixtures(t.id)}>
                ⚡ Generate round-robin fixtures
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------- Matches ----------------
function MatchesPanel({ orgId }: { orgId: string }) {
  const { data: matches, loading, reload } = useApi<MatchListItem[]>(`/matches?org=${orgId}`);
  const { data: teams } = useApi<Team[]>(`/orgs/${orgId}/teams`);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/matches`, {
        method: 'POST',
        body: { team_a_id: teamA, team_b_id: teamB, scheduled_start: new Date().toISOString() },
      });
      await reload();
    } catch (err) { setError(err as { message?: string }); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="label">Team A</label>
          <select className="input" value={teamA} onChange={(e) => setTeamA(e.target.value)} required>
            <option value="">Select…</option>
            {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div><label className="label">Team B</label>
          <select className="input" value={teamB} onChange={(e) => setTeamB(e.target.value)} required>
            <option value="">Select…</option>
            {teams?.filter((t) => t.id !== teamA).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <button className="btn-primary">Schedule friendly (now)</button>
        <ErrorBox error={error} />
      </form>
      {!matches?.length ? <Empty>No matches yet — schedule one or generate tournament fixtures.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {matches.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-semibold">{m.team_a_short} vs {m.team_b_short}</span>
              <StatusBadge status={m.status} />
              <span className="text-xs text-mut">{m.result_summary ?? new Date(m.scheduled_start).toLocaleString()}</span>
              <span className="ml-auto flex gap-2">
                <Link href={`/matches/${m.id}`} className="btn-ghost !py-1 text-xs">View</Link>
                <Link href={`/score/${m.id}`} className="btn-primary !py-1 text-xs">Score</Link>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
