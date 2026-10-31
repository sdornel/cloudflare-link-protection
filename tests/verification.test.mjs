import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from '../scripts/build.mjs';
import { root, validateConfig } from '../scripts/config.mjs';
import { normalizeVerification } from '../scripts/verification-config.mjs';
import { createWorker } from '../src/worker/index.js';
import { signCookie, readSignedCookie } from '../src/worker/session.js';
import { createPreviewHandler } from '../scripts/serve.mjs';

const sample = JSON.parse(await readFile(path.join(root, 'config/site.example.json'), 'utf8'));
const origin = 'https://profile.example';
const profilePath = '/sample-creator';
const config = () => ({ ...structuredClone(sample), siteUrl: origin, profilePath,
  verification: { enabled: true, sessionMinutes: 60, copy: { heading: 'Welcome <visitor>' }, styles: { variables: { accent: '#112233' } } } });
const cookie = (response, name) => response.headers.getSetCookie().find(value => value.startsWith(name + '='))?.split(';')[0];

async function fixture(t, override = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'verification-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settings = { ...config(), ...override };
  await build({ outDir: directory, config: settings });
  const state = { time: 100000, assetPaths: [], verificationCalls: [], result: {}, failure: null };
  const spent = new Set();
  const env = {
    TURNSTILE_SITE_KEY: 'public-fixture-site-key', TURNSTILE_SECRET_KEY: 'private-fixture-verification-key',
    VERIFICATION_SESSION_SECRET: randomBytes(32).toString('hex'),
    ASSETS: { async fetch(request) {
      const url = new URL(request.url);
      state.assetPaths.push(url.pathname);
      let filename = path.join(directory, url.pathname);
      try {
        if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
        const bytes = await readFile(filename);
        if (request.headers.has('If-None-Match')) return new Response(null, { status: 304 });
        const type = filename.endsWith('.json') ? 'application/json' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.txt') ? 'text/plain' : 'text/html';
        return new Response(bytes, { headers: { 'Content-Type': type, ETag: 'fixture-etag' } });
      } catch { return new Response('Not found', { status: 404 }); }
    } },
  };
  const worker = createWorker({ now: () => state.time, async fetchVerification(url, options) {
    state.verificationCalls.push({ url, ...options, body: JSON.parse(options.body) });
    if (state.failure) throw state.failure;
    const token = JSON.parse(options.body).response;
    if (spent.has(token)) return Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    spent.add(token);
    return Response.json({ success: true, hostname: new URL(origin).hostname, action: 'profile_verification', ...state.result });
  } });
  const get = (target = profilePath + '/', options = {}) => worker.fetch(new Request(origin + target, options), env);
  async function challenge(target = profilePath + '/') {
    const response = await get(target);
    const html = await response.text();
    const flow = html.match(/data-flow="([a-f0-9]+)"/)?.[1];
    state.result.cdata = flow;
    return { response, html, flow, cookie: cookie(response, '__Host-profile-challenge') };
  }
  const post = (flowCookie, target = profilePath + '/', token = 'one-use-token', headers = {}) => get('/_verification/verify', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: flowCookie || '', ...headers },
    body: new URLSearchParams({ token, returnTo: target }),
  });
  return { directory, settings, state, env, worker, get, challenge, post };
}

test('verification config defaults, bounds, and secret rejection', () => {
  assert.equal(normalizeVerification().enabled, false);
  assert.equal(normalizeVerification().sessionMinutes, 60);
  for (const value of [null, [], true, { enabled: 'yes' }, { sessionMinutes: 4 }, { sessionMinutes: 1441 },
    { sessionMinutes: 12.5 }, { widgetTheme: 'pink' }, { copy: { heading: '' } }, { copy: { heading: 'x'.repeat(501) } },
    { copy: { secretKey: 'forbidden' } }, { copy: null }, { styles: null }, { styles: [] }, { secretKey: 'forbidden' }]) {
    assert.throws(() => normalizeVerification(value), /verification/);
  }
  assert.throws(() => validateConfig({ ...config(), siteUrl: '' }), /siteUrl/);
  assert.equal(normalizeVerification({ copy: { heading: 'Hello' } }).copy.heading, 'Hello');
});

