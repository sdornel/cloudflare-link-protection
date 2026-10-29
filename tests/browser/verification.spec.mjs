import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../../scripts/build.mjs';
import { createWorker } from '../../src/worker/index.js';

// Real gate/client/Worker code with a deliberately synthetic provider. These
// tests establish our browser wiring, not Cloudflare's real bot classification.
const origin = 'https://profile.example';
async function setup(page) {
  const directory = await mkdtemp(path.join(tmpdir(), 'verification-browser-'));
  const config = JSON.parse(await readFile(new URL('../../config/site.example.json', import.meta.url), 'utf8'));
  Object.assign(config, { siteUrl: origin, profilePath: '/sample-creator', verification: { enabled: true } });
  await build({ config, outDir: directory });
  const env = {
    TURNSTILE_SITE_KEY: 'browser-fixture-public-key', TURNSTILE_SECRET_KEY: 'browser-fixture-private-key',
    VERIFICATION_SESSION_SECRET: 'synthetic-browser-test-signing-secret-not-for-deployment',
    ASSETS: { async fetch(request) {
      try {
        let filename = path.join(directory, new URL(request.url).pathname);
        if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
        const type = filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.svg') ? 'image/svg+xml' : filename.endsWith('.json') ? 'application/json' : 'text/html';
        return new Response(await readFile(filename), { headers: { 'Content-Type': type } });
      } catch { return new Response('Not found', { status: 404 }); }
    } },
  };
  const used = new Set();
  const worker = createWorker({ async fetchVerification(_url, options) {
    const token = JSON.parse(options.body).response;
    const duplicate = used.has(token);
    used.add(token);
    return Response.json({ success: !duplicate, hostname: 'profile.example', action: 'profile_verification', cdata: token.replace('fixture.', '') });
  } });
  await page.route(`${origin}/**`, async route => {
    const req = route.request();
    const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers: await req.allHeaders(), body: req.postDataBuffer() }), env);
    const headers = Object.fromEntries(response.headers);
    if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie().join('\n');
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({
    contentType: 'text/javascript', body: `window.turnstile = { render(selector, options) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'quiet-button'; button.textContent = 'Complete test check';
      button.style.minWidth = options.size === 'compact' ? '150px' : '300px';
      button.onclick = () => options.callback('fixture.' + options.cData);
      document.querySelector(selector).append(button); return 'test-widget';
    }}; window.profileTurnstileReady();`,
  }));
  return async () => { await page.unrouteAll({ behavior: 'wait' }); await rm(directory, { recursive: true, force: true }); };
}

test('branded verification protects direct HTML, preserves the original address and reuses a secure session', async ({ page }) => {
  const close = await setup(page);
  try {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(origin + '/sample-creator/?utm_source=ig&x=a%2Bb#links');
    await expect(page.getByRole('heading', { name: 'A quick check before continuing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete test check' })).toBeVisible();
    await expect(page.locator('[data-link-id]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Complete test check' }).click();
    await expect(page.locator('[data-link-id="projects"]')).toBeVisible();
    await expect(page).toHaveURL(origin + '/sample-creator/?utm_source=ig&x=a%2Bb#links');
    const cookies = await page.context().cookies();
    expect(cookies.find(cookie => cookie.name === '__Host-profile-session')).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });
    await page.reload();
    await expect(page.locator('#verification-form')).toHaveCount(0);
    await page.context().clearCookies();
    await page.goto(origin + '/sample-creator/index.html');
    await expect(page.locator('#verification-form')).toBeVisible();
    await expect(page.locator('[data-link-id]')).toHaveCount(0);
  } finally { await close(); }
});

test('blocked verification script offers a retry while keeping profile links unavailable', async ({ page }) => {
  const close = await setup(page);
  try {
    await page.route('https://challenges.cloudflare.com/**', route => route.abort());
    await page.goto(origin + '/sample-creator/');
    await expect(page.getByRole('status')).toContainText('temporarily unavailable');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.locator('[data-link-id]')).toHaveCount(0);
  } finally { await close(); }
});

test('without JavaScript the gate explains the requirement and does not reveal links', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const close = await setup(page);
  try {
    await page.goto(origin + '/sample-creator/');
    await expect(page.locator('noscript')).toContainText('needs JavaScript');
    await expect(page.locator('[data-link-id]')).toHaveCount(0);
  } finally { await close(); await context.close(); }
});
