const CLIENT_KEY = 'nghe.clientId';
const TOKEN_KEY = 'nghe.tokens';
const VERIFIER_KEY = 'nghe.verifier';
const STATE_KEY = 'nghe.state';

export function redirectUri(): string {
  if (window.location.hostname === 'localhost') return 'http://127.0.0.1:5173/callback';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/callback`;
}

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
  'user-top-read',
  'user-read-recently-played',
  'user-follow-read',
].join(' ');

type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export function getClientId(): string {
  return localStorage.getItem(CLIENT_KEY) ?? '';
}

export function setClientId(id: string): void {
  localStorage.setItem(CLIENT_KEY, id.trim());
}

export function getTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

function saveTokens(tokens: Tokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function beginLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Hãy dán Client ID trước.');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    state,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export async function finishLoginFromUrl(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return false;
  const state = url.searchParams.get('state');
  const expected = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  window.history.replaceState({}, '', '/');
  if (error) {
    throw new Error(error === 'access_denied' ? 'Bạn đã từ chối quyền truy cập Spotify.' : error);
  }
  if (!verifier || !state || state !== expected) {
    throw new Error('Phiên đăng nhập không khớp. Hãy bấm kết nối lại.');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code ?? '',
    redirect_uri: redirectUri(),
    client_id: getClientId(),
    code_verifier: verifier,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error(data.error_description || 'Đăng nhập Spotify thất bại.');
  }
  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return true;
}

let refreshing: Promise<string> | null = null;

async function refresh(tokens: Tokens): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: getClientId(),
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token || !data.expires_in) {
    clearSession();
    window.dispatchEvent(new Event('nghe:logout'));
    throw new Error(data.error_description || 'Phiên hết hạn');
  }
  const next: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveTokens(next);
  return next.access_token;
}

export function ensureAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens) {
    window.dispatchEvent(new Event('nghe:logout'));
    return Promise.reject(new Error('Chưa đăng nhập'));
  }
  if (Date.now() < tokens.expires_at - 30_000) return Promise.resolve(tokens.access_token);
  if (!refreshing) refreshing = refresh(tokens).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function forceRefresh(): Promise<string> {
  const tokens = getTokens();
  if (!tokens) throw new Error('Chưa đăng nhập');
  refreshing = refresh(tokens).finally(() => {
    refreshing = null;
  });
  return refreshing;
}