test('native gate exposes only same-page assistance options and public modules before verification', async t => {
  const f = await fixture(t, { browserOpening: { mode: 'native', autoOpen: true }, analytics: { cloudflareToken: '', ga4MeasurementId: 'G-TEST1234' } });
  const { html } = await f.challenge(profilePath + '/?_lp_handoff=1');
  assert.match(html, /id="verification-form"/); // marker never grants a session
  assert.match(html, /id="browser-open"/);
  assert.doesNotMatch(html, /data-link-id=|G-TEST1234|https:\/\/www.googletagmanager.com\/gtag/);
  const options = JSON.parse(html.match(/id="verification-opening-options" type="application\/json">([^<]+)</)[1]);
  assert.equal(options.autoOpen, true);
  const source = html.match(/src="([^"]+\/verification-opening.js)"/)[1];
  assert.equal((await f.get(source)).status, 200);
  assert.match(await (await f.get(source)).text(), /initializeVerificationOpening/);
});

test('direct mode omits gate assistance and age-enabled profiles defer gate auto-opening', async t => {
  const direct = await fixture(t, { browserOpening: { mode: 'direct' } });
  assert.doesNotMatch((await direct.challenge()).html, /verification-opening-options|id="browser-open"/);
  const age = await fixture(t, { browserOpening: { mode: 'native', autoOpen: true }, ageAcknowledgment: { enabled: true } });
  const { html } = await age.challenge();
  const options = JSON.parse(html.match(/id="verification-opening-options" type="application\/json">([^<]+)</)[1]);
  assert.equal(options.autoOpen, false);
  assert.equal(options.mode, 'native');
  const primary = await fixture(t, { browserOpening: { mode: 'native', autoOpen: true }, ageAcknowledgment: { enabled: true, scope: 'primary' } });
  const primaryHTML = (await primary.challenge()).html;
  const primaryOptions = JSON.parse(primaryHTML.match(/id="verification-opening-options" type="application\/json">([^<]+)</)[1]);
  assert.equal(primaryOptions.autoOpen, true, 'primary-only acknowledgment does not block same-page handoff');
  assert.doesNotMatch(primaryHTML, /id="age-notice"/);
});

test('automatic-only build omits manual buttons on both the gate and protected profile', async t => {
  const f = await fixture(t, { browserOpening: { mode: 'native', autoOpen: true, showManual: false } });
  const { html } = await f.challenge();
  const profile = await readFile(path.join(f.directory, profilePath, 'index.html'), 'utf8');
  for (const document of [html, profile]) assert.doesNotMatch(document, /id="browser-open"/);
  assert.match(html, /verification-opening.js/);
  const options = JSON.parse(html.match(/id="verification-opening-options" type="application\/json">([^<]+)</)[1]);
  assert.equal(options.autoOpen, true);
  assert.equal(options.showManual, false);
  assert.match(html, /id="verification-form"/);
});

