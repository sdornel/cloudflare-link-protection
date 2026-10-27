import { test, expect } from '@playwright/test';

test('neutral page has real links, usable small-screen layout and no browser controls in ordinary browsers', async ({ page, browserName }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your name', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore my work' })).toHaveAttribute('href', 'https://example.com/projects');
  await expect(page.locator('#browser-open')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Safari's default keyboard policy uses Option+Tab to include links.
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  await expect(page.getByRole('link', { name: 'Skip to links' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('links work with scripts blocked and with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Destination reached</h1>' }));
  await page.getByRole('link', { name: 'Explore my work' }).click();
  await expect(page.getByRole('heading')).toHaveText('Destination reached');
  await context.close();
});

test('client module failure leaves the direct destination accessible', async ({ page }) => {
  await page.route('**/assets/**', route => route.abort());
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Direct fallback</h1>' }));
  await page.goto('/'); await page.getByRole('link', { name: 'Explore my work' }).click();
  await expect(page.getByRole('heading')).toHaveText('Direct fallback');
});

test('a missing route returns a real 404', async ({ page }) => {
  const response = await page.goto('/missing'); expect(response.status()).toBe(404);
  await expect(page.getByRole('heading')).toHaveText('Page not found');
});
