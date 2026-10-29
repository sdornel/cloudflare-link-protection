import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { verificationCopy } from '../scripts/verification-config.mjs';

const source = await readFile(new URL('../src/verification/client.js', import.meta.url), 'utf8');
function setup({ state = 'loading', sitekey = 'public-fixture-key', loaded = false, width = 330 } = {}) {
  const calls = { scripts: [], submissions: [], replacements: [], timers: new Map() };
  const form = { dataset: { state, sitekey, flow: '1234567890abcdef1234567890abcdef', theme: 'light' },
    elements: { token: { value: '' }, returnTo: { value: '/sample-creator/?x=a%2Bb' + (state === 'loading' ? '' : '#links') } },
    submit() { calls.submissions.push({ token: this.elements.token.value, returnTo: this.elements.returnTo.value }); } };
  const status = { textContent: '' };
  const retry = { hidden: true, addEventListener(type, callback) { calls.retry = callback; } };
  const window = {};
  const provider = { render(selector, options) { calls.options = options; return 'fixture-widget'; } };
  if (loaded) window.turnstile = provider;
  const document = {
    getElementById(id) { return { 'verification-form': form, 'verification-status': status, 'verification-retry': retry, 'verification-widget': { clientWidth: width } }[id]; },
    querySelector(selector) { return { textContent: verificationCopy[selector.match(/"([^"]+)"/)[1]] }; },
    createElement() { return {}; }, head: { append(script) { calls.scripts.push(script); } },
  };
  const context = { window, document, URL, location: { origin: 'https://profile.example', pathname: state === 'loading' ? '/sample-creator/' : '/_verification/verify', search: state === 'loading' ? '?x=a%2Bb' : '', hash: state === 'loading' ? '#links' : '', replace(url) { calls.replacements.push(url); } },
    setTimeout(callback) { const id = calls.timers.size + 1; calls.timers.set(id, callback); return id; }, clearTimeout(id) { calls.timers.delete(id); } };
  vm.runInNewContext(source, context);
  return { calls, form, status, retry, ready() { window.turnstile = provider; window.profileTurnstileReady(); } };
}

test('gate loads Turnstile once, passes theme/action/nonce, then submits once with the complete original URL', () => {
  const f = setup();
  assert.equal(f.calls.scripts.length, 1);
  assert.match(f.calls.scripts[0].src, /^https:\/\/challenges.cloudflare.com\/turnstile\/v0\/api.js\?/);
  assert.equal(f.calls.submissions.length, 0);
  f.ready();
  assert.equal(f.calls.options.theme, 'light');
  assert.equal(f.calls.options.size, 'flexible');
  assert.equal(f.calls.options.action, 'profile_verification');
  assert.equal(f.calls.options.cData, f.form.dataset.flow);
  assert.equal(f.calls.options['response-field'], false);
  assert.equal(f.calls.timers.size, 0);
  f.calls.options.callback('verified-token');
  f.calls.options.callback('duplicate-token');
  assert.deepEqual(f.calls.submissions, [{ token: 'verified-token', returnTo: '/sample-creator/?x=a%2Bb#links' }]);
  assert.equal(f.status.textContent, verificationCopy.verifying);
});

test('narrow verification cards use the supported compact widget', () => {
  assert.equal(setup({ loaded: true, width: 282 }).calls.options.size, 'compact');
  assert.equal(setup({ loaded: true, width: 300 }).calls.options.size, 'flexible');
});

test('blocked scripts and loading timeouts offer retry without granting access', () => {
  for (const fail of [f => f.calls.scripts[0].onerror(), f => [...f.calls.timers.values()][0]()]) {
    const f = setup();
    fail(f);
    assert.equal(f.status.textContent, verificationCopy.unavailable);
    assert.equal(f.retry.hidden, false);
    assert.equal(f.calls.submissions.length, 0);
    f.calls.retry();
    assert.deepEqual(f.calls.replacements, ['https://profile.example/sample-creator/?x=a%2Bb#links']);
  }
});

test('widget error, expiry, timeout and unsupported browsers expose recoverable states', () => {
  for (const [callback, message] of [['error-callback', 'error'], ['expired-callback', 'expired'], ['timeout-callback', 'expired'], ['unsupported-callback', 'unavailable']]) {
    const f = setup({ loaded: true });
    f.calls.options[callback]();
    assert.equal(f.status.textContent, verificationCopy[message]);
    assert.equal(f.retry.hidden, false);
    assert.equal(f.calls.submissions.length, 0);
  }
});

test('server rejection and unconfigured gates do not retry automatically or discard the return URL', () => {
  for (const state of ['error', 'expired', 'unavailable']) {
    const f = setup({ state });
    assert.equal(f.calls.scripts.length, 0);
    assert.equal(f.status.textContent, verificationCopy[state]);
    assert.equal(f.retry.hidden, false);
    f.calls.retry();
    assert.equal(f.calls.replacements[0], 'https://profile.example/sample-creator/?x=a%2Bb#links');
  }
  const unconfigured = setup({ sitekey: '' });
  assert.equal(unconfigured.calls.scripts.length, 0);
  assert.equal(unconfigured.status.textContent, verificationCopy.unavailable);
  const unsafe = setup({ state: 'error' });
  unsafe.form.elements.returnTo.value = '//elsewhere.example/';
  unsafe.calls.retry();
  assert.equal(unsafe.calls.replacements.length, 0);
});
