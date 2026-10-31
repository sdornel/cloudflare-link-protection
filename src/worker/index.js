import { cookieHeader, getCookie, nonce, readSignedCookie, signCookie } from './session.js';

const PREFIX = '/_verification';
const VERIFY = `${PREFIX}/verify`;
const SESSION = '__Host-profile-session';
const CHALLENGE = '__Host-profile-challenge';
const ACTION = 'profile_verification';
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const CHALLENGE_SECONDS = 300;
const MAX_BODY = 16384;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const plainHeaders = {
  'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
};
const plain = (message, status, method) => new Response(method === 'HEAD' ? null : message, { status, headers: plainHeaders });
const ambiguousPath = path => /[%\\\x00-\x20\x7f]/.test(path) || path.includes('//');

function validateManifest(value) {
  if (!value || value.version !== 1 || typeof value.enabled !== 'boolean' ||
      !value.responseHeaders || typeof value.responseHeaders['Content-Security-Policy'] !== 'string') throw new Error('Invalid deployment.');
  if (value.enabled) {
    const origin = new URL(value.origin);
    if (origin.protocol !== 'https:' || origin.origin !== value.origin ||
        typeof value.profilePath !== 'string' || !/^\/(?:[a-z0-9][a-z0-9-]{0,63})?$/.test(value.profilePath) ||
        !Number.isInteger(value.sessionSeconds) || value.sessionSeconds < 300 || value.sessionSeconds > 86400 ||
        !Array.isArray(value.publicPaths) || value.publicPaths.some(path => typeof path !== 'string' || !path.startsWith('/') || ambiguousPath(path)) ||
        typeof value.template !== 'string' || !value.template.includes('{{VERIFICATION_SITE_KEY}}') ||
        !value.messages || ['loading', 'expired', 'error', 'unavailable'].some(key => typeof value.messages[key] !== 'string')) throw new Error('Invalid deployment.');
  }
  return value;
}

function protectedPath(path, config) {
  if (!config.enabled || config.publicPaths.includes(path)) return false;
  if (config.profilePath === '/') return path !== '/example' && !path.startsWith('/example/');
  // Protect the entire profile subtree except explicitly enumerated public assets.
  // Include the extension alias defensively even when no such static file exists.
  const lower = path.toLowerCase();
  return lower === config.profilePath || lower === `${config.profilePath}.html` || lower.startsWith(`${config.profilePath}/`);
}

