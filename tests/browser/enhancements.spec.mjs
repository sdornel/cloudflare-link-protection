import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../scripts/build.mjs';

const origin = 'https://profile.example';
const destination = 'https://example.com/projects?a=1&a=2&encoded=%20#latest';

// Serve a real synthetic build, including its CSP. Only the OS launch boundary
// is replaced: the production app initializes and handles every click itself.
async function fixture(page, { platform = 'ios', failLaunch = false, blockedStorage = false, autoOpen = false, age = false, analytics = false, mode = 'native', profilePath = '/' } = {}) {
  const config = JSON.parse(await readFile(new URL('../../config/site.example.json', import.meta.url), 'utf8'));
  config.siteUrl = origin;
  config.profilePath = profilePath;
  config.primaryLink.url = destination;
  config.browserOpening = { ...config.browserOpening, mode, autoOpen, fallbackDelayMs: 800 };
  config.ageAcknowledgment.enabled = age;
  if (analytics) config.analytics.ga4MeasurementId = 'G-TEST1234';
  const directory = await mkdtemp(path.join(tmpdir(), 'profile-browser-'));
  try {
    await build({ config, outDir: directory });
    const headerText = await readFile(path.join(directory, '_headers'), 'utf8');
    const headers = Object.fromEntries(headerText.split('\n').filter(line => /^  [A-Z]/.test(line) && !line.includes('Cache-Control')).map(line => {
      const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }));
    await page.route(`${origin}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      const file = pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
      let body = await readFile(path.join(directory, file));
      if (file.endsWith('/handoff-controller.js')) {
        const source = body.toString();
        const boundary = 'const defaultLaunch = (plan, trigger) => {';
        expect(source).toContain(boundary);
        body = Buffer.from(source.replace(boundary, `${boundary}
          win.__launches.push({ ...plan, trigger });
          if (win.__failLaunch) throw new Error('Simulated OS rejection');
          return () => {};
        `));
      }
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] ?? 'text/plain';
      await route.fulfill({ body, headers, contentType: `${type}; charset=utf-8` });
    });
    await page.addInitScript(({ platform, failLaunch, blockedStorage }) => {
      Object.defineProperty(navigator, 'userAgent', { value: platform === 'ios' ? 'Mozilla/5.0 (iPhone) Instagram 300' : 'Mozilla/5.0 (Linux; Android 14) Instagram 300' });
      Object.defineProperty(navigator, 'platform', { value: platform === 'ios' ? 'iPhone' : 'Linux armv8' });
      window.__launches = []; window.__events = []; window.__failLaunch = failLaunch;
      window.addEventListener('profile:analytics', event => window.__events.push(event.detail));
      if (blockedStorage) Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked'); } });
    }, { platform, failLaunch, blockedStorage });
    await page.goto(`${origin}${profilePath === '/' ? '/' : `${profilePath}/`}?source=test#links`);
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    return async () => { await page.unrouteAll({ behavior: 'wait' }); await rm(directory, { recursive: true, force: true }); };
  } catch (error) {
    await page.unrouteAll({ behavior: 'wait' });
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

test('CTA launch error offers the exact direct link and explicit retry/dismiss', async ({ page }) => {
  const cleanup = await fixture(page, { failLaunch: true });
  try {
    const cta = page.getByRole('link', { name: 'Explore my work' });
    await cta.click();
    await expect(page.locator('#handoff-panel')).toBeVisible();
    await expect(page.locator('#handoff-direct')).toHaveAttribute('href', destination);
    await expect(cta).toHaveAttribute('href', destination);
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    await page.locator('#handoff-retry').click();
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(2);
    await page.locator('#handoff-dismiss').click();
    await expect(page.locator('#handoff-panel')).toBeHidden();
    await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct destination</h1>' }));
    await cta.click();
    await page.locator('#handoff-direct').click();
    await expect(page).toHaveURL(destination);
  } finally { await cleanup(); }
});

test('age confirmation resumes the intended CTA once with storage blocked', async ({ page }) => {
  const cleanup = await fixture(page, { age: true, autoOpen: true, blockedStorage: true });
  try {
    await expect(page.locator('#age-accept')).toBeVisible();
    await page.getByRole('link', { name: 'Explore my work' }).click();
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    await expect(page.locator('#age-accept')).toBeFocused();
    await page.locator('#age-accept').click();
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    expect(await page.evaluate(() => window.__launches[0].target)).toBe(destination);
    await expect(page.locator('#age-accept')).toBeHidden();
  } finally { await cleanup(); }
});

test('automatic iOS opening writes a URL guard and cannot repeat after reload', async ({ page }) => {
  const cleanup = await fixture(page, { autoOpen: true, blockedStorage: true });
  try {
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    await expect(page).toHaveURL(`${origin}/?source=test&_lp_handoff=1#links`);
    expect(await page.evaluate(() => window.__launches[0].target)).toBe(page.url());
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    await page.locator('#browser-open').click();
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
  } finally { await cleanup(); }
});

test('nested profile loads its own assets and preserves the page path through automatic handoff and reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const cleanup = await fixture(page, { profilePath: '/sample-creator', autoOpen: true, blockedStorage: true });
  try {
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    await expect(page).toHaveURL(`${origin}/sample-creator/?source=test&_lp_handoff=1#links`);
    expect(await page.evaluate(() => window.__launches[0].target)).toBe(page.url());
    expect(await page.evaluate(() => [...document.styleSheets].some(sheet => sheet.href?.includes('/sample-creator/styles.css')))).toBe(true);
    await expect(page.getByRole('link', { name: 'Explore my work' })).toHaveAttribute('href', destination);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    expect(errors).toEqual([]);
  } finally { await cleanup(); }
});

test('Android automatic opening defers to a manual gesture', async ({ page }) => {
  const cleanup = await fixture(page, { platform: 'android', autoOpen: true });
  try {
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'handoff_deferred'))).toBe(true);
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    // A fragment cannot be represented safely in an intent: show instructions.
    await page.locator('#browser-open').click();
    await expect(page.locator('#handoff-panel')).toBeVisible();
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    await page.evaluate(() => history.replaceState(null, '', '/?source=test'));
    await page.locator('#browser-open').click();
    await expect.poll(() => page.evaluate(() => window.__launches[0]?.strategy)).toBe('android-intent');
  } finally { await cleanup(); }
});

