'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import { MatchListItem, Org, Player, SquadMember, Team, Tournament, Venue } from '@/lib/types';
import { Confirm, Empty, ErrorBox, IconButton, Modal, Spinner, StatusBadge, Tabs } from '@/components/ui';
import { UploadButton } from '@/components/upload';
import { Combobox } from '@/components/combobox';
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
              <Link href={`/players/${s.id}`} className="font-medium hover:text-grass hover:underline">{s.full_name}</Link>
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
          <div className="flex-1">
            <Combobox
              placeholder="Search a player to add…"
              value={addId}
              onChange={setAddId}
              emptyLabel="No matching players in the org roster"
              options={available.map((p) => ({
                value: p.id, label: p.full_name,
                sublabel: p.primary_role?.replace(/_/g, ' '),
              }))}
            />
          </div>
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
const BOWLING_STYLES = [
  { value: '', label: '—' },
  { value: 'right_arm_fast', label: 'Right-arm fast' },
  { value: 'right_arm_fast_medium', label: 'Right-arm fast-medium' },
  { value: 'right_arm_medium', label: 'Right-arm medium' },
  { value: 'right_arm_off_break', label: 'Right-arm off break' },
  { value: 'right_arm_leg_break', label: 'Right-arm leg break' },
  { value: 'left_arm_fast', label: 'Left-arm fast' },
  { value: 'left_arm_fast_medium', label: 'Left-arm fast-medium' },
  { value: 'left_arm_medium', label: 'Left-arm medium' },
  { value: 'left_arm_orthodox', label: 'Left-arm orthodox' },
  { value: 'left_arm_chinaman', label: 'Left-arm chinaman' },
  { value: 'none', label: 'None' },
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
    country: player.country ?? '', date_of_birth: player.date_of_birth ?? '',
    height_cm: player.height_cm?.toString() ?? '', major_teams: (player.major_teams ?? []).join(', '),
    bio: player.bio ?? '',
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
          country: form.country || undefined, date_of_birth: form.date_of_birth || undefined,
          height_cm: form.height_cm ? Number(form.height_cm) : undefined,
          major_teams: form.major_teams ? form.major_teams.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          bio: form.bio || undefined,
          ...(photo ? { photo_url: photo } : {}),
        },
      });
      onSaved();
    } catch (e) { setError(e as { message?: string }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Edit player profile" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
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
            <select className="input" value={form.bowling_style} onChange={(e) => setForm({ ...form, bowling_style: e.target.value })}>
              {BOWLING_STYLES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select></div>
          <div><label className="label">Date of birth</label>
            <input className="input" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></div>
          <div><label className="label">Height (cm)</label>
            <input className="input" type="number" min={80} max={230} value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></div>
        </div>
        <div><label className="label">Major teams (comma-separated)</label>
          <input className="input" placeholder="e.g. Bangladesh U19, Dhaka Metro" value={form.major_teams}
            onChange={(e) => setForm({ ...form, major_teams: e.target.value })} /></div>
        <div><label className="label">Bio</label>
          <textarea className="input min-h-20" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
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
  const generateFixtures = async (tid: string, numMatches: number = 0) => {
    setError(null);
    try {
      if (!venues?.length) throw new Error('Add a venue first (Venues tab)');
      setBusyMsg('Generating…');
      // Calculate matchesPerDay from total numMatches and available days
      const matchDays = [1, 2, 3, 4, 5, 6, 7];
      const matchesPerDay = numMatches > 0 ? Math.ceil(numMatches / matchDays.length) : 4;
      const draft = await api<unknown[]>(`/tournaments/${tid}/fixtures/generate`, {
        method: 'POST',
        body: { type: 'round_robin', startDate: new Date().toISOString().slice(0, 10), matchDays, matchesPerDay, venueIds: venues.map((v) => v.id), maxMatches: numMatches || undefined },
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
            <TournamentSetup tournamentId={t.id} orgTeams={teams ?? []}
              onMsg={(msg) => { setBusyMsg(msg); setTimeout(() => setBusyMsg(''), 1500); }}
              onError={(err) => setError(err)}
              onChanged={reload}
              onGenerate={(numMatches) => generateFixtures(t.id, numMatches)} />
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

/** Tournament↔team mapping: attached teams (with detach) + attach select. */
function TournamentSetup({ tournamentId, orgTeams, onMsg, onError, onChanged, onGenerate }: {
  tournamentId: string;
  orgTeams: Team[];
  onMsg: (msg: string) => void;
  onError: (err: { message?: string } | null) => void;
  onChanged: () => Promise<unknown> | void;
  onGenerate: (numMatches: number) => void;
}) {
  const { data: detail, reload } = useApi<{ teams: { id: string; name: string; short_name: string }[] }>(
    `/tournaments/${tournamentId}`,
  );
  const [numMatches, setNumMatches] = useState('');
  const attached = detail?.teams ?? [];
  const unattached = orgTeams.filter((t) => !attached.some((a) => a.id === t.id));

  const attach = async (teamId: string) => {
    onError(null);
    try {
      await api(`/tournaments/${tournamentId}/teams`, { method: 'POST', body: { team_id: teamId } });
      await reload(); void onChanged(); onMsg('Team added ✓');
    } catch (err) { onError(err as { message?: string }); }
  };
  const detach = async (teamId: string) => {
    onError(null);
    try {
      await api(`/tournaments/${tournamentId}/teams/${teamId}`, { method: 'DELETE' });
      await reload(); void onChanged(); onMsg('Team removed ✓');
    } catch (err) { onError(err as { message?: string }); }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-line/40 pt-3">
      <div>
        <div className="label">Tournament teams</div>
        {attached.length === 0 ? (
          <p className="text-xs text-mut">No teams attached yet — attach the teams that play in this tournament.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attached.map((tm) => (
              <span key={tm.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-3 py-1 text-xs font-semibold">
                {tm.name}
                <button type="button" title={`Remove ${tm.name} from tournament`}
                  className="cursor-pointer text-mut hover:text-cherry" onClick={() => detach(tm.id)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <select className="input max-w-56" value="" onChange={(e) => e.target.value && attach(e.target.value)}>
          <option value="" disabled>Attach a team…</option>
          {unattached.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <div className="w-32">
          <label className="label text-xs">Number of matches</label>
          <input className="input" type="number" min={1} placeholder="Auto" value={numMatches} onChange={(e) => setNumMatches(e.target.value)} />
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => onGenerate(numMatches ? Number(numMatches) : 0)}>⚡ Generate round-robin fixtures</button>
      </div>
    </div>
  );
}

/* ================= Matches ================= */
const localNow = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

function MatchesPanel({ orgId }: { orgId: string }) {
  const { data: matches, loading, reload } = useApi<MatchListItem[]>(`/matches?org=${orgId}`);
  const { data: formats } = useApi<{ id: string; name: string; slug: string; is_builtin: boolean; rules: { overs_per_innings: number | null } }[]>('/formats');
  const { data: venues } = useApi<Venue[]>(`/orgs/${orgId}/venues`);
  const { data: tournaments } = useApi<Tournament[]>(`/tournaments?org=${orgId}`);
  const [tournamentId, setTournamentId] = useState('');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  // Only teams attached to the selected tournament can play in it
  const { data: tournamentDetail } = useApi<{ teams: { id: string; name: string }[] }>(
    tournamentId ? `/tournaments/${tournamentId}` : null, [tournamentId],
  );
  const teams = tournamentId ? tournamentDetail?.teams ?? [] : [];
  const [venueId, setVenueId] = useState('');
  const [scheduledAt, setScheduledAt] = useState(localNow());
  const [formatId, setFormatId] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [overs, setOvers] = useState('');
  const [maxOversPerBowler, setMaxOversPerBowler] = useState('');
  const [playersPerSide, setPlayersPerSide] = useState('');
  const [freeHit, setFreeHit] = useState(true);
  const [dls, setDls] = useState(true);
  const [error, setError] = useState<{ message?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editMatch, setEditMatch] = useState<MatchListItem | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editFormatId, setEditFormatId] = useState('');
  const [editOvers, setEditOvers] = useState('');
  const [editMaxOversPerBowler, setEditMaxOversPerBowler] = useState('');
  const [editPlayersPerSide, setEditPlayersPerSide] = useState('');
  const [delMatch, setDelMatch] = useState<MatchListItem | null>(null);

  // Default the select to T20 once formats load, so the visible selection
  // always matches what will actually be submitted (an empty formatId with
  // an unselected-but-required-looking <select> would otherwise silently
  // fall back to T20 while the browser displays a different option as chosen).
  useEffect(() => {
    if (!formatId && formats?.length) {
      setFormatId(formats.find((f) => f.slug === 't20' && f.is_builtin)?.id ?? formats[0].id);
    }
  }, [formatId, formats]);

  const selectedFormat = formats?.find((f) => f.id === formatId);

  const openEditMatch = (m: MatchListItem) => {
    setEditMatch(m);
    const ruleOverrides = (m as any).rules_snapshot || {};
    setEditScheduledAt(new Date(m.scheduled_start).toISOString().slice(0, 16));
    setEditFormatId('');
    setEditOvers(ruleOverrides.overs_per_innings?.toString() ?? '');
    setEditMaxOversPerBowler(ruleOverrides.max_overs_per_bowler?.toString() ?? '');
    setEditPlayersPerSide(ruleOverrides.players_per_side?.toString() ?? '');
  };

  const saveEditMatch = async () => {
    if (!editMatch) return;
    setBusy(true); setError(null);
    try {
      const rule_overrides: Record<string, unknown> = {};
      if (editOvers) rule_overrides.overs_per_innings = Number(editOvers);
      if (editMaxOversPerBowler) rule_overrides.max_overs_per_bowler = Number(editMaxOversPerBowler);
      if (editPlayersPerSide) {
        const n = Number(editPlayersPerSide);
        rule_overrides.players_per_side = n;
        rule_overrides.wickets_to_fall = n - 1;
      }
      await api(`/matches/${editMatch.id}`, {
        method: 'PATCH',
        body: {
          scheduled_start: new Date(editScheduledAt).toISOString(),
          ...(editFormatId ? { format_id: editFormatId } : {}),
          ...(Object.keys(rule_overrides).length ? { rule_overrides } : {}),
        },
      });
      setEditMatch(null); await reload();
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  const deleteMatch = async () => {
    if (!delMatch) return;
    setBusy(true); setError(null);
    try {
      await api(`/matches/${delMatch.id}`, { method: 'DELETE' });
      setDelMatch(null); await reload();
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const rule_overrides: Record<string, unknown> = {};
      if (overs) rule_overrides.overs_per_innings = Number(overs);
      if (maxOversPerBowler) rule_overrides.max_overs_per_bowler = Number(maxOversPerBowler);
      if (playersPerSide) {
        const n = Number(playersPerSide);
        rule_overrides.players_per_side = n;
        rule_overrides.wickets_to_fall = n - 1;
      }
      if (showRules) {
        rule_overrides.no_ball = { runs: 1, free_hit: freeHit };
        rule_overrides.dls = { enabled: dls };
      }
      await api(`/orgs/${orgId}/matches`, {
        method: 'POST',
        body: {
          tournament_id: tournamentId,
          team_a_id: teamA, team_b_id: teamB,
          venue_id: venueId || undefined,
          scheduled_start: new Date(scheduledAt).toISOString(),
          format_id: selectedFormat?.id,
          ...(Object.keys(rule_overrides).length ? { rule_overrides } : {}),
        },
      });
      setOvers(''); setMaxOversPerBowler(''); setPlayersPerSide(''); setVenueId(''); setScheduledAt(localNow());
      await reload();
    } catch (err) { setError(err as { message?: string }); }
    finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label">Tournament</label>
            <select className="input" value={tournamentId}
              onChange={(e) => { setTournamentId(e.target.value); setTeamA(''); setTeamB(''); }} required>
              <option value="">Select…</option>
              {tournaments?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.season ? ` (${t.season})` : ''}</option>)}
            </select></div>
          <div><label className="label">Team A</label>
            <select className="input" value={teamA} onChange={(e) => setTeamA(e.target.value)} required disabled={!tournamentId}>
              <option value="">{tournamentId ? 'Select…' : 'Pick tournament first'}</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div><label className="label">Team B</label>
            <select className="input" value={teamB} onChange={(e) => setTeamB(e.target.value)} required disabled={!tournamentId}>
              <option value="">{tournamentId ? 'Select…' : 'Pick tournament first'}</option>
              {teams.filter((t) => t.id !== teamA).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div><label className="label">Venue</label>
            <select className="input" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">Not set</option>
              {venues?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select></div>
          <div><label className="label">Start</label>
            <input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-line/40 pt-3">
          <div><label className="label">Format</label>
            <select className="input" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
              {formats?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select></div>
          <div className="w-28"><label className="label">Overs / innings</label>
            <input className="input" type="number" min={1} max={90}
              placeholder={selectedFormat?.rules.overs_per_innings?.toString() ?? 'unlimited'}
              value={overs} onChange={(e) => setOvers(e.target.value)} /></div>
          <div className="w-28"><label className="label">Players / side</label>
            <input className="input" type="number" min={2} max={15}
              placeholder="11"
              value={playersPerSide} onChange={(e) => setPlayersPerSide(e.target.value)} /></div>
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setShowRules(!showRules)}>
            {showRules ? '− Fewer rules' : '+ More match rules'}
          </button>
        </div>

        {showRules && (
          <div className="flex flex-wrap items-end gap-4 border-t border-line/40 pt-3">
            <div className="w-32"><label className="label">Max overs / bowler</label>
              <input className="input" type="number" min={1} placeholder="default" value={maxOversPerBowler}
                onChange={(e) => setMaxOversPerBowler(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={freeHit} onChange={(e) => setFreeHit(e.target.checked)} />
              Free hit after no-ball
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dls} onChange={(e) => setDls(e.target.checked)} />
              DLS for rain interruptions
            </label>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-line/40 pt-3">
          <button className="btn-primary" disabled={busy}>{busy ? 'Scheduling…' : 'Schedule match'}</button>
          {tournaments && tournaments.length === 0 && (
            <span className="text-xs text-gold">Every match belongs to a tournament — create one in the Tournaments tab first.</span>
          )}
          <ErrorBox error={error} />
        </div>
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
                {m.status === 'scheduled' && (
                  <>
                    <button onClick={() => openEditMatch(m)} className="btn-ghost !py-1 text-xs" disabled={busy}>Edit</button>
                    <button onClick={() => { setError(null); setDelMatch(m); }} className="btn-danger !py-1 text-xs" disabled={busy}>Delete</button>
                  </>
                )}
                <Link href={`/score/${m.id}`} className="btn-primary !py-1 text-xs">Score</Link>
              </span>
            </div>
          ))}
        </div>
      )}

      {editMatch && (
        <Modal title="Edit match" onClose={() => setEditMatch(null)}>
          <div className="space-y-3">
            <div>
              <label className="label text-xs">Scheduled start</label>
              <input className="input input-sm w-full" type="datetime-local" value={editScheduledAt} onChange={(e) => setEditScheduledAt(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Format</label>
              <select className="input input-sm w-full" value={editFormatId} onChange={(e) => setEditFormatId(e.target.value)}>
                <option value="">Keep current</option>
                {formats?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Overs per innings</label>
              <input className="input input-sm w-full" type="number" min={1} value={editOvers} onChange={(e) => setEditOvers(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Players per side</label>
              <input className="input input-sm w-full" type="number" min={2} max={15} value={editPlayersPerSide} onChange={(e) => setEditPlayersPerSide(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Max overs per bowler</label>
              <input className="input input-sm w-full" type="number" min={1} value={editMaxOversPerBowler} onChange={(e) => setEditMaxOversPerBowler(e.target.value)} />
            </div>
            <ErrorBox error={error} />
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy} onClick={saveEditMatch}>Save changes</button>
              <button className="btn-ghost flex-1" disabled={busy} onClick={() => setEditMatch(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {delMatch && (
        <Confirm title={`Delete match: ${delMatch.team_a_short} vs ${delMatch.team_b_short}?`}
          message="This cannot be undone. Any scoring data will be lost."
          confirmLabel="Delete match" busy={busy} error={error}
          onConfirm={deleteMatch} onClose={() => setDelMatch(null)} />
      )}
    </div>
  );
}
