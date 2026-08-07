import type { AuthUser } from './AuthContext';

export async function resolvePostLoginPath(
  user: AuthUser,
  apiGet: <T>(path: string) => Promise<T>,
): Promise<'/admin' | '/curator' | '/support' | '/lk'> {
  if (user.globalRole === 'ADMIN') return '/admin';
  if (user.globalRole === 'SUPPORT') return '/support';
  const managed = await apiGet<unknown[]>('/courses?managedOnly=true');
  if (managed.length) return '/curator';
  return '/lk';
}
