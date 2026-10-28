import { test, expect } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
  test(`landing introduces the site and links to the demo with JavaScript ${javaScriptEnabled ? 'enabled' : 'disabled'}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 320, height: 740 } });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:4173/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your world, one tap away.');
      await expect(page.getByRole('heading', { name: 'Your name', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('link', { name: 'View an example' }).click();
      await expect(page).toHaveURL('http://127.0.0.1:4173/example/');
      await expect(page.getByRole('heading', { name: 'Your name', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Explore my work' })).toHaveAttribute('href', '/example/more-soon/');
      for (const label of ['Explore my work', 'Read my notes', 'Get in touch']) {
        await page.getByRole('link', { name: label }).click();
        await expect(page).toHaveURL('http://127.0.0.1:4173/example/more-soon/');
        await expect(page.getByRole('heading')).toHaveText('More soon');
        await page.getByRole('link', { name: 'Back to example' }).click();
        await expect(page).toHaveURL('http://127.0.0.1:4173/example/');
      }
    } finally { await context.close(); }
  });
}

test('neutral page has real links, usable small-screen layout and no browser controls in ordinary browsers', async ({ page, browserName }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/example/');
  await expect(page.getByRole('heading', { name: 'Your name', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore my work' })).toHaveAttribute('href', '/example/more-soon/');
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
  await page.goto('http://127.0.0.1:4173/example/');
  await page.getByRole('link', { name: 'Explore my work' }).click();
  await expect(page.getByRole('heading')).toHaveText('More soon');
  await context.close();
});

test('client module failure leaves the direct destination accessible', async ({ page }) => {
  await page.route('**/assets/**', route => route.abort());
  await page.goto('/example/'); await page.getByRole('link', { name: 'Explore my work' }).click();
  await expect(page.getByRole('heading')).toHaveText('More soon');
});

test('a missing route returns a real 404', async ({ page }) => {
  const response = await page.goto('/missing'); expect(response.status()).toBe(404);
  await expect(page.getByRole('heading')).toHaveText('Page not found');
});
