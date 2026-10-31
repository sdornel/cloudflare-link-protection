import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { classify, crawlTarget, probe, USER_AGENT } from '../scripts/crawl-check.mjs';

const origin = 'https://profile.example';
const gate = '<form id="verification-form" data-state="loading"></form>';
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } });

test('crawler selects the configured profile or explicit target without leaking invalid input', async t => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'crawl-config-'));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  await mkdir(path.join(projectRoot, 'config'));
  const config = JSON.parse(await readFile(new URL('../config/site.example.json', import.meta.url), 'utf8'));
  Object.assign(config, { siteUrl: origin, profilePath: '/sample-creator' });
  await writeFile(path.join(projectRoot, 'config/site.json'), JSON.stringify(config));
  assert.equal((await crawlTarget([], { projectRoot, env: {} })).href, origin + '/sample-creator/');
  assert.equal((await crawlTarget(['--url', origin + '/example/'], { projectRoot, env: { SITE_CONFIG_JSON: 'invalid' } })).href, origin + '/example/');
  for (const target of ['http://profile.example', 'https://secret-password@profile.example', 'javascript:secret-password', origin + '/bad path']) {
    await assert.rejects(crawlTarget(['--url', target]), error => !error.message.includes('secret-password'));
  }
  await assert.rejects(crawlTarget(['--url']), /Use --url/);
  config.siteUrl = '';
  await writeFile(path.join(projectRoot, 'config/site.json'), JSON.stringify(config));
  await assert.rejects(crawlTarget([], { projectRoot, env: {} }), /Set siteUrl/);
});

test('even an HTTP 200 Cloudflare challenge stops the crawler after one identified request', async () => {
  const calls = [];
  const report = await probe(origin + '/sample-creator/?private=query#private-fragment', {
    async fetchImpl(url, options) {
      calls.push({ url, options });
      return html('challenge body with private material', 200, { 'cf-mitigated': 'challenge', 'cf-ray': 'abcd1234-IAD', 'Set-Cookie': 'private-cookie=value' });
    },
    wait() { assert.fail('a challenge must not be retried'); },
  });
  assert.equal(report.outcome, 'cloudflare_challenge');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['User-Agent'], USER_AGENT);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[0].url, origin + '/sample-creator/?private=query');
  assert.equal(report.requests[0].rayId, 'abcd1234-IAD');
  assert.doesNotMatch(JSON.stringify(report), /private|query|fragment|challenge body/);
});

test('a branded gate ends the probe without loading scripts or submitting verification', async () => {
  let count = 0;
  const report = await probe(origin + '/sample-creator/', { async fetchImpl() {
    count++;
    return html(gate + '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>');
  } });
  assert.equal(count, 1);
  assert.equal(report.outcome, 'verification_gate');
  assert.doesNotMatch(JSON.stringify(report), /<form|<script|sitekey/);
});

test('same-origin redirects are spaced, preserve queries, and never reuse received cookies', async () => {
  const calls = [], waits = [];
  const report = await probe(origin + '/sample-creator?x=a%2Bb', {
    async fetchImpl(url, options) {
      calls.push(url);
      assert.equal(options.headers.Cookie, undefined);
      return calls.length === 1 ? html('', 308, { Location: '/sample-creator/?x=a%2Bb', 'Set-Cookie': 'do-not-reuse=value' }) : html(gate);
    }, wait: async milliseconds => waits.push(milliseconds),
  });
  assert.deepEqual(calls, [origin + '/sample-creator?x=a%2Bb', origin + '/sample-creator/?x=a%2Bb']);
  assert.deepEqual(waits, [3000]);
  assert.equal(report.outcome, 'verification_gate');
  assert.doesNotMatch(JSON.stringify(report), /a%2Bb|do-not-reuse/);
});

test('external, credential-bearing, invalid and looping redirects are not followed', async () => {
  for (const [location, expected] of [
    ['https://elsewhere.example/private', 'external_redirect_stopped'],
    ['https://secret@profile.example/next', 'invalid_redirect'],
    ['javascript:alert(1)', 'invalid_redirect'],
    ['/sample-creator/#fragment', 'redirect_loop_stopped'],
  ]) {
    let count = 0;
    const report = await probe(origin + '/sample-creator/', { async fetchImpl() { count++; return html('', 302, { Location: location }); } });
    assert.equal(count, 1);
    assert.equal(report.outcome, expected);
    assert.doesNotMatch(JSON.stringify(report), /elsewhere|secret|alert|fragment/);
  }
});

test('redirect chains cannot exceed three sequential requests', async () => {
  let calls = 0;
  const waits = [];
  const report = await probe(origin + '/start', {
    async fetchImpl() { calls++; return html('', 302, { Location: '/redirect-' + calls }); },
    wait: async milliseconds => waits.push(milliseconds),
  });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 3000]);
  assert.equal(report.outcome, 'redirect_limit_stopped');
});

test('rate limits and unavailable gates are distinct from successful protection observations', async () => {
  for (const [status, body, expected] of [
    [429, '', 'rate_limited'], [403, '', 'blocked'], [503, '', 'server_error'],
    [503, gate, 'verification_unavailable'], [200, gate.replace('loading', 'unavailable'), 'verification_unavailable'],
  ]) {
    let count = 0;
    const report = await probe(origin, { async fetchImpl() { count++; return html(body, status, { 'Retry-After': '60' }); } });
    assert.equal(count, 1);
    assert.equal(report.outcome, expected);
  }
  assert.equal(classify(new Response(gate, { headers: { 'Content-Type': 'text/plain' } }), gate), 'other_response');
});

test('visible links are reported without following or recording destination URLs', async () => {
  let count = 0;
  const report = await probe(origin, { async fetchImpl() {
    count++;
    return html('<a data-link-id="primary" href="https://destination.example/private?key=secret">Visit</a>');
  } });
  assert.equal(count, 1);
  assert.equal(report.outcome, 'profile_links_visible');
  assert.doesNotMatch(JSON.stringify(report), /destination|private|key=secret/);
});

test('network failures stop once and do not expose exception details or claim a bot block', async () => {
  let count = 0;
  const report = await probe(origin, { async fetchImpl() {
    count++;
    throw new Error('sensitive-exception-value', { cause: { code: 'EAI_AGAIN' } });
  } });
  assert.equal(count, 1);
  assert.equal(report.outcome, 'network_error');
  assert.equal(report.requests[0].error, 'EAI_AGAIN');
  assert.doesNotMatch(JSON.stringify(report), /sensitive-exception/);
});

test('oversized bodies are cancelled and recorded as truncated', async () => {
  let cancelled = false;
  const report = await probe(origin, { async fetchImpl() {
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); },
      cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'text/html' } });
  } });
  assert.equal(cancelled, true);
  assert.equal(report.requests[0].bodyTruncated, true);
  assert.equal(report.outcome, 'other_response');
});
