import { test as base, expect, devices } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../scripts/build.mjs';

const origin = 'https://handoff.example';
const entry = `${origin}/example/?source=e2e&encoded=%20&plus=+`;
const moreSoon = `${origin}/example/more-soon/`;
const frozenTime = new Date('2026-01-01T00:00:00Z');

const test = base.extend({
  controlledClock: [true, { option: true }],
  neutralBuild: [async ({}, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'handoff-e2e-'));
    try {
      await build({ exampleBuild: true, env: {}, outDir: directory });
      const lines = (await readFile(path.join(directory, '_headers'), 'utf8')).split('\n');
      const headers = Object.fromEntries(lines.filter(line => /^  [A-Z]/.test(line)).map(line => {
        const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }));
      await use({ directory, headers });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, { scope: 'worker' }],
  observe: async ({ page, context, neutralBuild, controlledClock }, use, testInfo) => {
    const requested = [], documents = [], pageErrors = [], unexpectedNetwork = [], popups = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { unexpectedNetwork.push(url.origin); await route.abort(); return; }
      const file = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
      try {
        // These are the actual build bytes: no injected launch function,
        // altered options, script rewriting or mock navigation implementation.
        const body = await readFile(path.join(neutralBuild.directory, file));
        const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
        await route.fulfill({ body, headers: neutralBuild.headers, contentType: `${type}; charset=utf-8` });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', event => requested.push(event));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) documents.push(frame.url()); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('popup', popup => popups.push(popup.url()));
    await page.addInitScript(() => {
      window.__handoffEvents = []; window.__handoffTaps = [];
      window.addEventListener('profile:analytics', event => window.__handoffEvents.push(event.detail));
      document.addEventListener('click', event => {
        if (event.target.closest?.('a[data-opening-mode], #handoff-direct')) {
          window.__handoffTaps.push({ trusted: event.isTrusted, active: navigator.userActivation.isActive });
        }
      }, true);
    });
    // Freeze application timers before initialization. Native trusted input and
    // CDP navigation observation stay real; clock.runFor advances fallback timers.
    if (controlledClock) {
      await page.clock.install({ time: frozenTime });
      await page.clock.pauseAt(new Date(frozenTime.getTime() + 60_000));
    }
    const observation = {
      requested, documents, pageErrors, unexpectedNetwork, popups,
      intents: () => requested.filter(event => event.url.startsWith('intent://')),
    };
    try { await use(observation); }
    finally {
      await testInfo.attach('navigation-requests.json', {
        body: Buffer.from(JSON.stringify({
          scope: 'Chromium renderer requests; not Android/Instagram OS-launch confirmation',
          requested, documents, pageErrors, unexpectedNetwork, popups,
        }, null, 2)), contentType: 'application/json',
      });
      await cdp.detach();
      await context.unrouteAll({ behavior: 'wait' });
    }
  },
});

async function ready(page) {
  await expect.poll(() => page.evaluate(() => window.__handoffEvents.some(event => event.name === 'landing_view'))).toBe(true);
}

async function backToExample(page) {
  // A touch tap can resolve before its navigation commits. Wait for the new
  // document (including deferred modules) before evaluating its app state.
  // Reading the old document here caused all five round-trip cases to fail.
  await Promise.all([
    page.waitForURL(`${origin}/example/?_lp_handoff=1`, { waitUntil: 'domcontentloaded' }),
    page.getByRole('link', { name: 'Back to example' }).tap(),
  ]);
  await ready(page);
}

async function nativeTap(page, context, observe, controlledClock = true, activation = 'tap') {
  const count = observe.intents().length;
  const before = page.url();
  const cta = page.getByRole('link', { name: 'Explore my work' });
  if (activation === 'keyboard') { await cta.focus(); await page.keyboard.press('Enter'); }
  else await cta.tap();
  await expect.poll(() => observe.intents().length).toBe(count + 1);
  const navigation = observe.intents().at(-1);
  expect(navigation.reason).toBe('anchorClick');
  expect(navigation.url.split('#Intent;')[0]).toBe('intent://handoff.example/example/more-soon/');
  expect(navigation.url).toContain(';package=com.android.chrome;');
  expect(navigation.url).not.toContain('browser_fallback_url');
  expect(navigation.url).not.toContain('create_new_tab');
  expect(navigation.disposition).toBe('currentTab');
  expect(await page.evaluate(() => window.__handoffTaps.at(-1))).toEqual({ trusted: true, active: true });
  await expect(page).toHaveURL(before);
  // If the launch is unconfirmed, wait for the UI fallback without permitting
  // the test to auto-navigate or count a fake OS callback as success.
  if (controlledClock) await page.clock.runFor(1900);
  await expect(page.locator('#handoff-direct')).toBeVisible();
  await expect(page.locator('#handoff-direct')).toHaveAttribute('href', moreSoon);
  await expect(cta).toHaveAttribute('href', '/example/more-soon/');
  await expect(page).toHaveURL(before);
  expect(observe.intents()).toHaveLength(count + 1);
  expect(context.pages()).toHaveLength(1);
  expect(observe.popups).toEqual([]);
}

for (const phase of ['pending arrival', 'timed-out arrival', 'stale pagehide', 'blocked storage']) {
  test(`first tap and More soon/Back round trip: ${phase}`, async ({ page, context, observe }) => {
    if (phase === 'blocked storage') {
      await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw Error('Storage unavailable'); } }));
    }
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.clock.runFor(32);
    await expect.poll(() => observe.intents().length).toBe(1);
    await expect(page).toHaveURL(`${entry}&_lp_handoff=1`);
    expect(observe.intents()[0].url.split('#Intent;')[0]).toBe(`intent://${page.url().slice(8)}`);
    if (phase === 'timed-out arrival') {
      await page.clock.runFor(1900);
      expect(await page.evaluate(() => window.__handoffEvents.some(event => event.name === 'handoff_unconfirmed'))).toBe(true);
    } else {
      expect(await page.evaluate(() => window.__handoffEvents.some(event => event.name === 'handoff_unconfirmed'))).toBe(false);
    }
    if (phase === 'stale pagehide') {
      // Deliberately simulate the lifecycle ordering that reproduced the bug.
      // This does not claim that Instagram produces this ordering on a device.
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
      expect(await page.evaluate(() => window.__handoffEvents.at(-1).name)).toBe('handoff_page_hidden');
    }
    await nativeTap(page, context, observe);
    expect(observe.documents).not.toContain(moreSoon);
    await expect(page.locator('#browser-open')).toHaveCount(0);

    await page.locator('#handoff-direct').tap();
    await expect(page).toHaveURL(moreSoon);
    await expect(page.getByRole('heading', { name: 'More soon' })).toBeVisible();
    const beforeReturn = observe.intents().length;
    await backToExample(page);
    await page.clock.runFor(2000);
    await expect(page).toHaveURL(`${origin}/example/?_lp_handoff=1`);
    expect(observe.intents()).toHaveLength(beforeReturn);
    await nativeTap(page, context, observe);
    expect(observe.pageErrors).toEqual([]);
    expect(observe.unexpectedNetwork).toEqual([]);
  });
}

