import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const SPOTIFY_REDIRECT_URI = (process.env.SPOTIFY_REDIRECT_URI || '').trim();
const FRONTEND_ORIGIN_ENV = (process.env.FRONTEND_ORIGIN || '').trim();
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const PORT = process.env.PORT || '8787';
const HOST = process.env.HOST || '127.0.0.1';
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || 'lax';
const COOKIE_SECURE = process.env.COOKIE_SECURE || 'false';

const FRONTEND_ORIGIN = FRONTEND_ORIGIN_ENV || (process.env.VERCEL ? '' : 'http://127.0.0.1:5173');

const missing = [];
if (!SPOTIFY_REDIRECT_URI || !isHttpUrl(SPOTIFY_REDIRECT_URI)) missing.push('SPOTIFY_REDIRECT_URI');
if (!SESSION_SECRET) missing.push('SESSION_SECRET');
if (!FRONTEND_ORIGIN || !isHttpUrl(FRONTEND_ORIGIN)) missing.push('FRONTEND_ORIGIN');

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

const CLIENT_ID_RE = /^[0-9a-fA-F]{32}$/;
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const API_ROOT = 'https://api.spotify.com/v1';
const secureCookie = COOKIE_SECURE === 'true' || (COOKIE_SECURE !== 'false' && process.env.VERCEL === '1');
const frontend = isHttpUrl(FRONTEND_ORIGIN) ? new URL(FRONTEND_ORIGIN) : null;

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: frontend ? frontend.origin : false,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Nghe-Request'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(SESSION_SECRET || 'unset'));
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = [
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'src/public'),
  path.join(here, 'public'),
  path.join(here, '../public'),
  path.join(here, 'src/public'),
].find((dir) => existsSync(path.join(dir, 'index.html')));

function isPage(req) {
  return (req.method === 'GET' || req.method === 'HEAD')
    && !req.path.startsWith('/auth')
    && !req.path.startsWith('/spotify')
    && req.path !== '/health';
}

app.use((req, res, next) => {
  if (!missing.length || req.path === '/health' || isPage(req)) {
    next();
    return;
  }
  res.status(500).json({ error: { message: `Thiếu cấu hình máy chủ: ${missing.join(', ')}` } });
});

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

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

function pkceCookieOptions(maxAge) {
  return { ...cookieOptions(maxAge), path: '/auth' };
}

function frontendUrl(query = '') {
  const base = (frontend?.href || FRONTEND_ORIGIN).replace(/\/$/, '');
  return query ? `${base}/?${query}` : `${base}/`;
}

function sessionPage(tokens) {
  const payload = Buffer.from(JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  })).toString('base64url');
  const target = `${(frontend?.href || FRONTEND_ORIGIN).replace(/\/$/, '')}/#session=${payload}`;
  return `<!doctype html><meta charset="utf-8"><title>Nghe</title><script>location.replace(${JSON.stringify(target)})</script>`;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeClientId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return CLIENT_ID_RE.test(id) ? id : '';
}

function packPkce(state, verifier, clientId) {
  return `${state}.${verifier}.${clientId}`;
}

function readPkce(req) {
  const raw = req.signedCookies.nghe_pkce;
  if (typeof raw !== 'string') return null;
  const [state, verifier, clientId] = raw.split('.');
  if (!state || !verifier || !clientId || raw.split('.').length !== 3) return null;
  if (!/^[0-9a-f]{32}$/.test(state)) return null;
  if (!/^[A-Za-z0-9\-_]{43,128}$/.test(verifier)) return null;
  if (!normalizeClientId(clientId)) return null;
  return { state, verifier, client_id: clientId };
}

function sameState(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const refreshes = new Map();

function refreshTokens(refreshToken, clientId) {
  const key = `${clientId}\n${refreshToken}`;
  const pending = refreshes.get(key);
  if (pending) return pending;
  const next = exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })).finally(() => {
    refreshes.delete(key);
  });
  refreshes.set(key, next);
  return next;
}

async function exchangeToken(body) {
  let response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw httpError(502, 'Không kết nối được máy chủ đăng nhập Spotify.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.expires_in) {
    const detail = typeof data.error_description === 'string'
      ? data.error_description
      : 'Phiên Spotify hết hạn. Hãy đăng nhập lại.';
    throw httpError(401, detail);
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
  res.clearCookie('nghe_pkce', pkceCookieOptions(0));
}

async function accessToken(req, res, clientId) {
  const refresh = req.signedCookies.nghe_refresh;
  if (!refresh) throw httpError(401, 'Chưa đăng nhập');
  const exp = Number(req.signedCookies.nghe_exp || 0);
  const current = req.signedCookies.nghe_access;
  if (current && exp - 30_000 > Date.now()) return current;
  const id = normalizeClientId(clientId);
  if (!id) throw httpError(400, 'Thiếu Client ID. Hãy dán Client ID của app Spotify của bạn rồi đăng nhập lại.');
  const tokens = await refreshTokens(refresh, id);
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

async function forward(req, res, token) {
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
  const clientId = normalizeClientId(req.query.client_id);
  if (!clientId) {
    res.redirect(frontendUrl(`auth_error=${encodeURIComponent('Hãy dán Client ID của app Spotify của bạn.')}`));
    return;
  }
  const state = randomBytes(16).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  res.cookie('nghe_pkce', packPkce(state, verifier, clientId), pkceCookieOptions(10 * 60 * 1000));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
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
    const pkce = readPkce(req);
    if (!code || !state || !pkce || !sameState(state, pkce.state)) {
      clearSession(res);
      res.redirect(frontendUrl('auth_error=state'));
      return;
    }
    const tokens = await exchangeToken(new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: pkce.client_id,
      code_verifier: pkce.verifier,
    }));
    writeSession(res, tokens);
    res.clearCookie('nghe_pkce', pkceCookieOptions(0));
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
  const token = await accessToken(req, res, req.query.client_id);
  res.set('Cache-Control', 'no-store');
  res.json({ access_token: token });
}));

app.post('/auth/refresh', asyncRoute(async (req, res) => {
  if (req.get('x-nghe-request') !== '1') throw httpError(403, 'Thiếu header yêu cầu.');
  const refresh = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : req.signedCookies.nghe_refresh;
  if (!refresh || refresh.length > 4096) throw httpError(401, 'Phiên Spotify hết hạn. Hãy đăng nhập lại.');
  const clientId = normalizeClientId(req.body?.client_id);
  if (!clientId) throw httpError(400, 'Thiếu Client ID. Hãy dán Client ID của app Spotify của bạn rồi đăng nhập lại.');
  const tokens = await refreshTokens(refresh, clientId);
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

// Allowlisted reverse proxy. The browser calls these with the logged-in user's bearer token.
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
    await forward(req, res, presented);
    return;
  }
  const token = await accessToken(req, res, req.query.client_id);
  await forward(req, res, token);
}));

if (clientDir) {
  app.use(express.static(clientDir, { index: false }));
  app.use((req, res, next) => {
    if (!isPage(req)) {
      next();
      return;
    }
    res.sendFile(path.join(clientDir, 'index.html'), (error) => error && next());
  });
} else {
  app.get('/', (_req, res) => {
    const dirs = [process.cwd(), here, path.join(here, '..'), '/var/task'];
    const listing = dirs.map((dir) => {
      try {
        return `${dir}: ${readdirSync(dir).join(', ')}`;
      } catch (error) {
        return `${dir}: ${error instanceof Error ? error.message : 'unreadable'}`;
      }
    });
    res.type('text/plain').send(listing.join('\n'));
  });
}

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
