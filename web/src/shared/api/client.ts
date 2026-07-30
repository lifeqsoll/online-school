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

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function extractMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) return data;
  if (typeof data === 'object' && data && 'message' in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.map(String).join(', ');
    if (typeof m === 'string') return m;
  }
  return fallback;
}

function humanizeError(status: number, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 401) {
    if (
      lower.includes('invalid credentials') ||
      lower.includes('unauthorized') ||
      lower === 'unauthorized'
    ) {
      return 'Неверный email или пароль';
    }
    if (lower.includes('token')) return 'Сессия истекла — войдите снова';
    return raw || 'Нужна авторизация';
  }
  if (status === 403) {
    if (lower.includes('forbidden') || !raw) {
      return 'Недостаточно прав (нужен админ или куратор курса)';
    }
    return raw;
  }
  if (status === 404) {
    if (lower.includes('user') || lower.includes('email')) {
      return 'Пользователь с таким email не найден';
    }
    return raw || 'Не найдено';
  }
  if (status === 409) return raw || 'Конфликт данных';
  if (status === 400) return raw || 'Некорректные данные';
  if (status >= 500) return 'Ошибка сервера. Попробуйте позже';
  return raw || `Ошибка запроса (${status})`;
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
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html') || /^\s*</.test(text)) {
    throw new ApiError(
      'API недоступен (прокси /api). Проверьте, что Nest запущен на :3000 и Vite перезапущен.',
      res.status || 502,
    );
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError('Ответ API не JSON', res.status || 502);
    }
  }
  if (!res.ok) {
    const raw = extractMessage(data, res.statusText);
    throw new ApiError(humanizeError(res.status, raw), res.status);
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
