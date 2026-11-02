import { test as base, expect, devices } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../scripts/build.mjs';
import { createWorker } from '../../src/worker/index.js';

const origin = 'https://browser-flow.example';
const entry = `${origin}/sample-creator/?source=ig&encoded=%20&plus=+`;
const destination = 'https://destination.example/exclusive?x=a%2Bb';
const test = base.extend({
  gate: [false, { option: true }],
  openingOverrides: [{}, { option: true }],
  ageScope: ['primary', { option: true }],
  observe: async ({ page, context, gate, openingOverrides, ageScope }, use, testInfo) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'external-browser-e2e-'));
    const config = JSON.parse(await readFile(new URL('../../config/site.example.json', import.meta.url), 'utf8'));
    Object.assign(config, { siteUrl: origin, profilePath: '/sample-creator', verification: { enabled: gate },
      browserOpening: { mode: 'native', requireExternalBrowser: true, autoOpen: true, androidAutoOpen: true, showManual: false, ...openingOverrides },
      ageAcknowledgment: { enabled: true, scope: ageScope, remember: 'session' },
      primaryLink: { ...config.primaryLink, url: destination } });
    await build({ config, outDir: directory });
    const headers = JSON.parse(await readFile(path.join(directory, '_verification/manifest.json'), 'utf8')).responseHeaders;
    const requests = [], navigation = [], errors = [];
    const assets = { async fetch(request) {
      const url = new URL(request.url);
      const file = url.pathname.endsWith('/') ? url.pathname.slice(1) + 'index.html' : url.pathname.slice(1);
      try {
        const body = await readFile(path.join(directory, file));
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
        return new Response(body, { headers: { ...headers, 'Content-Type': type } });
      } catch { return new Response('Not found', { status: 404 }); }
    } };
    const worker = createWorker({ fetchVerification: async () => Response.json({ success: false }) });
    const env = { ASSETS: assets, TURNSTILE_SITE_KEY: 'fixture-site-key', TURNSTILE_SECRET_KEY: 'fixture-secret-key',
      VERIFICATION_SESSION_SECRET: 'synthetic-signing-key-for-browser-tests-only' };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push(url.href);
      if (url.hostname === 'challenges.cloudflare.com') {
        await route.fulfill({ contentType: 'text/javascript', body: `window.turnstile = { render(selector) {
          const button = document.createElement('button'); button.textContent = 'Verify fixture'; button.type = 'button';
          document.querySelector(selector).append(button);
        }}; window.profileTurnstileReady();` });
        return;
      }
      if (url.origin === 'https://destination.example') { await route.fulfill({ contentType: 'text/html', body: 'Destination fixture' }); return; }
      if (url.origin !== origin) { await route.abort(); return; }
      const req = new Request(url, { method: request.method(), headers: await request.allHeaders(), body: request.postDataBuffer() });
      const response = gate ? await worker.fetch(req, env) : await assets.fetch(req);
      const responseHeaders = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length) responseHeaders['set-cookie'] = response.headers.getSetCookie().join('\n');
      await route.fulfill({ status: response.status, headers: responseHeaders, body: Buffer.from(await response.arrayBuffer()) });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', event => navigation.push(event));
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
    try { await use({ requests, navigation, errors, intents: () => navigation.filter(e => e.url.startsWith('intent://')) }); }
    finally {
      await testInfo.attach('navigation-requests.json', { body: Buffer.from(JSON.stringify({
        scope: 'Real Chromium navigation requests, not Android OS launch confirmation', navigation, errors,
      }, null, 2)), contentType: 'application/json' });
      await context.unrouteAll({ behavior: 'wait' });
      await cdp.detach();
      await rm(directory, { recursive: true, force: true });
    }
  },
});

async function arrival(page, url = entry) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-external-browser-required', 'true');
  await page.clock.runFor(32);
}

