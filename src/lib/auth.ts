const STORAGE_KEY = 'nghe.session';

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
}

function gateway(path: string): string {
  return `${apiBase()}${path}`;
}

function readTokens(): Tokens | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Tokens;
    if (!data.access_token || !data.refresh_token || !data.expires_at) return null;
    return data;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

function decodeSession(value: string): Tokens | null {
  try {
    const json = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(json) as Tokens;
    if (!data.access_token || !data.refresh_token || !data.expires_at) return null;
    return data;
  } catch {
    return null;
  }
}

export function consumeAuthRedirect(): string | null {
  const url = new URL(window.location.href);
  const error = url.searchParams.get('auth_error');
  const session = new URLSearchParams(url.hash.replace(/^#/, '')).get('session');
  if (session) {
    const tokens = decodeSession(session);
    if (tokens) writeTokens(tokens);
  }
  if (error || session) {
    url.searchParams.delete('auth_error');
    url.hash = '';
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }
  if (!error) return null;
  sessionStorage.removeItem(STORAGE_KEY);
  if (error === 'access_denied') return 'Bạn đã từ chối quyền truy cập Spotify.';
  if (error === 'state') return 'Phiên đăng nhập không khớp. Hãy bấm kết nối lại.';
  return error;
}

export async function hasSession(): Promise<boolean> {
  if (readTokens()) return true;
  const response = await fetch(gateway('/auth/session'), { credentials: 'include' });
  if (!response.ok) return false;
  const data = (await response.json()) as { authenticated?: boolean };
  return Boolean(data.authenticated);
}

export async function redirectUri(): Promise<string> {
  const response = await fetch(gateway('/auth/config'), { credentials: 'include' });
  const data = (await response.json().catch(() => null)) as { redirectUri?: string; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message || 'Máy chủ proxy chưa chạy.');
  if (!data?.redirectUri) throw new Error('Máy chủ chưa có Redirect URI.');
  return data.redirectUri;
}

export function beginLogin(): void {
  window.location.assign(gateway('/auth/login'));
}

let refreshing: Promise<string> | null = null;

async function refresh(tokens: Tokens): Promise<string> {
  const response = await fetch(gateway('/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Nghe-Request': '1' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });
  const data = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: { message?: string };
  } | null;
  if (!response.ok || !data?.access_token || !data.expires_in) {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('nghe:logout'));
    throw new Error(data?.error?.message || 'Phiên hết hạn');
  }
  const next: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  writeTokens(next);
  return next.access_token;
}

export function ensureAccessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) {
    return fetch(gateway('/auth/token'), { credentials: 'include' }).then(async (response) => {
      const data = (await response.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
      if (!response.ok || !data?.access_token) {
        window.dispatchEvent(new Event('nghe:logout'));
        throw new Error(data?.error?.message || 'Chưa đăng nhập');
      }
      return data.access_token;
    });
  }
  if (Date.now() < tokens.expires_at - 30_000) return Promise.resolve(tokens.access_token);
  if (!refreshing) {
    refreshing = refresh(tokens).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export function forceRefresh(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) return ensureAccessToken();
  refreshing = refresh(tokens).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  void fetch(gateway('/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Nghe-Request': '1' },
  });
}
