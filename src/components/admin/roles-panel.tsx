'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { Empty, ErrorBox, Spinner } from '@/components/ui';

interface Permission { id: number; resource: string; action: string }
interface Role {
  id: string; name: string; slug: string; description: string | null;
  is_system: boolean; permissions: string[]; permission_ids: number[];
}
interface Member { id: string; email: string; full_name: string; org_roles: string[] }
interface Assignment {
  id: string; user_id: string; full_name: string; email: string; role: string;
  tournament_id: string | null; tournament: string | null; match_id: string | null; expires_at: string | null;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export function RolesPanel({ orgId }: { orgId: string }) {
  const { data: catalog } = useApi<Permission[]>('/rbac/permissions');
  const { data: roles, reload: reloadRoles } = useApi<Role[]>(`/orgs/${orgId}/roles`);
  const { data: members, reload: reloadMembers } = useApi<Member[]>(`/orgs/${orgId}/members`);
  const { data: assignments, reload: reloadAssignments } = useApi<Assignment[]>(`/orgs/${orgId}/role-assignments`);
  const [error, setError] = useState<{ message?: string } | null>(null);

  // role editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // member/grant state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('scorer');
  const [grantUser, setGrantUser] = useState('');
  const [grantRole, setGrantRole] = useState('');

  const byResource = useMemo(() => {
    const g: Record<string, Permission[]> = {};
    for (const p of catalog ?? []) (g[p.resource] ??= []).push(p);
    return g;
  }, [catalog]);

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try { await fn(); after?.(); }
    catch (err) { setError(err as { message?: string }); }
  };

  const createRole = () =>
    run(async () => {
      await api(`/orgs/${orgId}/roles`, {
        method: 'POST',
        body: { name: roleName, slug: slugify(roleName), permission_ids: [...selected] },
      });
      setEditorOpen(false); setRoleName(''); setSelected(new Set());
      await reloadRoles();
    });

  if (!roles || !catalog) return <Spinner />;

  return (
    <div className="space-y-5">
      <ErrorBox error={error} />

      {/* ---- Roles ---- */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-mut">Roles</h3>
          <button className="btn-primary !py-1.5 text-xs" onClick={() => setEditorOpen(!editorOpen)}>
            {editorOpen ? 'Close editor' : '+ Custom role'}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border border-line/60 p-3">
              <div className="flex items-center gap-2">
                <span className="font-bold">{r.name}</span>
                {r.is_system
                  ? <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-mut">system</span>
                  : <button className="ml-auto text-xs text-cherry hover:underline"
                      onClick={() => run(() => api(`/orgs/${orgId}/roles/${r.id}`, { method: 'DELETE' }), () => void reloadRoles())}>
                      delete
                    </button>}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-mut">{r.permissions.length} permissions: {r.permissions.slice(0, 6).join(', ')}{r.permissions.length > 6 ? '…' : ''}</p>
            </div>
          ))}
        </div>

        {editorOpen && (
          <div className="mt-4 space-y-3 border-t border-line/40 pt-4">
            <div>
              <label className="label">Role name</label>
              <input className="input max-w-sm" placeholder="e.g. Statistician" value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            </div>
            <div>
              <label className="label">Permissions ({selected.size} selected)</label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(byResource).map(([resource, perms]) => (
                  <div key={resource} className="rounded-lg border border-line/60 p-2.5">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mut">{resource}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map((p) => {
                        const on = selected.has(p.id);
                        return (
                          <button key={p.id} type="button"
                            onClick={() => {
                              const next = new Set(selected);
                              if (on) next.delete(p.id); else next.add(p.id);
                              setSelected(next);
                            }}
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${on ? 'bg-grass text-black' : 'bg-panel-2 text-mut hover:text-ink'}`}>
                            {p.action}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-primary" disabled={!roleName || selected.size === 0} onClick={createRole}>
              Create role
            </button>
          </div>
        )}
      </div>

      {/* ---- Members ---- */}
      <div className="card p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Members</h3>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label className="label">Add member by email (must be registered)</label>
            <input className="input" type="email" placeholder="scorer@club.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <select className="input max-w-40" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {['tournament_admin', 'scorer', 'commentator', 'viewer'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
          <button className="btn-primary" disabled={!inviteEmail}
            onClick={() => run(
              () => api(`/orgs/${orgId}/members`, { method: 'POST', body: { email: inviteEmail, role: inviteRole } }),
              () => { setInviteEmail(''); void reloadMembers(); void reloadAssignments(); },
            )}>
            Add
          </button>
        </div>
        {!members?.length ? <Empty>No members yet.</Empty> : (
          <div className="divide-y divide-line/40">
            {members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{m.full_name}</span>
                <span className="text-xs text-mut">{m.email}</span>
                <span className="ml-auto flex gap-1">
                  {m.org_roles.map((r) => <span key={r} className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold text-mut">{r}</span>)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Scoped grants ---- */}
      <div className="card p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-mut">Role grants</h3>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <select className="input max-w-52" value={grantUser} onChange={(e) => setGrantUser(e.target.value)}>
            <option value="">Grant to member…</option>
            {members?.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <select className="input max-w-52" value={grantRole} onChange={(e) => setGrantRole(e.target.value)}>
            <option value="">Role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn-primary" disabled={!grantUser || !grantRole}
            onClick={() => run(
              () => api(`/orgs/${orgId}/role-assignments`, { method: 'POST', body: { user_id: grantUser, role_id: grantRole } }),
              () => { setGrantUser(''); setGrantRole(''); void reloadAssignments(); },
            )}>
            Grant org-wide
          </button>
        </div>
        {!assignments?.length ? <p className="text-sm text-mut">No grants yet.</p> : (
          <div className="divide-y divide-line/40">
            {assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{a.full_name}</span>
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] font-bold text-grass">{a.role}</span>
                <span className="text-xs text-mut">
                  {a.match_id ? 'match-scoped' : a.tournament ? `tournament: ${a.tournament}` : 'org-wide'}
                  {a.expires_at && ` · expires ${new Date(a.expires_at).toLocaleDateString()}`}
                </span>
                <button className="ml-auto text-xs text-cherry hover:underline"
                  onClick={() => run(() => api(`/orgs/${orgId}/role-assignments/${a.id}`, { method: 'DELETE' }), () => void reloadAssignments())}>
                  revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
