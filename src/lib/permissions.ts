'use client';

import { useApi } from './hooks';
import { useAuth } from './auth';

interface Grant {
  role: string;
  organization_id: string | null;
  tournament_id: string | null;
  match_id: string | null;
  permissions: string[];
}

/**
 * Resolve the current user's capabilities within an org, from
 * GET /auth/me/permissions. `can(resource, action)` mirrors the backend's
 * assertOrgPermission: super admin passes everything; otherwise a role grant
 * (org-scoped or global) must carry `resource:action`.
 *
 * Org owner is not encoded as a permission — components gate org edit/delete
 * on the org's `is_owner` flag instead.
 */
export function usePermissions(orgId?: string) {
  const { user } = useAuth();
  const { data: grants, loading } = useApi<Grant[]>(user ? '/auth/me/permissions' : null);
  const superAdmin = !!user?.roles?.includes('super_admin');

  const can = (resource: string, action: string): boolean => {
    if (superAdmin) return true;
    if (!grants) return false;
    const key = `${resource}:${action}`;
    return grants.some(
      (g) => (g.organization_id === orgId || g.organization_id === null) && g.permissions?.includes(key),
    );
  };

  return { can, superAdmin, loading, userId: user?.id ?? null };
}
