const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const ACCESS = 'os_access_token';
const REFRESH = 'os_refresh_token';

export function getAccessToken() {
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH);
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(ACCESS, access);
  if (refresh) localStorage.setItem(REFRESH, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

type Opts = RequestInit & { json?: unknown; auth?: boolean };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (opts.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
  });

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api(path, { ...opts, auth: true });
    }
    clearTokens();
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'message' in data
        ? String((data as { message: unknown }).message)
        : res.statusText;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken?: string;
    };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}
