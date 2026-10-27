import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeFeatures, publicOptions } from '../scripts/features.mjs';
import { validateConfig } from '../scripts/config.mjs';
import { safeJSON } from '../scripts/render.mjs';
import { eventDetail, createAnalytics } from '../src/client/analytics.js';
const sample = JSON.parse(await readFile(new URL('../config/site.example.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(sample);

test('legacy features default to direct and public options use an explicit allowlist', () => {
  const config = fresh(); delete config.browserOpening;
  config.internalNote = 'PRIVATE_MARKER';
  config.analytics.internalNote = 'PRIVATE_MARKER';
  const value = normalizeFeatures(config);
  assert.equal(value.browserOpening.mode, 'direct'); assert.equal(value.ageAcknowledgment.enabled, false);
  assert.doesNotMatch(JSON.stringify(publicOptions(value)), /PRIVATE_MARKER|cloudflareToken/);
  const text = '</script><script>alert(1)</script>&';
  assert.doesNotMatch(safeJSON({ text }), /<|>|&/);
  assert.equal(JSON.parse(safeJSON({ text })).text, text);
});

test('feature validation rejects invalid modes, ranges, IDs, disabled-link strategies and injection', () => {
  const mutations = [
    c => c.schemaVersion = 3,
    c => c.browserOpening = { mode: 'bouncy' },
    c => c.browserOpening = { autoOpen: 'yes' },
    c => c.browserOpening = { fallbackDelayMs: 0 },
    c => c.browserOpening = { fallbackDelayMs: Infinity },
    c => c.browserOpening = { androidPackage: 'com.test;evil=yes' },
    c => c.browserOpening = { labels: { unsupported: 'x' } },
    c => c.primaryLink.id = 'BAD ID',
    c => { c.primaryLink.id = 'same'; c.secondaryLinks[0].id = 'same'; },
    c => { c.secondaryLinks[0].enabled = false; c.secondaryLinks[0].openingMode = 'bad'; },
    c => c.ageAcknowledgment = { enabled: 'yes' },
    c => c.analytics.ga4MeasurementId = 'SECRET_MARKER',
    c => c.analytics.ga4Consent = 'maybe',
  ];
  for (const mutate of mutations) { const config = fresh(); mutate(config); assert.throws(() => validateConfig(config), error => !error.message.includes('SECRET_MARKER')); }
});

test('analytics events only contain known bounded fields, never URLs or success claims', () => {
  assert.deepEqual(eventDetail('handoff_attempt', { strategy: 'ios-instagram', link_id: 'projects', target: 'https://example.com/?secret=x', platform: 'ios', userAgent: 'secret' }), { name: 'handoff_attempt', strategy: 'ios-instagram', link_id: 'projects', platform: 'ios' });
  assert.equal(eventDetail('handoff_success'), null);
  assert.deepEqual(eventDetail('outbound_click', { link_id: 'https://example.com', reason: 'PRIVATE' }), { name: 'outbound_click' });
});

test('GA4 does not load before consent or replay prior clicks; failure and denied consent leave local telemetry alive', () => {
  const win = new EventTarget(), scripts = [], commands = [];
  win.CustomEvent = class extends Event { constructor(name, { detail }) { super(name); this.detail = detail; } };
  win.location = { protocol: 'https:', origin: 'https://example.com', pathname: '/', href: 'https://example.com/?PRIVATE_MARKER' };
  win.document = { referrer: 'https://ref.example/path?PRIVATE_MARKER', createElement: () => ({}), head: { append: script => scripts.push(script) } };
  win.gtag = (...args) => commands.push(args);
  const events = []; win.addEventListener('profile:analytics', event => events.push(event.detail));
  const analytics = createAnalytics(win, { ga4MeasurementId: 'G-TEST1234', ga4Consent: 'required' });
  analytics.track('landing_view'); analytics.track('outbound_click', { link_id: 'projects' });
  assert.equal(scripts.length, 0); assert.equal(commands.length, 0);
  analytics.setConsent(true); assert.equal(scripts.length, 1); scripts[0].onload();
  assert.equal(commands.filter(command => command[0] === 'event').length, 1);
  assert.doesNotMatch(JSON.stringify(commands), /PRIVATE_MARKER|outbound_click/);
  analytics.setConsent(true); assert.equal(commands.filter(command => command[0] === 'event').length, 1);
  analytics.setConsent(false); const before = commands.length; analytics.track('outbound_click'); assert.equal(commands.length, before);
  assert.equal(events.length, 3);
});

test('explicit null optional values are rejected rather than mistaken for omission', () => {
  for (const mutate of [c => c.schemaVersion = null, c => c.primaryLink.id = null, c => c.primaryLink.openingMode = null]) {
    const config = fresh(); mutate(config); assert.throws(() => validateConfig(config));
  }
});

for (const loadBeforeChange of [true, false]) {
  test(`GA4 reports one view across consent changes (${loadBeforeChange ? 'loaded' : 'loading'} adapter)`, () => {
    const scripts = [], commands = [];
    const win = {
      location: { protocol: 'https:', origin: 'https://example.com', pathname: '/' },
      document: { referrer: '', createElement: () => ({}), head: { append: script => scripts.push(script) } },
      gtag: (...args) => commands.push(args),
    };
    const analytics = createAnalytics(win, { ga4MeasurementId: 'G-TEST1234', ga4Consent: 'required' });
    analytics.track('landing_view');
    analytics.setConsent(true);
    if (loadBeforeChange) scripts[0].onload();
    analytics.setConsent(false);
    analytics.track('outbound_click', { link_id: 'declined' });
    analytics.setConsent(true);
    analytics.track('landing_view');
    if (!loadBeforeChange) scripts[0].onload();
    analytics.track('outbound_click', { link_id: 'allowed' });
    const events = commands.filter(command => command[0] === 'event');
    assert.equal(events.filter(command => command[1] === 'page_view').length, 1);
    assert.equal(events.filter(command => command[1] === 'outbound_click').length, 1);
    assert.doesNotMatch(JSON.stringify(events), /declined/);
    assert.equal(scripts.length, 1);
  });
}
