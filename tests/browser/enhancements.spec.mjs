import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../scripts/build.mjs';

const origin = 'https://profile.example';
const destination = 'https://example.com/projects?a=1&a=2&encoded=%20#latest';

// Serve a real synthetic build, including its CSP. Only the OS launch boundary
// is replaced: the production app initializes and handles every click itself.
async function fixture(page, { platform = 'ios', failLaunch = false, blockedStorage = false, autoOpen = false, showManual = true, age = false, ageScope = 'all', analytics = false, mode = 'native', profilePath = '/', hostedExample = false } = {}) {
  const config = JSON.parse(await readFile(new URL('../../config/site.example.json', import.meta.url), 'utf8'));
  config.siteUrl = origin;
  config.profilePath = profilePath;
  config.primaryLink.url = destination;
  config.browserOpening = { ...config.browserOpening, mode, autoOpen, showManual, fallbackDelayMs: 800 };
  config.ageAcknowledgment.enabled = age;
  config.ageAcknowledgment.scope = ageScope;
  if (analytics) config.analytics.ga4MeasurementId = 'G-TEST1234';
  const directory = await mkdtemp(path.join(tmpdir(), 'profile-browser-'));
  try {
    // Exercise the checked-in sample unchanged when testing the hosted example.
    await build(hostedExample ? { exampleBuild: true, env: {}, outDir: directory } : { config, outDir: directory });
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
    await page.goto(`${origin}${hostedExample ? '/example/' : profilePath === '/' ? '/' : `${profilePath}/`}?source=test#links`);
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    return async () => { await page.unrouteAll({ behavior: 'wait' }); await rm(directory, { recursive: true, force: true }); };
  } catch (error) {
    await page.unrouteAll({ behavior: 'wait' });
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

for (const platform of ['ios', 'android']) {
  test(`hosted example uses automatic-only handoff and neutral CTA fallback on ${platform}`, async ({ page }) => {
    const cleanup = await fixture(page, { hostedExample: true, platform, failLaunch: true });
    try {
      await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(platform === 'ios' ? 1 : 0);
      await expect(page.locator('#browser-open')).toHaveCount(0);
      await expect(page.locator('#age-notice')).toHaveCount(0);
      await expect(page.locator('#handoff-panel')).toBeHidden();
      if (platform === 'ios') {
        await expect(page).toHaveURL(`${origin}/example/?source=test&_lp_handoff=1#links`);
        expect(await page.evaluate(() => window.__launches[0])).toMatchObject({ target: page.url(), trigger: 'automatic' });
        await page.reload();
        await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
        expect(await page.evaluate(() => window.__launches.length)).toBe(0);
      } else {
        await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'handoff_deferred'))).toBe(true);
      }
      for (const [index, label] of ['Explore my work', 'Read my notes', 'Get in touch'].entries()) {
        const cta = page.getByRole('link', { name: label });
        await expect(cta).toHaveAttribute('href', '/example/more-soon/');
        await cta.click();
        await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(index + 1);
        expect(await page.evaluate(() => window.__launches.at(-1))).toMatchObject({
          target: `${origin}/example/more-soon/`, fallback: `${origin}/example/more-soon/`,
          strategy: platform === 'ios' ? 'ios-instagram' : 'android-intent', trigger: 'cta',
        });
        await expect(page.locator('#handoff-direct')).toBeVisible();
        await expect(page.locator('#handoff-direct')).toHaveAttribute('href', `${origin}/example/more-soon/`);
        await expect(page.locator('#handoff-retry')).toBeHidden();
        await expect(page.locator('#handoff-instructions')).toBeHidden();
      }
      await page.locator('#handoff-direct').click();
      await expect(page).toHaveURL(`${origin}/example/more-soon/`);
      await expect(page.getByRole('heading', { name: 'More soon' })).toBeVisible();
    } finally { await cleanup(); }
  });
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

test('primary age dialog cancels accessibly and remembers confirmation across reload in the same tab', async ({ page }) => {
  const cleanup = await fixture(page, { age: true, ageScope: 'primary', profilePath: '/sample-creator' });
  try {
    const cta = page.getByRole('link', { name: 'Explore my work' });
    const dialog = page.getByRole('dialog', { name: '18+ only' });
    await expect(dialog).toBeHidden();
    await cta.click();
    await expect(dialog).toBeVisible();
    await expect(page.locator('#age-accept')).toBeFocused();
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    await page.keyboard.press('Tab');
    await expect(page.locator('#age-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(cta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.locator('#age-cancel').click();
    await expect(cta).toBeFocused();
    await cta.click();
    await page.locator('#age-accept').click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__launches.map(launch => launch.target))).toEqual([destination]);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    await cta.click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__launches.map(launch => launch.target))).toEqual([destination]);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    await cta.click();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
  } finally { await cleanup(); }
});

test('primary age prompt preserves direct navigation and leaves secondary links available', async ({ page }) => {
  const cleanup = await fixture(page, { age: true, ageScope: 'primary', mode: 'direct' });
  try {
    await page.getByRole('link', { name: 'Read my notes' }).click();
    await expect(page).toHaveURL(`${origin}/example/more-soon/`);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Selected destination</h1>' }));
    await page.getByRole('link', { name: 'Explore my work' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#age-accept').click();
    await expect(page).toHaveURL(destination);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    await page.getByRole('link', { name: 'Explore my work' }).click();
    await expect(page).toHaveURL(destination);
  } finally { await cleanup(); }
});

test('primary age scope permits automatic same-page handoff before the CTA prompt', async ({ page }) => {
  const cleanup = await fixture(page, { age: true, ageScope: 'primary', autoOpen: true });
  try {
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('link', { name: 'Explore my work' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => window.__launches.length)).toBe(1);
    await page.locator('#age-accept').click();
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(2);
    expect(await page.evaluate(() => window.__launches[1].target)).toBe(destination);
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

test('automatic-only opening has no browser offers while an unsuccessful CTA retains its direct fallback', async ({ page }) => {
  const cleanup = await fixture(page, { autoOpen: true, showManual: false, failLaunch: true });
  try {
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(1);
    await expect(page.locator('#browser-open')).toHaveCount(0);
    await expect(page.locator('#handoff-panel')).toBeHidden();
    await page.getByRole('link', { name: 'Explore my work' }).click();
    await expect.poll(() => page.evaluate(() => window.__launches.length)).toBe(2);
    await expect(page.locator('#handoff-direct')).toBeVisible();
    await expect(page.locator('#handoff-direct')).toHaveAttribute('href', destination);
    await expect(page.locator('#handoff-retry')).toBeHidden();
    await expect(page.locator('#handoff-instructions')).toBeHidden();
    await expect(page.locator('#handoff-status')).toBeEmpty();
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__events.some(event => event.name === 'landing_view'))).toBe(true);
    expect(await page.evaluate(() => window.__launches.length)).toBe(0);
    await expect(page.locator('#handoff-panel')).toBeHidden();
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