test('build uses profile branding, escapes text, isolates gate styling and publishes no credentials/config', async t => {
  const f = await fixture(t);
  const manifest = JSON.parse(await readFile(path.join(f.directory, '_verification/manifest.json'), 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.enabled, true);
  assert.equal(manifest.profilePath, profilePath);
  assert.match(manifest.template, /Welcome &lt;visitor&gt;/);
  assert.match(manifest.template, /role="status"/);
  assert.match(manifest.template, /<noscript>/);
  assert.doesNotMatch(JSON.stringify(manifest), /primaryLink|secondaryLinks|schemaVersion|private-fixture|TURNSTILE_SECRET_KEY/);
  assert.match(await readFile(path.join(f.directory, '_verification/styles.css'), 'utf8'), /--accent: #112233/);
  assert.doesNotMatch(await readFile(path.join(f.directory, 'example/styles.css'), 'utf8'), /#112233/);
  assert.doesNotMatch(await readFile(path.join(f.directory, 'example/index.html'), 'utf8'), /verification-form|challenges.cloudflare.com/);
  const originalManifest = await readFile(path.join(f.directory, '_verification/manifest.json'), 'utf8');
  await assert.rejects(build({ outDir: f.directory, config: { ...config(), verification: { enabled: true, styles: { rules: { body: { color: 'red; display:none' } } } } } }), /Style/);
  await assert.rejects(build({ outDir: f.directory, config: config(), env: { CF_PAGES: '1' } }), /requires the Cloudflare Worker/);
  assert.equal(await readFile(path.join(f.directory, '_verification/manifest.json'), 'utf8'), originalManifest);
});

test('unauthenticated profile aliases return the gate without fetching profile HTML', async t => {
  const f = await fixture(t);
  for (const target of [profilePath, profilePath + '/', profilePath + '/index.html', profilePath + '/index', profilePath + '.html']) {
    const response = await f.get(target);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /verification-form/);
    assert.doesNotMatch(html, /Explore my work|data-link-id/);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('Referrer-Policy'), 'same-origin', 'the gate must preserve Origin on same-origin form POSTs');
    assert.match(response.headers.get('Content-Security-Policy'), /frame-src https:\/\/challenges.cloudflare.com/);
    assert.match(response.headers.get('Content-Security-Policy'), /form-action 'self'/);
    assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /unsafe-inline|unsafe-eval/);
    assert.match(response.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
  }
  assert.ok(f.state.assetPaths.every(path => path === '/_verification/manifest.json'));
  const head = await f.get(profilePath, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('successful verification preserves queries/fragments and authorizes protected HTML with a scoped cookie', async t => {
  const f = await fixture(t);
  const start = await f.challenge(profilePath + '/?utm_source=ig&x=a%2Bb');
  const target = profilePath + '/?utm_source=ig&x=a%2Bb#links';
  const response = await f.post(start.cookie, target);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), target);
  const session = cookie(response, '__Host-profile-session');
  assert.ok(session);
  assert.match(response.headers.getSetCookie().join('\n'), /__Host-profile-challenge=; Path=\/; Max-Age=0/);
  assert.match(response.headers.getSetCookie().find(value => value.startsWith('__Host-profile-session')), /Max-Age=3600; Secure; HttpOnly; SameSite=Lax/);
  assert.equal(f.state.verificationCalls.length, 1);
  assert.equal(f.state.verificationCalls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(f.state.verificationCalls[0].body.secret, f.env.TURNSTILE_SECRET_KEY);
  const passed = await f.get(profilePath + '/index.html?x=a%2Bb', { headers: { Cookie: session, 'If-None-Match': 'fixture-etag' } });
  assert.equal(passed.status, 200);
  assert.match(await passed.text(), /Explore my work/);
  assert.equal(passed.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(passed.headers.get('ETag'), null);
  assert.doesNotMatch(passed.headers.get('Content-Security-Policy'), /challenges.cloudflare.com/);
  assert.equal(f.state.verificationCalls.length, 1, 'cookie reuse must not call Siteverify again');
});

test('public homepage, example, and enumerated assets stay accessible; metadata stays private', async t => {
  const f = await fixture(t);
  for (const target of ['/', '/example/', '/example/more-soon/', profilePath + '/styles.css', profilePath + '/favicon.svg', '/_verification/client.js', '/_verification/styles.css']) {
    const response = await f.get(target);
    assert.equal(response.status, 200, target);
    assert.doesNotMatch(await response.text(), /id="verification-form"/);
  }
  for (const target of ['/_verification/manifest.json', '/_verification', '/_verification/manifest', '/_verification/manifest.json/', profilePath + '/missing.html']) {
    assert.equal((await f.get(target)).status, 404, target);
  }
  for (const target of ['/%5fverification/manifest.json', '/_verification%2fmanifest.json', '/sample%2dcreator/index.html', '//sample-creator/', '/sample-creator//index.html']) {
    const response = await f.get(target);
    assert.equal(response.status, 400, target);
    assert.doesNotMatch(await response.text(), /Explore my work/);
  }
});

test('robots remains readable without a session for root and nested verification gates', async t => {
  for (const profilePath of ['/', '/sample-creator']) {
    const f = await fixture(t, { profilePath, robots: { allowCrawling: false } });
    delete f.env.TURNSTILE_SITE_KEY;
    delete f.env.TURNSTILE_SECRET_KEY;
    delete f.env.VERIFICATION_SESSION_SECRET;
    for (const userAgent of ['ProfilePageProbe/1.0', 'Mozilla/5.0']) {
      const response = await f.get('/robots.txt', { headers: { 'User-Agent': userAgent } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('Content-Type'), /^text\/plain/);
      assert.equal(response.headers.get('Set-Cookie'), null);
      assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n');
    }
    assert.equal(f.state.verificationCalls.length, 0);
  }
});

test('root profile gating also protects index aliases while preserving the neutral demo', async t => {
  const f = await fixture(t, { profilePath: '/' });
  for (const target of ['/', '/index.html', '/index']) assert.match(await (await f.get(target)).text(), /verification-form/);
  assert.match(await (await f.get('/example/')).text(), /Explore my work/);
  assert.equal((await f.get('/styles.css')).status, 200);
});

test('disabled verification needs no secrets and keeps current links behavior', async t => {
  const f = await fixture(t, { verification: { enabled: false } });
  delete f.env.TURNSTILE_SITE_KEY;
  delete f.env.TURNSTILE_SECRET_KEY;
  delete f.env.VERIFICATION_SESSION_SECRET;
  assert.match(await (await f.get(profilePath + '/')).text(), /Explore my work/);
  assert.equal((await f.post('', profilePath + '/')).status, 404);
  assert.equal((await f.get('/_verification/manifest.json')).status, 404);
});

test('missing keys, weak signing secrets, and official test credentials fail closed', async t => {
  const f = await fixture(t);
  for (const [key, value] of [['TURNSTILE_SITE_KEY', ''], ['TURNSTILE_SECRET_KEY', ''], ['VERIFICATION_SESSION_SECRET', 'too-short'],
    ['TURNSTILE_SITE_KEY', '1x00000000000000000000AA'], ['TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA']]) {
    const before = f.env[key];
    f.env[key] = value;
    const response = await f.get();
    assert.equal(response.status, 503, key);
    const html = await response.text();
    assert.match(html, /temporarily unavailable/);
    assert.doesNotMatch(html, /Explore my work/);
    assert.equal(response.headers.get('Set-Cookie'), null);
    f.env[key] = before;
  }
  assert.equal((await f.worker.fetch(new Request('https://alternate.example' + profilePath), f.env)).status, 421);
  assert.equal((await f.worker.fetch(new Request('http://profile.example' + profilePath), f.env)).status, 421);
});

test('sessions reject tampering, expiry, duplicate cookies, and signing-key rotation', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  const session = cookie(await f.post(start.cookie), '__Host-profile-session');
  const parts = session.split('.');
  const tampered = parts[0] + '.' + (parts[1][0] === 'A' ? 'B' : 'A') + parts[1].slice(1);
  for (const value of [tampered, session + '; ' + session]) assert.match(await (await f.get(profilePath + '/', { headers: { Cookie: value } })).text(), /verification-form/);
  f.state.time += 3600;
  assert.match(await (await f.get(profilePath + '/', { headers: { Cookie: session } })).text(), /verification-form/);
  f.state.time -= 3600;
  f.env.VERIFICATION_SESSION_SECRET = randomBytes(32).toString('hex');
  assert.match(await (await f.get(profilePath + '/', { headers: { Cookie: session } })).text(), /verification-form/);
});

test('signed cookies are bound to kind, origin, profile, and maximum lifetime', async () => {
  const secret = randomBytes(32).toString('hex');
  const payload = { v: 1, kind: 'session', origin, profilePath, iat: 100, exp: 3700 };
  const value = await signCookie(payload, secret);
  const expected = { kind: 'session', origin, profilePath, now: 200, maxAge: 3600 };
  assert.ok(await readSignedCookie(value, secret, expected));
  for (const patch of [{ kind: 'challenge' }, { origin: 'https://other.example' }, { profilePath: '/another-profile' }, { now: 99 }, { now: 3700 }, { maxAge: 300 }]) {
    assert.equal(await readSignedCookie(value, secret, { ...expected, ...patch }), null);
  }
});

test('wrong origin, missing or expired challenge cookies never reach Siteverify', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  for (const headers of [{ Origin: 'https://elsewhere.example' }, { Origin: 'null' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await f.post(start.cookie, profilePath + '/', 'test-token', headers)).status, 403);
  }
  assert.equal((await f.post('')).status, 403);
  f.state.time += 300;
  assert.equal((await f.post(start.cookie)).status, 403);
  assert.equal(f.state.verificationCalls.length, 0);
});

test('return locations cannot escape the selected profile or origin', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  for (const target of ['https://elsewhere.example', '//elsewhere.example', '/\\elsewhere.example', '/example/', '/_verification/manifest.json',
    profilePath + '/styles.css', '/sample%2dcreator/', profilePath + '/../example/', profilePath + '/?x=\nLocation:bad', profilePath + '/'.repeat(9000)]) {
    assert.equal((await f.post(start.cookie, target)).status, 400, target.slice(0, 80));
  }
  assert.equal(f.state.verificationCalls.length, 0);
});

test('rejected, replayed, wrong-host, wrong-action and wrong-nonce tokens never issue sessions', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  const base = { cdata: start.flow };
  const patches = [{ success: false }, { hostname: 'elsewhere.example' }, { action: 'other_action' }, { cdata: 'wrong-nonce' }, { cdata: null }];
  for (let index = 0; index < patches.length; index++) {
    f.state.result = { ...base, ...patches[index] };
    const response = await f.post(start.cookie, profilePath + '/', `rejected-${index}`);
    assert.equal(response.status, 403);
    assert.equal(cookie(response, '__Host-profile-session'), undefined);
    assert.doesNotMatch(await response.text(), /Explore my work/);
  }
  f.state.result = base;
  assert.equal((await f.post(start.cookie, profilePath + '/', 'consume-once')).status, 303);
  const replay = await f.post(start.cookie, profilePath + '/', 'consume-once');
  assert.equal(replay.status, 403);
  assert.equal(cookie(replay, '__Host-profile-session'), undefined);
});

test('Siteverify outages offer retry without exposing protected HTML or credentials', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  f.state.failure = new Error('SENSITIVE_FAILURE_DETAIL');
  const response = await f.post(start.cookie);
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /data-state="unavailable"/);
  assert.doesNotMatch(html, /SENSITIVE_FAILURE_DETAIL|private-fixture|Explore my work/);
  assert.equal(cookie(response, '__Host-profile-session'), undefined);
});