function returnPath(value, config, origin) {
  if (typeof value !== 'string' || value.length > 8192 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return null;
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  const base = config.profilePath === '/' ? '' : config.profilePath;
  if (url.origin !== origin || ambiguousPath(url.pathname) ||
      ![base || '/', `${base}/`, `${base}/index.html`, `${base}/index`, ...(base ? [`${base}.html`] : [])].includes(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

function ready(env) {
  const keys = [env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY, env.VERIFICATION_SESSION_SECRET];
  return keys.every(value => typeof value === 'string' && value.length >= 10 && value.length <= 4096) &&
    /^[a-zA-Z0-9_-]{10,100}$/.test(env.TURNSTILE_SITE_KEY) && env.VERIFICATION_SESSION_SECRET.length >= 32 &&
    env.VERIFICATION_SESSION_SECRET !== env.TURNSTILE_SECRET_KEY &&
    // Official always-pass test credentials must never silently gate a production site.
    !keys.slice(0, 2).some(value => /^[123]x0{10}/.test(value));
}

function securityHeaders(config, gate = false) {
  const headers = new Headers(config.responseHeaders);
  if (gate) {
    const policy = headers.get('Content-Security-Policy')
      .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
      .replace("connect-src 'self'", "connect-src 'self' https://challenges.cloudflare.com")
      .replace("form-action 'none'", "form-action 'self'");
    headers.set('Content-Security-Policy', `${policy}; frame-src https://challenges.cloudflare.com`);
    // A no-referrer policy makes navigation POSTs send Origin: null, including
    // this same-origin form. Keep its Origin usable for CSRF checks while
    // withholding referrers from third-party widget requests.
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return headers;
}

function noCache(headers) {
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Cookie');
  headers.delete('ETag');
  headers.delete('Last-Modified');
}

async function readBody(request) {
  if (!request.body || Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('Invalid body.');
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('Invalid body.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  const params = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(data));
  if ([...params.keys()].some(key => !['token', 'returnTo'].includes(key)) || params.getAll('token').length !== 1 || params.getAll('returnTo').length !== 1) throw new Error('Invalid body.');
  return params;
}

export function createWorker({ fetchVerification = (...args) => fetch(...args), now = () => Math.floor(Date.now() / 1000) } = {}) {
  // A binding belongs to a deployment; do not cache sessions or verification outcomes.
  const manifests = new WeakMap();
  async function manifest(env, origin) {
    if (!manifests.has(env.ASSETS)) {
      const promise = env.ASSETS.fetch(new Request(`${origin}${PREFIX}/manifest.json`)).then(async response => {
        if (!response.ok) throw new Error('Missing deployment metadata.');
        return validateManifest(await response.json());
      });
      manifests.set(env.ASSETS, promise);
      promise.catch(() => manifests.delete(env.ASSETS));
    }
    return manifests.get(env.ASSETS);
  }

  async function signed(request, env, config, kind) {
    return readSignedCookie(getCookie(request, kind === 'session' ? SESSION : CHALLENGE), env.VERIFICATION_SESSION_SECRET,
      { kind, origin: config.origin, profilePath: config.profilePath, now: now(), maxAge: kind === 'session' ? config.sessionSeconds : CHALLENGE_SECONDS });
  }

  async function gate(request, env, config, target, state = 'loading', status = 200) {
    const configured = ready(env);
    if (!configured) { state = 'unavailable'; status = 503; }
    const headers = securityHeaders(config, true);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    noCache(headers);
    let flow = null;
    if (configured) {
      flow = await signed(request, env, config, 'challenge');
      if (!flow) {
        const issued = now();
        flow = { v: 1, kind: 'challenge', origin: config.origin, profilePath: config.profilePath, iat: issued, exp: issued + CHALLENGE_SECONDS, nonce: nonce() };
        headers.append('Set-Cookie', cookieHeader(CHALLENGE, await signCookie(flow, env.VERIFICATION_SESSION_SECRET), CHALLENGE_SECONDS));
      }
    }
    const tokens = { VERIFICATION_SITE_KEY: configured ? env.TURNSTILE_SITE_KEY : '', VERIFICATION_FLOW: flow?.nonce || '',
      VERIFICATION_RETURN_TO: target, VERIFICATION_STATE: state, VERIFICATION_STATUS: config.messages[state] };
    const html = config.template.replace(/\{\{(VERIFICATION_[A-Z_]+)\}\}/g, (_, key) => escape(tokens[key] ?? ''));
    if (status === 503) headers.set('Retry-After', '30');
    return new Response(request.method === 'HEAD' ? null : html, { status, headers });
  }

  async function verify(request, env, config, url) {
    if (request.method !== 'POST') return plain('Method not allowed.', 405, request.method);
    if (!config.enabled) return plain('Not found.', 404);
    if (url.origin !== config.origin || url.protocol !== 'https:' || request.headers.get('Origin') !== config.origin ||
        request.headers.get('Sec-Fetch-Site') === 'cross-site') return plain('Request not allowed.', 403);
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return plain('Unsupported request.', 415);
    let body;
    try { body = await readBody(request); } catch { return plain('Invalid request.', 400); }
    const target = returnPath(body.get('returnTo'), config, url.origin);
    const token = body.get('token');
    if (!target || !token || token.length > 2048) return plain('Invalid request.', 400);
    if (!ready(env)) return gate(request, env, config, target, 'unavailable', 503);
    const flow = await signed(request, env, config, 'challenge');
    if (!flow) return gate(request, env, config, target, 'expired', 403);
    let result;
    try {
      const response = await fetchVerification(SITEVERIFY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined }),
      });
      if (!response.ok) throw new Error('Unavailable.');
      result = await response.json();
    } catch { return gate(request, env, config, target, 'unavailable', 503); }
    if (result?.success !== true || result.hostname !== url.hostname || result.action !== ACTION || result.cdata !== flow.nonce) {
      return gate(request, env, config, target, 'error', 403);
    }
    const issued = now();
    const session = { v: 1, kind: 'session', origin: config.origin, profilePath: config.profilePath, iat: issued, exp: issued + config.sessionSeconds };
    const headers = securityHeaders(config);
    noCache(headers);
    headers.set('Location', target);
    headers.append('Set-Cookie', cookieHeader(SESSION, await signCookie(session, env.VERIFICATION_SESSION_SECRET), config.sessionSeconds));
    headers.append('Set-Cookie', cookieHeader(CHALLENGE, '', 0));
    return new Response(null, { status: 303, headers });
  }

  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        if (ambiguousPath(url.pathname)) return plain('Invalid path.', 400, request.method);
        const internal = url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`);
        if (internal && ![VERIFY, `${PREFIX}/client.js`, `${PREFIX}/styles.css`].includes(url.pathname)) return plain('Not found.', 404, request.method);
        const config = await manifest(env, url.origin);
        if (url.pathname === VERIFY) return await verify(request, env, config, url);
        if (!['GET', 'HEAD'].includes(request.method)) return plain('Method not allowed.', 405, request.method);
        const protectedDocument = !internal && protectedPath(url.pathname, config);
        if (protectedDocument) {
          if (url.protocol !== 'https:' || url.origin !== config.origin) return plain('This page is available on its configured HTTPS domain.', 421, request.method);
          if (!ready(env) || !await signed(request, env, config, 'session')) {
            const target = returnPath(url.pathname + url.search, config, url.origin);
            // Unknown paths in the protected subtree return a real 404 without revealing HTML.
            if (!target) return plain('Not found.', 404, request.method);
            return await gate(request, env, config, target);
          }
        }
        // Never forward conditional requests for protected HTML: a previous public
        // response must not be resurrected from a browser/shared cache after gating.
        const assetRequest = new Request(request);
        if (protectedDocument) for (const header of ['If-None-Match', 'If-Modified-Since']) assetRequest.headers.delete(header);
        const asset = await env.ASSETS.fetch(assetRequest);
        const headers = new Headers(asset.headers);
        for (const [key, value] of securityHeaders(config)) headers.set(key, value);
        if (protectedDocument) noCache(headers);
        return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, statusText: asset.statusText, headers });
      } catch {
        // Deployment/verification failures never fall through to protected assets.
        return plain('This page is temporarily unavailable. Please try again shortly.', 503, request.method);
      }
    },
  };
}

export default createWorker();
