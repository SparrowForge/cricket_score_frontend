'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import { MatchListItem, Org, Player, SquadMember, Team, Tournament, Venue } from '@/lib/types';
import { Confirm, Empty, ErrorBox, IconButton, Modal, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { UploadButton } from '@/components/upload';
import { BillingPanel } from '@/components/admin/billing-panel';
import { RolesPanel } from '@/components/admin/roles-panel';
import { NewsPanel } from '@/components/admin/news-panel';

type Perms = ReturnType<typeof usePermissions>;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function OrgHubPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const perms = usePermissions(orgId);
  const { data: org } = useApi<Org>(`/orgs/${orgId}`);
  const [tab, setTab] = useState('tournaments');
  const [editOrg, setEditOrg] = useState(false);
  const [delOrg, setDelOrg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message?: string } | null>(null);

  const saveOrg = async (name: string) => {
    setBusy(true); setErr(null);
    try { await api(`/orgs/${orgId}`, { method: 'PATCH', body: { name } }); setEditOrg(false); location.reload(); }
    catch (e) { setErr(e as { message?: string }); } finally { setBusy(false); }
  };
  const deleteOrg = async () => {
    setBusy(true); setErr(null);
    try { await api(`/orgs/${orgId}`, { method: 'DELETE' }); router.push('/admin'); }
    catch (e) { setErr(e as { message?: string }); setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="text-xs text-mut hover:text-grass">← Organizations</Link>
          <h1 className="text-2xl font-black tracking-tight">{org?.name ?? '…'}</h1>
        </div>
        {org?.is_owner && (
          <div className="flex gap-2">
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => { setErr(null); setEditOrg(true); }}>✏️ Edit org</button>
            <button className="btn-danger !py-1.5 text-xs" onClick={() => { setErr(null); setDelOrg(true); }}>🗑 Delete org</button>
          </div>
        )}
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
      {tab === 'teams' && <TeamsPanel orgId={orgId} perms={perms} />}
      {tab === 'players' && <PlayersPanel orgId={orgId} perms={perms} />}
      {tab === 'venues' && <VenuesPanel orgId={orgId} perms={perms} />}
      {tab === 'tournaments' && <TournamentsPanel orgId={orgId} perms={perms} />}
      {tab === 'matches' && <MatchesPanel orgId={orgId} />}
      {tab === 'news' && <NewsPanel orgId={orgId} />}
      {tab === 'roles' && <RolesPanel orgId={orgId} />}
      {tab === 'billing' && <BillingPanel orgId={orgId} />}

      {editOrg && org && (
        <SimpleEditModal title="Edit organization" fields={[{ key: 'name', label: 'Name', value: org.name }]}
          busy={busy} error={err} onSave={(v) => saveOrg(v.name)} onClose={() => setEditOrg(false)} />
      )}
      {delOrg && (
        <Confirm title={`Delete “${org?.name}”?`}
          message="This hides the organization and all its data. In-progress matches must be finished first."
          confirmLabel="Delete organization" busy={busy} error={err}
          onConfirm={deleteOrg} onClose={() => setDelOrg(false)} />
      )}
    </div>
  );
}

