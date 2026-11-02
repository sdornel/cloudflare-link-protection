import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The spec serves an isolated neutral build through HTTPS request routing.
// No preview server or local/private deployment build is needed for this suite.
export default defineConfig({
  testDir: '.',
  testMatch: ['handoff.spec.mjs', 'external-browser.spec.mjs'],
  outputDir: fileURLToPath(new URL('../../test-results/handoff/', import.meta.url)),
  workers: 1,
  retries: 0,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { outputFolder: fileURLToPath(new URL('../../playwright-report/handoff/', import.meta.url)), open: 'never' }]],
  projects: [{
    name: 'chromium-android-handoff',
    use: {
      ...devices['Pixel 7'],
      browserName: 'chromium',
      userAgent: `${devices['Pixel 7'].userAgent} Instagram 300.0.0`,
      reducedMotion: 'reduce',
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      serviceWorkers: 'block',
    },
  }],
});
