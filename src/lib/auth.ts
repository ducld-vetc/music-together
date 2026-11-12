const CLIENT_KEY = 'nghe.clientId';
const STORAGE_KEY = 'nghe.session';
const CLIENT_ID_RE = /^[0-9a-fA-F]{32}$/;

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

export function getClientId(): string {
  return localStorage.getItem(CLIENT_KEY) ?? '';
}

export function setClientId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) {
    localStorage.removeItem(CLIENT_KEY);
    return;
  }
  localStorage.setItem(CLIENT_KEY, trimmed);
}

function clientIdOrThrow(): string {
  const id = getClientId().trim();
  if (!CLIENT_ID_RE.test(id)) {
    throw new Error('Hãy dán Client ID của app Spotify của bạn rồi đăng nhập lại.');
  }
  return id;
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

export function beginLogin(clientId: string): void {
  const id = clientId.trim();
  if (!CLIENT_ID_RE.test(id)) throw new Error('Hãy dán Client ID của app Spotify của bạn.');
  setClientId(id);
  window.location.assign(`${gateway('/auth/login')}?client_id=${encodeURIComponent(id)}`);
}

let refreshing: Promise<string> | null = null;

async function refresh(tokens: Tokens): Promise<string> {
  let clientId = '';
  try {
    clientId = clientIdOrThrow();
  } catch (error) {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('nghe:logout'));
    throw error;
  }
  const response = await fetch(gateway('/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Nghe-Request': '1' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token, client_id: clientId }),
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
    const clientId = getClientId().trim();
    const query = CLIENT_ID_RE.test(clientId) ? `?client_id=${encodeURIComponent(clientId)}` : '';
    return fetch(gateway(`/auth/token${query}`), { credentials: 'include' }).then(async (response) => {
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