/* ---------- shared: generic field edit modal ---------- */
function SimpleEditModal({ title, fields, busy, error, onSave, onClose }: {
  title: string;
  fields: { key: string; label: string; value: string; type?: string; options?: { value: string; label: string }[] }[];
  busy: boolean; error: { message?: string } | null;
  onSave: (values: Record<string, string>) => void; onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            {f.options ? (
              <select className="input" value={values[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input className="input" type={f.type ?? 'text'} value={values[f.key]}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy} onClick={() => onSave(values)}>Save</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Teams ================= */
function TeamsPanel({ orgId, perms }: { orgId: string; perms: Perms }) {
  const { data: teams, loading, reload } = useApi<Team[]>(`/orgs/${orgId}/teams`);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [edit, setEdit] = useState<Team | null>(null);
  const [del, setDel] = useState<Team | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = perms.can('team', 'create');
  const canEdit = perms.can('team', 'update');
  const canDelete = perms.can('team', 'delete');

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/teams`, {
        method: 'POST',
        body: { name, short_name: short || name.slice(0, 3).toUpperCase(), slug: slugify(name), ...(logoUrl ? { logo_url: logoUrl } : {}) },
      });
      setName(''); setShort(''); setLogoUrl(null);
      await reload();
    } catch (err) { setError(err as { message?: string }); }
  };
  const saveEdit = async (v: Record<string, string>) => {
    setBusy(true); setError(null);
    try { await api(`/teams/${edit!.id}`, { method: 'PATCH', body: { name: v.name, short_name: v.short_name } }); setEdit(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true); setError(null);
    try { await api(`/teams/${del!.id}`, { method: 'DELETE' }); setDel(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      {canCreate && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1"><label className="label">Team name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="w-24"><label className="label">Short</label>
            <input className="input uppercase" maxLength={6} value={short} onChange={(e) => setShort(e.target.value)} /></div>
          <UploadButton label={logoUrl ? 'Logo ✓' : 'Logo'} folder="teams" onUploaded={(a) => setLogoUrl(a.cdn_url)} />
          <button className="btn-primary">Add team</button>
        </form>
      )}
      <ErrorBox error={error} />
      {!teams?.length ? <Empty>No teams yet.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <div key={t.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold">
                  {t.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.logo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                  )}
                  {t.name} <span className="text-xs text-mut">({t.short_name})</span>
                </span>
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs text-mut">{t.squad_size ?? 0}</span>
                  {canEdit && <IconButton title="Edit team" onClick={() => { setError(null); setEdit(t); }}>✏️</IconButton>}
                  {canDelete && <IconButton title="Delete team" variant="danger" onClick={() => { setError(null); setDel(t); }}>🗑</IconButton>}
                </div>
              </div>
              <button className="btn-ghost mt-3 !py-1 text-xs" onClick={() => setManage(manage === t.id ? null : t.id)}>
                {manage === t.id ? 'Close squad' : '👥 Manage squad'}
              </button>
              {manage === t.id && <TeamSquad teamId={t.id} orgId={orgId} canManage={canEdit} onChange={reload} />}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <SimpleEditModal title="Edit team"
          fields={[{ key: 'name', label: 'Name', value: edit.name }, { key: 'short_name', label: 'Short name', value: edit.short_name }]}
          busy={busy} error={error} onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
      {del && (
        <Confirm title={`Delete “${del.name}”?`} message="The team is removed from your org. Match history is preserved."
          busy={busy} error={error} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </div>
  );
}

/* ---------- Team squad (global player pool → this team) ---------- */
function TeamSquad({ teamId, orgId, canManage, onChange }: {
  teamId: string; orgId: string; canManage: boolean; onChange: () => void;
}) {
  const { data: team, loading, reload } = useApi<Team>(`/teams/${teamId}`);
  const { data: players } = useApi<Player[]>(`/orgs/${orgId}/players`);
  const [edit, setEdit] = useState<SquadMember | null>(null);
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(false);

  const squad = team?.squad ?? [];
  const squadIds = new Set(squad.map((s) => s.id));
  const available = (players ?? []).filter((p) => !squadIds.has(p.id));

  const refresh = async () => { await reload(); onChange(); };
  const add = async () => {
    if (!addId) return;
    setBusy(true);
    try { await api(`/teams/${teamId}/players`, { method: 'POST', body: { player_id: addId } }); setAddId(''); await refresh(); }
    finally { setBusy(false); }
  };
  const remove = async (playerId: string) => {
    setBusy(true);
    try { await api(`/teams/${teamId}/players/${playerId}`, { method: 'DELETE' }); await refresh(); }
    finally { setBusy(false); }
  };
  const saveMember = async (jersey: string, captain: boolean, keeper: boolean) => {
    setBusy(true);
    try {
      await api(`/teams/${teamId}/players`, {
        method: 'POST',
        body: { player_id: edit!.id, jersey_number: jersey ? Number(jersey) : undefined, is_captain: captain, is_wicket_keeper: keeper },
      });
      setEdit(null); await refresh();
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mt-3 text-xs text-mut">Loading squad…</div>;
  return (
    <div className="mt-3 space-y-2 border-t border-line/40 pt-3">
      {squad.length === 0 ? <p className="text-xs text-mut">No players assigned yet.</p> : (
        <ul className="space-y-1">
          {squad.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center text-xs text-mut">{s.jersey_number ?? '–'}</span>
              <span className="font-medium">{s.full_name}</span>
              {s.is_captain && <span className="rounded bg-panel-2 px-1 text-[10px] font-bold text-gold">C</span>}
              {s.is_wicket_keeper && <span className="rounded bg-panel-2 px-1 text-[10px] font-bold text-grass">WK</span>}
              {canManage && (
                <span className="ml-auto flex gap-1">
                  <IconButton title="Edit squad role" onClick={() => setEdit(s)}>✏️</IconButton>
                  <IconButton title="Remove from team" variant="danger" onClick={() => remove(s.id)}>✕</IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="flex gap-2">
          <select className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">Add a player…</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <button className="btn-ghost" disabled={busy || !addId} onClick={add}>Add</button>
        </div>
      )}
      {edit && (
        <SquadMemberModal member={edit} busy={busy} onSave={saveMember} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function SquadMemberModal({ member, busy, onSave, onClose }: {
  member: SquadMember; busy: boolean;
  onSave: (jersey: string, captain: boolean, keeper: boolean) => void; onClose: () => void;
}) {
  const [jersey, setJersey] = useState(member.jersey_number?.toString() ?? '');
  const [captain, setCaptain] = useState(member.is_captain);
  const [keeper, setKeeper] = useState(member.is_wicket_keeper);
  return (
    <Modal title={`${member.full_name} — squad role`} onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Jersey number</label>
          <input className="input" type="number" min={0} value={jersey} onChange={(e) => setJersey(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={captain} onChange={(e) => setCaptain(e.target.checked)} /> Captain</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={keeper} onChange={(e) => setKeeper(e.target.checked)} /> Wicket-keeper</label>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy} onClick={() => onSave(jersey, captain, keeper)}>Save</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Players (global roster) ================= */
const ROLES = [
  { value: 'batter', label: 'Batter' }, { value: 'bowler', label: 'Bowler' },
  { value: 'all_rounder', label: 'All-rounder' }, { value: 'wicket_keeper', label: 'Wicket-keeper' },
  { value: 'wicket_keeper_batter', label: 'WK-Batter' },
];

function PlayersPanel({ orgId, perms }: { orgId: string; perms: Perms }) {
  const { data: players, loading, reload } = useApi<Player[]>(`/orgs/${orgId}/players`);
  const [name, setName] = useState('');
  const [role, setRole] = useState('batter');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [edit, setEdit] = useState<Player | null>(null);
  const [del, setDel] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = perms.can('player', 'create');
  const canEdit = perms.can('player', 'update');
  const canDelete = perms.can('player', 'delete');

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await api(`/orgs/${orgId}/players`, { method: 'POST', body: { full_name: name, primary_role: role } }); setName(''); await reload(); }
    catch (err) { setError(err as { message?: string }); }
  };
  const doDelete = async () => {
    setBusy(true); setError(null);
    try { await api(`/players/${del!.id}`, { method: 'DELETE' }); setDel(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-mut">Players are a shared pool — add any of them to any team from the Teams tab.</p>
      {canCreate && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1"><label className="label">Player name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
          <button className="btn-primary">Add player</button>
        </form>
      )}
      <ErrorBox error={error} />
      {!players?.length ? <Empty>No players yet.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {players.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {p.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
              )}
              <Link href={`/players/${p.id}`} className="font-semibold hover:text-grass">{p.full_name}</Link>
              <span className="text-xs text-mut">{p.primary_role.replace(/_/g, ' ')}</span>
              <span className="ml-auto flex gap-1">
                {canEdit && <IconButton title="Edit profile" onClick={() => { setError(null); setEdit(p); }}>✏️ Edit</IconButton>}
                {canDelete && <IconButton title="Delete player" variant="danger" onClick={() => { setError(null); setDel(p); }}>🗑</IconButton>}
              </span>
            </div>
          ))}
        </div>
      )}

      {edit && <PlayerEditModal player={edit} onSaved={() => { setEdit(null); void reload(); }} onClose={() => setEdit(null)} />}
      {del && (
        <Confirm title={`Delete “${del.full_name}”?`} message="Removes the player from your roster and all team squads. Match stats are preserved."
          busy={busy} error={error} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </div>
  );
}

function PlayerEditModal({ player, onSaved, onClose }: { player: Player; onSaved: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    full_name: player.full_name, primary_role: player.primary_role,
    batting_style: player.batting_style ?? '', bowling_style: player.bowling_style ?? '',
    country: player.country ?? '',
  });
  const [photo, setPhoto] = useState<string | null>(player.photo_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message?: string } | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/players/${player.id}`, {
        method: 'PATCH',
        body: {
          full_name: form.full_name, primary_role: form.primary_role,
          batting_style: form.batting_style || undefined, bowling_style: form.bowling_style || undefined,
          country: form.country || undefined, ...(photo ? { photo_url: photo } : {}),
        },
      });
      onSaved();
    } catch (e) { setError(e as { message?: string }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Edit player profile" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="label">Full name</label>
          <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Role</label>
            <select className="input" value={form.primary_role} onChange={(e) => setForm({ ...form, primary_role: e.target.value })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
          <div><label className="label">Country</label>
            <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div><label className="label">Batting</label>
            <select className="input" value={form.batting_style} onChange={(e) => setForm({ ...form, batting_style: e.target.value })}>
              <option value="">—</option><option value="right_hand">Right hand</option><option value="left_hand">Left hand</option>
            </select></div>
          <div><label className="label">Bowling</label>
            <input className="input" placeholder="e.g. right_arm_fast" value={form.bowling_style} onChange={(e) => setForm({ ...form, bowling_style: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-3">
          <UploadButton label={photo ? 'Replace photo' : 'Photo'} folder="players" onUploaded={(a) => setPhoto(a.cdn_url)} />
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-10 w-10 rounded-full object-cover" />
          )}
        </div>
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || !form.full_name.trim()} onClick={save}>Save</button>
          <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Venues ================= */
function VenuesPanel({ orgId, perms }: { orgId: string; perms: Perms }) {
  const { data: venues, loading, reload } = useApi<Venue[]>(`/orgs/${orgId}/venues`);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [edit, setEdit] = useState<Venue | null>(null);
  const [del, setDel] = useState<Venue | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = perms.can('venue', 'create');
  const canEdit = perms.can('venue', 'update');
  const canDelete = perms.can('venue', 'delete');

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await api(`/orgs/${orgId}/venues`, { method: 'POST', body: { name, city: city || undefined } }); setName(''); setCity(''); await reload(); }
    catch (err) { setError(err as { message?: string }); }
  };
  const saveEdit = async (v: Record<string, string>) => {
    setBusy(true); setError(null);
    try {
      await api(`/orgs/${orgId}/venues/${edit!.id}`, {
        method: 'PATCH', body: { name: v.name, city: v.city || undefined, country: v.country || undefined, capacity: v.capacity ? Number(v.capacity) : undefined },
      });
      setEdit(null); await reload();
    } catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true); setError(null);
    try { await api(`/orgs/${orgId}/venues/${del!.id}`, { method: 'DELETE' }); setDel(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      {canCreate && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1"><label className="label">Venue name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label className="label">City</label>
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></div>
          <button className="btn-primary">Add venue</button>
        </form>
      )}
      <ErrorBox error={error} />
      {!venues?.length ? <Empty>No venues yet.</Empty> : (
        <div className="card divide-y divide-line/40 p-0">
          {venues.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold">{v.name}</span>
              {v.city && <span className="text-xs text-mut">{v.city}{v.country ? `, ${v.country}` : ''}</span>}
              {v.organization_id && (
                <span className="ml-auto flex gap-1">
                  {canEdit && <IconButton title="Edit venue" onClick={() => { setError(null); setEdit(v); }}>✏️ Edit</IconButton>}
                  {canDelete && <IconButton title="Delete venue" variant="danger" onClick={() => { setError(null); setDel(v); }}>🗑</IconButton>}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {edit && (
        <SimpleEditModal title="Edit venue"
          fields={[
            { key: 'name', label: 'Name', value: edit.name },
            { key: 'city', label: 'City', value: edit.city ?? '' },
            { key: 'country', label: 'Country', value: edit.country ?? '' },
            { key: 'capacity', label: 'Capacity', value: edit.capacity?.toString() ?? '', type: 'number' },
          ]}
          busy={busy} error={error} onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
      {del && (
        <Confirm title={`Delete “${del.name}”?`} message="Removes the venue. Matches and teams referencing it keep playing; the link is cleared."
          busy={busy} error={error} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </div>
  );
}

/* ================= Tournaments ================= */
function TournamentsPanel({ orgId, perms }: { orgId: string; perms: Perms }) {
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
  const [edit, setEdit] = useState<Tournament | null>(null);
  const [del, setDel] = useState<Tournament | null>(null);
  const [busy, setBusy] = useState(false);

  const canCreate = perms.can('tournament', 'create');
  const canEdit = perms.can('tournament', 'update');
  const canDelete = perms.can('tournament', 'delete');

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/tournaments`, {
        method: 'POST',
        body: { name, slug: slugify(name), format_id: formatId || formats?.[0]?.id, ...(overs ? { rule_overrides: { overs_per_innings: Number(overs) } } : {}) },
      });
      setName(''); setOvers(''); await reload();
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
        body: { type: 'round_robin', startDate: new Date().toISOString().slice(0, 10), matchDays: [1, 2, 3, 4, 5, 6, 7], matchesPerDay: 4, venueIds: venues.map((v) => v.id) },
      });
      const res = await api<{ created: number }>(`/tournaments/${tid}/fixtures/confirm`, { method: 'POST', body: { fixtures: draft } });
      setBusyMsg(`${res.created} fixtures scheduled ✓`); await reload();
    } catch (err) { setError(err as { message?: string }); setBusyMsg(''); }
  };
  const saveEdit = async (v: Record<string, string>) => {
    setBusy(true); setError(null);
    try { await api(`/tournaments/${edit!.id}`, { method: 'PATCH', body: { name: v.name, season: v.season || undefined, status: v.status } }); setEdit(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true); setError(null);
    try { await api(`/tournaments/${del!.id}`, { method: 'DELETE' }); setDel(null); await reload(); }
    catch (err) { setError(err as { message?: string }); } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      {canCreate && (
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
      )}
      <ErrorBox error={error} />
      {busyMsg && <div className="text-sm font-semibold text-grass">{busyMsg}</div>}

      {!tournaments?.length ? <Empty>No tournaments yet.</Empty> : tournaments.map((t) => (
        <div key={t.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/tournaments/${t.id}`} className="font-bold hover:text-grass">{t.name}</Link>
            <StatusBadge status={t.status} />
            <span className="text-xs text-mut">{t.team_count} teams · {t.match_count} matches</span>
            <span className="ml-auto flex items-center gap-1">
              {canEdit && <IconButton title="Edit tournament" onClick={() => { setError(null); setEdit(t); }}>✏️</IconButton>}
              {canDelete && <IconButton title="Delete tournament" variant="danger" onClick={() => { setError(null); setDel(t); }}>🗑</IconButton>}
              {canEdit && (
                <button className="btn-ghost !py-1 text-xs" onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                  {expanded === t.id ? 'Close' : 'Setup'}
                </button>
              )}
            </span>
          </div>
          {expanded === t.id && canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line/40 pt-3">
              <select className="input max-w-56" defaultValue="" onChange={(e) => e.target.value && attachTeam(t.id, e.target.value)}>
                <option value="" disabled>Attach a team…</option>
                {teams?.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
              <button className="btn-ghost text-xs" onClick={() => generateFixtures(t.id)}>⚡ Generate round-robin fixtures</button>
            </div>
          )}
        </div>
      ))}

      {edit && (
        <SimpleEditModal title="Edit tournament"
          fields={[
            { key: 'name', label: 'Name', value: edit.name },
            { key: 'season', label: 'Season', value: edit.season ?? '' },
            { key: 'status', label: 'Status', value: edit.status, options: [
              { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' },
              { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' }, { value: 'cancelled', label: 'Cancelled' },
            ] },
          ]}
          busy={busy} error={error} onSave={saveEdit} onClose={() => setEdit(null)} />
      )}
      {del && (
        <Confirm title={`Delete “${del.name}”?`} message="Removes the tournament and its fixtures. This cannot be undone."
          busy={busy} error={error} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </div>
  );
}

/* ================= Matches (unchanged) ================= */
function MatchesPanel({ orgId }: { orgId: string }) {
  const { data: matches, loading, reload } = useApi<MatchListItem[]>(`/matches?org=${orgId}`);
  const { data: teams } = useApi<Team[]>(`/orgs/${orgId}/teams`);
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [error, setError] = useState<{ message?: string } | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await api(`/orgs/${orgId}/matches`, { method: 'POST', body: { team_a_id: teamA, team_b_id: teamB, scheduled_start: new Date().toISOString() } });
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