test('submission method, encoding, duplicate fields and body limits are enforced', async t => {
  const f = await fixture(t);
  const start = await f.challenge();
  assert.equal((await f.get('/_verification/verify')).status, 405);
  assert.equal((await f.post(start.cookie, profilePath + '/', 'token', { 'Content-Type': 'application/json' })).status, 415);
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: start.cookie };
  for (const body of ['token=a&token=b&returnTo=%2Fsample-creator%2F', 'token=a&returnTo=%2Fsample-creator%2F&unexpected=1', 'token=' + 'a'.repeat(17000)]) {
    const response = await f.get('/_verification/verify', { method: 'POST', headers, body });
    assert.equal(response.status, 400);
  }
  assert.equal(f.state.verificationCalls.length, 0);
});

test('missing or corrupt deployment metadata fails closed and may recover on the next request', async t => {
  const f = await fixture(t);
  let bad = true;
  const fetchAssets = f.env.ASSETS.fetch;
  f.env.ASSETS.fetch = request => bad ? Response.json({ enabled: false }) : fetchAssets(request);
  assert.equal((await f.get()).status, 503);
  bad = false;
  assert.match(await (await f.get()).text(), /verification-form/);
});

test('static preview refuses a gated build instead of exposing profile HTML', async t => {
  const f = await fixture(t);
  const result = {};
  const res = { writeHead(status, headers) { result.status = status; result.headers = headers; return this; }, end(body) { result.body = body; } };
  await createPreviewHandler(f.directory)({ method: 'GET', url: profilePath + '/index.html' }, res);
  assert.equal(result.status, 503);
  assert.match(result.body, /static preview cannot enforce/);
  assert.doesNotMatch(result.body, /Explore my work/);
});
