// Strip trailing slashes so `${API_URL}/path` and `${WS_URL}/live` never double up.
const stripSlash = (u: string) => u.replace(/\/+$/, '');
export const API_URL = stripSlash(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1');
export const WS_URL = stripSlash(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001');

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super((body?.message as string) ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('criclive_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('criclive_token', token);
  else localStorage.removeItem('criclive_token');
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('criclive_refresh');
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem('criclive_refresh', token);
  else localStorage.removeItem('criclive_refresh');
}

// Single-flight refresh: concurrent 401s share one rotation attempt (the
// refresh token is single-use, so parallel refreshes would revoke each other).
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        setToken(null);
        setRefreshToken(null);
        return false;
      }
      const data = await res.json();
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      // release after this microtask so awaiting callers all see the result
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch();
  // Expired access token → rotate the refresh token once and retry. Credential
  // endpoints are excluded: a 401 there means bad credentials, not a stale token.
  const noRetry = ['/auth/login', '/auth/register', '/auth/google', '/auth/refresh', '/auth/logout'];
  if (res.status === 401 && !noRetry.some((p) => path.startsWith(p)) && (await tryRefresh())) {
    res = await doFetch();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Multipart upload to the media API (Cloudinary-backed). Returns the created asset. */
export async function apiUpload(file: File, folder?: string): Promise<{ id: string; cdn_url: string }> {
  const form = new FormData();
  form.append('file', file);
  const doFetch = () =>
    fetch(`${API_URL}/media/uploads${folder ? `?folder=${folder}` : ''}`, {
      method: 'POST',
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: form,
    });
  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