test('return lifecycle shows assistance without repeating the CTA launch', async ({ page }) => {
  const cleanup = await fixture(page);
  try {
    await page.getByRole('link', { name: 'Explore my work' }).click();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('#handoff-retry')).toBeVisible();
    expect(await page.evaluate(() => window.__launches.length)).toBe(1);
    expect(await page.evaluate(() => window.__events.filter(event => event.name === 'handoff_returned').length)).toBe(1);
    await expect(page.locator('#handoff-direct')).toHaveAttribute('href', destination);
  } finally { await cleanup(); }
});

test('analytics controls make no pre-consent request and count one view after re-consent', async ({ page }) => {
  let requests = 0;
  await page.route('https://www.googletagmanager.com/**', route => {
    requests++;
    return route.fulfill({ contentType: 'text/javascript', body: '/* Local provider fixture; no collection. */' });
  });
  const cleanup = await fixture(page, { analytics: true, mode: 'direct' });
  try {
    expect(requests).toBe(0);
    await page.locator('#analytics-decline').click();
    expect(requests).toBe(0);
    await page.locator('#analytics-allow').click();
    const views = () => page.evaluate(() => (window.dataLayer ?? []).filter(command => command[0] === 'event' && command[1] === 'page_view').length);
    await expect.poll(views).toBe(1);
    await page.locator('#analytics-decline').click();
    await page.locator('#analytics-allow').click();
    expect(await views()).toBe(1);
    expect(requests).toBe(1);
    expect(await page.evaluate(() => JSON.stringify(window.dataLayer))).not.toContain('source=test');
  } finally { await cleanup(); }
});