test.describe('ordinary Android Chrome', () => {
  test.use({ userAgent: devices['Pixel 7'].userAgent });
  test('both first and returning taps follow the real link without an intent', async ({ page, context, observe }) => {
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await ready(page); await page.clock.runFor(32);
    for (let i = 0; i < 2; i++) {
      await page.getByRole('link', { name: 'Explore my work' }).tap();
      await expect(page).toHaveURL(moreSoon);
      await expect(page.getByRole('heading', { name: 'More soon' })).toBeVisible();
      if (i === 0) {
        await backToExample(page);
        await page.clock.runFor(32);
      }
    }
    expect(observe.intents()).toEqual([]);
    expect(observe.pageErrors).toEqual([]);
    expect(context.pages()).toHaveLength(1);
  });
});

test('keyboard activation uses the same default intent-link action', async ({ page, context, observe }) => {
  await page.goto(`${entry}&_lp_handoff=1`, { waitUntil: 'domcontentloaded' });
  await ready(page); await page.clock.runFor(32);
  await nativeTap(page, context, observe, true, 'keyboard');
  expect(observe.intents()).toHaveLength(1);
});

test('a missing entry script preserves the usable HTTPS link', async ({ page, observe }) => {
  await page.route('**/assets/*/app.js', route => route.abort());
  await page.goto(entry, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Explore my work' }).tap();
  await expect(page).toHaveURL(moreSoon);
  await expect(page.getByRole('heading', { name: 'More soon' })).toBeVisible();
  expect(observe.intents()).toEqual([]);
});

test.describe('real-clock loading and paint', () => {
  // Playwright's fake Performance implementation has no real paint entries.
  test.use({ controlledClock: false });

  for (const script of ['app.js', 'browser-opening.js']) {
    test(`cold load waits for ${script} before painting an interactive CTA`, async ({ page, context, observe }) => {
      let release, requested;
      const pending = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { requested = resolve; });
      await page.route(`**/assets/*/${script}`, async route => {
        requested();
        await pending;
        await route.fallback();
      });
      try {
        await page.goto(entry, { waitUntil: 'commit' });
        await started;
        // DOM layout is not evidence that pixels have been presented. Observe
        // real paint entries while this first-load module request is held open.
        await expect(page.getByRole('link', { name: 'Explore my work' })).toHaveCount(1);
        await page.waitForTimeout(250);
        expect(await page.evaluate(() => performance.getEntriesByType('paint'))).toEqual([]);
        release();
        await page.waitForLoadState('domcontentloaded');
        await expect.poll(() => page.evaluate(() => performance.getEntriesByType('paint').some(e => e.name === 'first-contentful-paint'))).toBe(true);
        // No ready() prerequisite: the first visible CTA must already be wired.
        await nativeTap(page, context, observe, false);
        expect(observe.documents).not.toContain(moreSoon);
        expect(observe.pageErrors).toEqual([]);
      } finally { release(); }
    });
  }

  test('a failed dependency releases rendering and preserves direct navigation', async ({ page, observe }) => {
    await page.route('**/assets/*/browser-opening.js', route => route.abort());
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('paint').some(e => e.name === 'first-contentful-paint'))).toBe(true);
    await page.getByRole('link', { name: 'Explore my work' }).tap();
    await expect(page).toHaveURL(moreSoon);
    expect(observe.intents()).toEqual([]);
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false, controlledClock: false });
  test('render blocking does not hide the static page or its links', async ({ page, observe }) => {
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('paint').some(e => e.name === 'first-contentful-paint'))).toBe(true);
    await page.getByRole('link', { name: 'Explore my work' }).tap();
    await expect(page).toHaveURL(moreSoon);
    expect(observe.intents()).toEqual([]);
  });
});
