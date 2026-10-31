import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLaunchError, browserOptions, browserOutcome, LIMITS, navigationEntry, requestPolicy } from '../scripts/browser-crawl-check.mjs';

const origin = 'https://profile.example';

test('launch diagnostics distinguish missing Linux libraries from missing browser binaries', () => {
  const missingLibrary = new Error('browserType.launch: Target page, context or browser has been closed\n[pid=14][err] /cache/chrome-headless-shell: error while loading shared libraries: libnspr4.so: cannot open shared object file: No such file or directory');
  assert.match(browserLaunchError(missingLibrary), /installed.*libnspr4\.so.*install-deps chromium/);
  assert.match(browserLaunchError(new Error('Host system is missing dependencies to run browsers.')), /install-deps chromium/);
  assert.match(browserLaunchError(new Error("Executable doesn't exist at /cache/chromium")), /executable is missing.*playwright install chromium/);
  assert.match(browserLaunchError(new Error('Missing X server or $DISPLAY')), /without --headed/);
  const other = browserLaunchError(new Error('spawn EPERM\nverbose details'));
  assert.match(other, /spawn EPERM.*DEBUG=pw:browser/);
  assert.doesNotMatch(other, /verbose details|install chromium/);
});

test('browser CLI accepts explicit URLs and headed mode without arbitrary browser options', () => {
  assert.deepEqual(browserOptions([]), { headed: false, channel: 'bundled', targetArgs: [] });
  for (const args of [['--headed', '--url', origin], ['--url', origin, '--headed']]) {
    assert.deepEqual(browserOptions(args), { headed: true, channel: 'bundled', targetArgs: ['--url', origin] });
  }
  for (const args of [['--url'], ['--headed', '--headed'], ['--stealth'], ['--proxy', origin]]) assert.throws(() => browserOptions(args));
  assert.equal(LIMITS.requests, 60);
  assert.equal(LIMITS.observationMs, 20000);
});

test('browser channels select bundled/full/system browsers without accepting executable paths or duplicate flags', () => {
  for (const channel of ['bundled', 'chromium', 'chrome', 'msedge']) {
    assert.deepEqual(browserOptions(['--url', origin, '--channel', channel, '--headed']), { headed: true, channel, targetArgs: ['--url', origin] });
  }
  for (const args of [['--channel'], ['--channel', '/tmp/browser'], ['--channel', 'chrome', '--channel', 'msedge']]) assert.throws(() => browserOptions(args));
  assert.match(browserLaunchError(new Error("Chromium distribution 'chrome' is not found"), 'chrome'), /selected chrome.*--channel chromium/);
});

test('browser scope permits own-page resources and provider frames but not external navigations', () => {
  assert.equal(requestPolicy(origin + '/sample/?private=value', origin, { main: true }), null);
  assert.equal(requestPolicy('https://challenges.cloudflare.com/turnstile/v0/api.js?private=value', origin), null);
  assert.equal(requestPolicy('https://challenges.cloudflare.com/', origin, { main: true }), 'external');
  for (const url of ['https://elsewhere.example/destination', 'https://challenges.cloudflare.com.evil.example/', 'https://sub.profile.example/']) {
    assert.equal(requestPolicy(url, origin), 'external');
  }
  for (const url of ['javascript:alert(1)', 'file:///tmp/private', 'https://secret@profile.example/', 'invalid']) {
    assert.equal(requestPolicy(url, origin), 'invalid_url');
  }
  assert.equal(requestPolicy(origin, origin, { popup: true }), 'popup');
});

test('normal verification POSTs work while arbitrary writes are blocked', () => {
  for (const url of [origin + '/_verification/verify', origin + '/cdn-cgi/challenge-platform/request', 'https://challenges.cloudflare.com/verification']) {
    assert.equal(requestPolicy(url, origin, { method: 'POST' }), null);
    assert.equal(requestPolicy(url, origin, { method: 'DELETE' }), 'method');
  }
  for (const url of [origin + '/_verification/verify/extra', origin + '/account/delete']) {
    assert.equal(requestPolicy(url, origin, { method: 'POST' }), 'method');
  }
});

test('browser reports redact queries, fragments, external addresses, bodies and sensitive headers', () => {
  const entry = navigationEntry(origin + '/sample/?secret-query#secret-fragment', origin, 403, {
    'cf-mitigated': 'challenge', 'cf-ray': 'abc123-ATL',
    'set-cookie': 'secret-cookie', authorization: 'secret-authorization',
  }, 'GET');
  assert.equal(entry.url, origin + '/sample/');
  assert.equal(entry.challenge, true);
  assert.equal(entry.rayId, 'abc123-ATL');
  assert.doesNotMatch(JSON.stringify(entry), /secret/);
  const external = navigationEntry('https://private-destination.example/secret', origin, 200, { 'cf-ray': 'invalid secret' }, 'custom-secret');
  assert.equal(external.url, '[external]');
  assert.equal(external.method, 'other');
  assert.equal(external.rayId, undefined);
  assert.doesNotMatch(JSON.stringify(external), /secret|private-destination/);
});

test('exposed anchors count as readable even when hidden or on an HTTP error page', () => {
  assert.equal(browserOutcome({ dom: { profileLinks: 2, renderedProfileLinks: 0 }, navigations: [{ status: 403, challenge: true }] }), 'profile_links_exposed');
  assert.equal(browserOutcome({ dom: { profileLinks: 2 }, navigations: [], stopReason: 'rate_limited' }), 'rate_limited');
});

test('classifications distinguish pending challenges, app gates, outages and incomplete observations', () => {
  for (const [dom, nav, expected] of [
    [null, { status: 200, challenge: true }, 'cloudflare_challenge'],
    [{ gate: true }, { status: 200 }, 'verification_gate'],
    [{ gate: true, gateState: 'unavailable' }, { status: 200 }, 'verification_unavailable'],
    [{ gate: true }, { status: 503 }, 'verification_unavailable'],
    [null, { status: 503 }, 'server_error'],
    [null, { status: 403 }, 'blocked'],
    [null, { status: 404 }, 'http_error'],
    [null, { status: 200 }, 'inconclusive'],
  ]) assert.equal(browserOutcome({ dom, navigations: [nav] }), expected);
  assert.equal(browserOutcome({ navigations: [] }), 'inconclusive');
});
