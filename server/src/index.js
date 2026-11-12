import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  FRONTEND_ORIGIN = 'http://127.0.0.1:5173',
  SESSION_SECRET,
  PORT = '8787',
  HOST = '127.0.0.1',
  COOKIE_SAMESITE = 'lax',
  COOKIE_SECURE = 'false',
} = process.env;

const REQUIRED = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REDIRECT_URI', 'SESSION_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length && !process.env.VERCEL) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
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

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const API_ROOT = 'https://api.spotify.com/v1';
const secureCookie = COOKIE_SECURE === 'true' || (COOKIE_SECURE !== 'false' && process.env.VERCEL === '1');

const app = express();
app.disable('x-powered-by');
const frontend = new URL(FRONTEND_ORIGIN);
app.use(cors({
  origin: frontend.origin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Nghe-Request'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(SESSION_SECRET || 'unset'));
app.use((req, res, next) => {
  if (!missing.length || req.path === '/health') {
    next();
    return;
  }
  res.status(500).json({ error: { message: `Thiếu cấu hình máy chủ: ${missing.join(', ')}` } });
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    signed: true,
    secure: secureCookie,
    sameSite: COOKIE_SAMESITE,
    path: '/',
    maxAge,
  };
}

function frontendUrl(query = '') {
  const base = frontend.href.replace(/\/$/, '');
  return query ? `${base}/?${query}` : `${base}/`;
}

function sessionPage(tokens) {
  const payload = Buffer.from(JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  })).toString('base64url');
  const target = `${frontend.href.replace(/\/$/, '')}/#session=${payload}`;
  return `<!doctype html><meta charset="utf-8"><title>Nghe</title><script>location.replace(${JSON.stringify(target)})</script>`;
}

function basicAuth() {
  return `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const refreshes = new Map();

function refreshTokens(refreshToken) {
  const pending = refreshes.get(refreshToken);
  if (pending) return pending;
  const next = exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })).finally(() => {
    refreshes.delete(refreshToken);
  });
  refreshes.set(refreshToken, next);
  return next;
}

async function exchangeToken(body) {
  let response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: basicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw httpError(502, 'Không kết nối được máy chủ đăng nhập Spotify.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.expires_in) {
    throw httpError(401, data.error_description || 'Phiên Spotify hết hạn. Hãy đăng nhập lại.');
  }
  return data;
}

function writeSession(res, tokens, previousRefresh) {
  const refresh = tokens.refresh_token || previousRefresh;
  res.cookie('nghe_access', tokens.access_token, cookieOptions(tokens.expires_in * 1000));
  res.cookie('nghe_refresh', refresh, cookieOptions(30 * 24 * 60 * 60 * 1000));
  res.cookie('nghe_exp', String(Date.now() + tokens.expires_in * 1000), cookieOptions(tokens.expires_in * 1000));
}

function clearSession(res) {
  const expired = cookieOptions(0);
  res.clearCookie('nghe_access', expired);
  res.clearCookie('nghe_refresh', expired);
  res.clearCookie('nghe_exp', expired);
  res.clearCookie('nghe_oauth_state', expired);
}

async function accessToken(req, res) {
  const refresh = req.signedCookies.nghe_refresh;
  if (!refresh) throw httpError(401, 'Chưa đăng nhập');
  const exp = Number(req.signedCookies.nghe_exp || 0);
  const current = req.signedCookies.nghe_access;
  if (current && exp - 30_000 > Date.now()) return current;
  const tokens = await refreshTokens(refresh);
  writeSession(res, tokens, refresh);
  return tokens.access_token;
}

function spotifyUrl(originalUrl) {
  const path = originalUrl.replace(/^\/spotify(?=\/|$)/, '') || '/';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\')) {
    throw httpError(400, 'Đường dẫn Spotify không hợp lệ.');
  }
  const url = new URL(`${API_ROOT}${path}`);
  if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) {
    throw httpError(400, 'Đường dẫn Spotify không hợp lệ.');
  }
  return url;
}

function requestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.get('content-type')) return undefined;
  if (req.body == null || req.body === '') return undefined;
  if (typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length === 0) return undefined;
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
}

function spotifyErrorMessage(status, data) {
  if (data?.error?.message) return data.error.message;
  if (typeof data?.error_description === 'string') return data.error_description;
  if (status === 429) return 'Spotify đang giới hạn tần suất. Hãy thử lại sau.';
  if (status === 401) return 'Phiên Spotify hết hạn. Hãy đăng nhập lại.';
  if (status === 403) return 'Tài khoản Spotify không có quyền thực hiện yêu cầu này.';
  if (status === 404) return 'Spotify không tìm thấy nội dung này.';
  return 'Spotify từ chối yêu cầu.';
}

async function forward(req, res, token, allowRetry) {
  const url = spotifyUrl(req.originalUrl);
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const body = requestBody(req);
  if (body) headers['Content-Type'] = 'application/json';

  let upstream;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw httpError(502, 'Không kết nối được Spotify. Hãy thử lại.');
  }

  if (upstream.status === 401 && allowRetry) {
    const refresh = req.signedCookies.nghe_refresh;
    if (!refresh) throw httpError(401, 'Phiên Spotify hết hạn. Hãy đăng nhập lại.');
    const tokens = await refreshTokens(refresh);
    writeSession(res, tokens, refresh);
    return forward(req, res, tokens.access_token, false);
  }

  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) res.set('Retry-After', retryAfter);
  res.set('Cache-Control', 'no-store');

  const text = await upstream.text();
  if (upstream.status === 204 || text.length === 0) {
    res.status(upstream.status).end();
    return;
  }

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    res.status(upstream.status).json({
      error: {
        status: upstream.status,
        message: spotifyErrorMessage(upstream.status, data),
      },
    });
    return;
  }

  res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(text);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/config', (_req, res) => {
  res.json({ redirectUri: SPOTIFY_REDIRECT_URI });
});

app.get('/auth/login', (req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie('nghe_oauth_state', state, cookieOptions(10 * 60 * 1000));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

app.get('/auth/callback', asyncRoute(async (req, res) => {
  try {
    const error = typeof req.query.error === 'string' ? req.query.error : '';
    if (error) {
      clearSession(res);
      res.redirect(frontendUrl(`auth_error=${encodeURIComponent(error)}`));
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state || state !== req.signedCookies.nghe_oauth_state) {
      clearSession(res);
      res.redirect(frontendUrl('auth_error=state'));
      return;
    }
    const tokens = await exchangeToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }));
    writeSession(res, tokens);
    res.clearCookie('nghe_oauth_state', cookieOptions(0));
    res.set('Referrer-Policy', 'no-referrer').type('html').send(sessionPage(tokens));
  } catch (error) {
    clearSession(res);
    const message = error instanceof Error ? error.message : 'Đăng nhập Spotify thất bại.';
    res.redirect(frontendUrl(`auth_error=${encodeURIComponent(message)}`));
  }
}));

app.get('/auth/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ authenticated: Boolean(req.signedCookies.nghe_refresh) });
});

app.get('/auth/token', asyncRoute(async (req, res) => {
  const token = await accessToken(req, res);
  res.set('Cache-Control', 'no-store');
  res.json({ access_token: token });
}));

app.post('/auth/refresh', asyncRoute(async (req, res) => {
  if (req.get('x-nghe-request') !== '1') throw httpError(403, 'Thiếu header yêu cầu.');
  const refresh = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : req.signedCookies.nghe_refresh;
  if (!refresh || refresh.length > 4096) throw httpError(401, 'Phiên Spotify hết hạn. Hãy đăng nhập lại.');
  const tokens = await refreshTokens(refresh);
  writeSession(res, tokens, refresh);
  res.set('Cache-Control', 'no-store');
  res.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refresh,
    expires_in: tokens.expires_in,
  });
}));

app.post('/auth/logout', (req, res) => {
  if (req.get('x-nghe-request') !== '1') {
    res.status(403).json({ error: { message: 'Thiếu header yêu cầu.' } });
    return;
  }
  clearSession(res);
  res.status(204).end();
});

// Allowlisted reverse proxy. The browser calls these; the client secret never leaves the server.
// GET  /spotify/search?q=da+lat&type=track
// GET  /spotify/playlists/:id
// PUT  /spotify/me/player/play
app.use('/spotify', asyncRoute(async (req, res) => {
  if (!ALLOWED_METHODS.has(req.method)) throw httpError(405, 'Phương thức không được hỗ trợ.');
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-nghe-request') !== '1') {
    throw httpError(403, 'Thiếu header yêu cầu.');
  }
  spotifyUrl(req.originalUrl);
  const header = req.get('authorization') || '';
  const presented = /^Bearer\s+(\S+)$/i.exec(header)?.[1] || '';
  if (presented) {
    if (presented.length > 4096) throw httpError(401, 'Phiên Spotify không hợp lệ.');
    await forward(req, res, presented, false);
    return;
  }
  const token = await accessToken(req, res);
  await forward(req, res, token, true);
}));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json({
    error: { status, message: err.message || 'Lỗi máy chủ.' },
  });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(Number(PORT), HOST, () => {
    console.log(`Spotify proxy listening on http://${HOST}:${PORT}`);
  });
}