for (const gate of [false, true]) {
  test.describe(gate ? 'verification entry' : 'profile entry', () => {
    test.use({ gate });
    test('arrival, unconfirmed popup and first trusted tap preserve the same page', async ({ page, context, observe }, testInfo) => {
      await arrival(page);
      await expect.poll(() => observe.intents().length).toBe(1);
      await expect(page.locator('#external-browser-dialog')).not.toBeVisible();
      expect(await page.locator('main').evaluate(e => e.inert)).toBe(true);
      await page.clock.runFor(1900);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Couldn't open in Chrome automatically.");
      await expect(dialog).toContainText('three-dot menu at the top right');
      await expect(dialog.locator('a, button')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (!gate) await page.screenshot({ path: testInfo.outputPath('required-browser-mobile.png') });
      await expect(page.locator('#handoff-panel, #browser-open')).toHaveCount(0);
      expect(observe.requests.some(url => url.includes('challenges.cloudflare.com'))).toBe(false);
      await dialog.getByRole('link', { name: 'Open in browser' }).tap();
      await expect.poll(() => observe.intents().length).toBe(2);
      const tap = observe.intents()[1];
      expect(tap.reason).toBe('anchorClick');
      expect(tap.url).toBe(`intent://${entry.slice(8)}&_lp_handoff=1#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end`);
      expect(tap.disposition).toBe('currentTab');
      expect(context.pages()).toHaveLength(1);
      await expect(page).toHaveURL(entry + '&_lp_handoff=1');
      // Repeated pending taps must not request extra launches or HTTPS fallback.
      await page.locator('#external-browser-open').dispatchEvent('click');
      expect(observe.intents()).toHaveLength(2);
      await page.clock.runFor(1900);
      await expect(page.locator('#external-browser-open')).not.toHaveAttribute('aria-disabled', 'true');
      expect(observe.errors).toEqual([]);
    });
  });
}

test('Escape, keyboard activation, lifecycle return and reload cannot bypass or loop', async ({ page, observe }) => {
  await arrival(page);
  await page.clock.runFor(1900);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('#external-browser-open')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => observe.intents().length).toBe(2);
  expect(observe.intents()[1].reason).toBe('anchorClick');
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
  await page.clock.runFor(2000);
  expect(observe.intents()).toHaveLength(2);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.clock.runFor(2000);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Open this page in your browser');
  expect(observe.intents()).toHaveLength(2);
});

test('unsupported intent URL retains its fragment and instructions without a launch or reload', async ({ page, observe }) => {
  await arrival(page, entry + '#links');
  await expect(page.getByRole('dialog')).toContainText('Open this page in your browser');
  await page.locator('#external-browser-open').tap();
  await page.clock.runFor(2000);
  expect(observe.intents()).toHaveLength(0);
  await expect(page).toHaveURL(entry + '&_lp_handoff=1#links');
  await expect(page.locator('#external-browser-open')).toHaveAttribute('href', entry + '&_lp_handoff=1#links');
});

test.describe('already in an external browser', () => {
  test.use({ userAgent: devices['Pixel 7'].userAgent });
  test('no handoff; primary age acknowledgment still precedes the exact destination', async ({ page, observe }) => {
    await page.goto(entry + '&_lp_handoff=1');
    await page.clock.runFor(2000);
    await expect(page.locator('#external-browser-dialog')).not.toBeVisible();
    expect(await page.locator('main').evaluate(e => e.inert)).toBe(false);
    await page.locator('[data-link-id="projects"]').tap();
    await expect(page.locator('#age-notice')).toBeVisible();
    await expect(page).toHaveURL(entry + '&_lp_handoff=1');
    await page.getByRole('button', { name: 'I am 18 or older' }).tap();
    await expect(page).toHaveURL(destination);
    expect(observe.intents()).toHaveLength(0);
  });
  test.describe('branded check', () => {
    test.use({ gate: true });
    test('starts verification normally after leaving the app', async ({ page, observe }) => {
      await page.goto(entry + '&_lp_handoff=1');
      await expect(page.getByRole('button', { name: 'Verify fixture' })).toBeVisible();
      await expect(page.locator('#external-browser-dialog')).not.toBeVisible();
      expect(observe.intents()).toHaveLength(0);
      expect(observe.errors).toEqual([]);
    });
  });
});

test.describe('all-scope age notice', () => {
  test.use({ ageScope: 'all' });
  test('same-page handoff precedes age acknowledgment without unlocking destinations', async ({ page, observe }) => {
    await arrival(page);
    await expect.poll(() => observe.intents().length).toBe(1);
    await page.clock.runFor(1900);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.locator('main').evaluate(e => e.inert)).toBe(true);
    expect(observe.requests).not.toContain(destination);
  });
});

