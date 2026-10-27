import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { neutralPreview } from './browser-fixture.mjs';

// No URL or private-build input: screenshots can only use the neutral renderer.
const preview = await neutralPreview();
let browser;
try {
  browser = await chromium.launch();
  await mkdir('docs/images', { recursive: true });
  for (const [name, width, height] of [['demo-mobile', 390, 844], ['demo-desktop', 1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await page.goto(preview.url);
    await page.screenshot({ path: `docs/images/${name}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser?.close(); await preview.close(); }
console.log('Captured neutral mobile and desktop browser screenshots in docs/images/.');
