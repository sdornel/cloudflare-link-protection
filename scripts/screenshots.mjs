import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { exampleHTML } from './example.mjs';

// No URL or private-build input: screenshots can only use the neutral renderer.
const browser = await chromium.launch();
try {
  await mkdir('docs/images', { recursive: true });
  const html = await exampleHTML();
  for (const [name, width, height] of [['demo-mobile', 390, 844], ['demo-desktop', 1280, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await page.setContent(html);
    await page.screenshot({ path: `docs/images/${name}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
console.log('Captured neutral mobile and desktop browser screenshots in docs/images/.');
