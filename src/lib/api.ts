import { ensureAccessToken, forceRefresh, apiBase } from './auth';

function proxyPath(path: string): string {
  const prefix = 'https://api.spotify.com/v1';
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  if (/^https?:\/\//i.test(relative)) throw new Error('Chỉ gọi được API Spotify qua máy chủ.');
  return relative.startsWith('/') ? relative : `/${relative}`;
}

export async function spotify<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Nghe-Request', '1');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  try {
    headers.set('Authorization', `Bearer ${await ensureAccessToken()}`);
  } catch (error) {
    if (!retry) throw error;
  }
  const response = await fetch(`${apiBase()}/spotify${proxyPath(path)}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 401 && retry) {
    await forceRefresh();
    return spotify<T>(path, init, false);
  }
  if (response.status === 204 || response.status === 202) return undefined as T;
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: { message?: string }; error_description?: string }) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error_description || response.statusText);
  }
  return data as T;
}
