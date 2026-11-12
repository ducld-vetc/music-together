import { ensureAccessToken, forceRefresh } from './auth';

export async function spotify<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await ensureAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`;
  const response = await fetch(url, { ...init, headers });
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
