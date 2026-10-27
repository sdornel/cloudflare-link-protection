import { chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { neutralPreview } from './browser-fixture.mjs';

const preview = await neutralPreview();
let browser;
try {
  browser = await chromium.launch();
  const files = (await readdir(preview.directory, { recursive: true })).filter(file => /\.(html|css|js)$/.test(file));
  let compressedBytes = 0;
  for (const file of files) compressedBytes += gzipSync(await readFile(path.join(preview.directory, file))).length;
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__metrics = { lcpMs: 0, cls: 0 };
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__metrics.lcpMs = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      let start = 0, last = 0, value = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (entry.startTime - last > 1000 || entry.startTime - start > 5000) { start = entry.startTime; value = 0; }
          last = entry.startTime; value += entry.value;
          window.__metrics.cls = Math.max(window.__metrics.cls, value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(preview.url, { waitUntil: 'load' });
    // Observe the default entry animation and any late layout changes.
    await page.waitForTimeout(3000);
    runs.push(await page.evaluate(() => ({ ...window.__metrics, visibility: document.visibilityState, paints: performance.getEntriesByType('paint').map(({ name, startTime }) => ({ name, startTime })) })));
    await context.close();
  }
  const medianLcpMs = [...runs].map(run => run.lcpMs).sort((a, b) => a - b)[2];
  const maximumCls = Math.max(...runs.map(run => run.cls));
  const result = {
    measuredAt: new Date().toISOString(), browser: browser.version(), node: process.version,
    host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model },
    profile: { viewport: '390x844', cpuSlowdown: 4, latencyMs: 150, downloadMbps: 1.6, uploadMbps: 0.75, cache: 'disabled; fresh context each run', responseEncoding: 'uncompressed local HTTP', observationAfterLoadMs: 3000 },
    compressedBytes, runs, medianLcpMs, maximumCls,
    passed: compressedBytes < 50_000 && runs.every(run => run.lcpMs > 0) && medianLcpMs <= 2500 && maximumCls <= 0.1,
  };
  await mkdir('browser-output', { recursive: true });
  await writeFile('browser-output/performance.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { await browser?.close(); await preview.close(); }