test.describe('verification recovery', () => {
  test.use({ gate: true });
  test('failed POST offers only a manual launch of the original GET page', async ({ page, observe }) => {
    await arrival(page);
    await page.clock.runFor(1900);
    await Promise.all([
      page.waitForURL(origin + '/_verification/verify', { waitUntil: 'domcontentloaded' }),
      page.evaluate(() => {
        const form = document.getElementById('verification-form');
        form.elements.token.value = 'fixture-rejected-token';
        form.submit();
      }),
    ]);
    await page.clock.runFor(2000);
    await expect(page.getByRole('dialog')).toContainText('Open this page in your browser');
    expect(observe.intents()).toHaveLength(1);
    await page.locator('#external-browser-open').tap();
    await expect.poll(() => observe.intents().length).toBe(2);
    expect(observe.intents()[1].url).toContain('browser-flow.example/sample-creator/?source=ig&encoded=%20&plus=+&_lp_handoff=1#Intent;');
    expect(observe.intents()[1].url).not.toContain('/_verification/verify');
    expect(observe.requests.some(url => url.includes('challenges.cloudflare.com'))).toBe(false);
  });
  test('missing browser module leaves the security check usable', async ({ page, observe }) => {
    await page.route('**/external-browser-dialog.js', route => route.abort());
    await page.goto(entry);
    await expect(page.getByRole('button', { name: 'Verify fixture' })).toBeVisible();
    await expect(page.locator('#external-browser-dialog')).not.toBeVisible();
    expect(observe.intents()).toHaveLength(0);
  });
});

test.describe('Facebook Android', () => {
  test.use({ userAgent: `${devices['Pixel 7'].userAgent} [FBAN/FB4A;FBAV/500.0;]` });
  test('uses the same one-button flow', async ({ page, observe }) => {
    await arrival(page);
    await page.clock.runFor(1900);
    await expect(page.getByRole('dialog')).toContainText("Couldn't open in Chrome automatically.");
    expect(observe.intents()).toHaveLength(1);
  });
});

test.describe('iOS classification in Chromium (not an iOS launch test)', () => {
  test.use({ userAgent: `${devices['iPhone 13'].userAgent} Instagram 300.0.0` });
  test('uses browser wording and never tells an iPhone user that Chrome failed', async ({ page, observe }) => {
    await arrival(page);
    await page.clock.runFor(1900);
    await expect(page.getByRole('dialog')).toContainText("Couldn't open in your browser automatically.");
    await expect(page.getByRole('dialog')).not.toContainText('Chrome');
    await page.locator('#external-browser-open').tap();
    await expect.poll(() => observe.navigation.filter(e => e.url.startsWith('instagram://extbrowser/')).length).toBeGreaterThan(0);
    expect(observe.errors).toEqual([]);
  });
});

test('blocked storage still leaves a durable URL guard', async ({ page, observe }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw Error('Unavailable'); } }));
  await arrival(page);
  await page.clock.runFor(1900);
  expect(observe.intents()).toHaveLength(1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.clock.runFor(2000);
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(observe.intents()).toHaveLength(1);
});

test.describe('automatic attempt disabled', () => {
  test.use({ openingOverrides: { autoOpen: false } });
  test('neutral popup makes no false failure claim and the button works first time', async ({ page, observe }) => {
    await arrival(page);
    await expect(page.getByRole('dialog')).toContainText('Open this page in your browser');
    expect(observe.intents()).toHaveLength(0);
    await page.locator('#external-browser-open').tap();
    await expect.poll(() => observe.intents().length).toBe(1);
    expect(observe.intents()[0].reason).toBe('anchorClick');
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });
  test('retains the ordinary static links without showing a dead dialog', async ({ page, observe }) => {
    await page.goto(entry);
    await expect(page.locator('#external-browser-dialog')).not.toBeVisible();
    await page.locator('[data-link-id="projects"]').tap();
    await expect(page).toHaveURL(destination);
    expect(observe.intents()).toHaveLength(0);
  });
});
