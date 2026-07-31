import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { api, clearTokens, getAccessToken, setTokens } from '../api/client';

export type AuthUser = {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  pendingEmail?: string | null;
  globalRole: 'ADMIN' | 'STUDENT';
  notifyHwSubmitted?: boolean;
  impersonation?: unknown;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    email: string,
    password: string,
    firstName?: string,
  ) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    const me = await api<AuthUser>('/users/me');
    setUser(me);
  };

  useEffect(() => {
    refreshMe()
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const data = await api<{
          accessToken: string;
          refreshToken: string;
          user: AuthUser;
        }>('/auth/login', {
          method: 'POST',
          json: { email, password },
          auth: false,
        });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        return data.user;
      },
      async register(email, password, firstName) {
        const data = await api<{
          accessToken: string;
          refreshToken: string;
          user: AuthUser;
        }>('/auth/register', {
          method: 'POST',
          json: { email, password, firstName },
          auth: false,
        });
        setTokens(data.accessToken, data.refreshToken);
        setUser(data.user);
        return data.user;
      },
      async logout() {
        const refreshToken = localStorage.getItem('os_refresh_token');
        try {
          if (refreshToken) {
            await api('/auth/logout', {
              method: 'POST',
              json: { refreshToken },
            });
          }
        } finally {
          clearTokens();
          setUser(null);
        }
      },
      refreshMe,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
