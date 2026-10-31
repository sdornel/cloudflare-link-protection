import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlTarget } from './crawl-check.mjs';
import { root } from './config.mjs';

export const LIMITS = Object.freeze({ requests: 60, navigations: 6, observationMs: 20000 });
const CHALLENGES = 'https://challenges.cloudflare.com';
const displayURL = url => url.origin + url.pathname;

export function browserLaunchError(error, channel = 'bundled') {
  const message = typeof error?.message === 'string' ? error.message : '';
  const library = message.match(/error while loading shared libraries:\s*([a-zA-Z0-9_.+-]+):/)?.[1];
  if (library || /Host system is missing dependencies|Missing libraries:/i.test(message)) {
    return `Chromium is installed, but required Linux system libraries are missing${library ? ` (${library})` : ''}. Run: npx playwright install-deps chromium (may request sudo), then rerun the browser check.`;
  }
  if (/Executable doesn't exist|distribution.*not found/i.test(message)) {
    if (['chrome', 'msedge'].includes(channel)) return `The selected ${channel} browser is not installed or was not found. Install it normally or use --channel chromium for Playwright's bundled full browser.`;
    return 'The Chromium executable is missing. Run: npx playwright install chromium, then rerun the browser check.';
  }
  if (/Missing X server|without having a XServer|cannot open display/i.test(message)) {
    return 'Headed Chromium needs a graphical display. Rerun without --headed, or use a terminal with a working graphical display.';
  }
  // Launch happens before any page navigation. Keep a bounded first-line
  // diagnostic instead of replacing every possible failure with reinstall advice.
  const summary = message.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/).find(line => line.trim())?.slice(0, 300);
  return `Chromium could not start${summary ? `: ${summary}` : '.'} For detailed startup logs, run: DEBUG=pw:browser npm run check:crawl:browser`;
}

export function browserOptions(args) {
  const remaining = [...args];
  const headed = remaining.indexOf('--headed');
  if (headed !== -1) remaining.splice(headed, 1);
  const channelAt = remaining.indexOf('--channel');
  const channel = channelAt < 0 ? 'bundled' : remaining[channelAt + 1];
  if (!['bundled', 'chromium', 'chrome', 'msedge'].includes(channel)) throw new Error('Choose --channel bundled, chromium, chrome, or msedge.');
  if (channelAt >= 0) remaining.splice(channelAt, 2);
  if (remaining.length && (remaining.length !== 2 || remaining[0] !== '--url')) {
    throw new Error('Use --headed, --channel bundled|chromium|chrome|msedge, and/or --url followed by one HTTPS URL.');
  }
  return { headed: headed !== -1, channel, targetArgs: remaining };
}

// Applies before sending routed requests. Redirect hops also need observation:
// Playwright does not invoke route handlers for every HTTP redirect.
export function requestPolicy(value, origin, { main = false, method = 'GET', popup = false } = {}) {
  let url;
  try { url = new URL(value); } catch { return 'invalid_url'; }
  if (popup) return 'popup';
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 'invalid_url';
  const own = url.origin === origin;
  if (!own && (main || url.origin !== CHALLENGES)) return 'external';
  if (['GET', 'HEAD'].includes(method)) return null;
  if (method === 'POST' && ((!own && !main) || (own && (
    url.pathname === '/_verification/verify' || url.pathname.startsWith('/cdn-cgi/challenge-platform/')
  )))) return null;
  return 'method';
}

// Executed inside the page. Return counts/states only, never content or hrefs.
export function inspectDocument() {
  const links = [...document.querySelectorAll('a[data-link-id]')];
  const rendered = element => {
    if (!element.getClientRects().length) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const form = document.getElementById('verification-form');
  const states = ['loading', 'ready', 'verifying', 'expired', 'error', 'unavailable', 'submitting'];
  // The client updates its translated status text, not data-state. Match the
  // page's own message templates without copying any text into the report.
  const status = document.getElementById('verification-status')?.textContent;
  const visibleState = status && states.find(state => document.querySelector(`[data-message="${state}"]`)?.textContent === status);
  return {
    gate: Boolean(form),
    gateState: form ? (visibleState || (states.includes(form.dataset.state) ? form.dataset.state : 'unknown')) : null,
    profileLinks: links.length,
    renderedProfileLinks: links.filter(rendered).length,
    outboundAnchors: [...document.querySelectorAll('a[href]')].filter(anchor => {
      try { const url = new URL(anchor.href); return ['http:', 'https:'].includes(url.protocol) && url.origin !== location.origin; }
      catch { return false; }
    }).length,
  };
}

export function browserOutcome({ stopReason, dom, navigations }) {
  if (stopReason) return stopReason;
  // A crawler can extract hidden anchors too, irrespective of HTTP status.
  if (dom?.profileLinks > 0) return 'profile_links_exposed';
  const last = navigations.at(-1);
  if (last?.challenge) return 'cloudflare_challenge';
  if (dom?.gate && (dom.gateState === 'unavailable' || last?.status >= 500)) return 'verification_unavailable';
  if (last?.status >= 500) return 'server_error';
  if ([401, 403].includes(last?.status)) return 'blocked';
  if (last?.status >= 400) return 'http_error';
  if (dom?.gate) return 'verification_gate';
  return 'inconclusive';
}

export function navigationEntry(value, origin, status, headers, method) {
  const url = new URL(value);
  const entry = {
    url: url.origin === origin ? displayURL(url) : '[external]',
    at: new Date().toISOString(), status,
    method: ['GET', 'HEAD', 'POST'].includes(method) ? method : 'other',
    challenge: headers['cf-mitigated'] === 'challenge',
  };
  if (/^[a-z0-9-]{1,64}$/i.test(headers['cf-ray'] || '')) entry.rayId = headers['cf-ray'];
  return entry;
}

async function boundedSnapshot(page) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(inspectDocument),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 750); }),
    ]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function browserProbe(browser, value, { observationMs = LIMITS.observationMs, screenshot = true } = {}) {
  const target = new URL(value);
  // HTTP loopback is for local integration fixtures; the live CLI requires HTTPS.
  if ((target.protocol !== 'https:' && !(target.protocol === 'http:' && target.hostname === '127.0.0.1')) || target.username || target.password) {
    throw new Error('The browser probe requires HTTPS (or HTTP loopback for local fixtures).');
  }
  if (!Number.isInteger(observationMs) || observationMs < 1 || observationMs > LIMITS.observationMs) throw new Error('Invalid observation duration.');
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1280, height: 900 } });
  const started = Date.now();
  const report = {
    version: 1, probe: 'chromium', browserVersion: browser.version(), target: displayURL(target),
    startedAt: new Date(started).toISOString(), limits: { ...LIMITS, observationMs },
    requests: { observed: 0, failed: 0, blockedByProbe: 0, firstParty: 0, cloudflare: 0, other: 0 },
    navigationAttempts: 0, navigations: [], pageErrors: 0,
    challengeObserved: false, gateObserved: false, dom: null, stopReason: null,
  };
  let page, finished = false, navigationError = false, image, lastDocumentResponseAt = 0;
  const stop = reason => {
    if (report.stopReason) return;
    report.stopReason = reason;
    // Stop traffic immediately; do not wait for the DOM polling interval.
    void context.setOffline(true).catch(() => {});
  };
  const mainRequest = request => {
    try { return request.isNavigationRequest() && request.frame() === page.mainFrame(); } catch { return false; }
  };
  const requestContext = request => {
    try { return { main: mainRequest(request), method: request.method(), popup: request.frame().page() !== page }; }
    catch { return { popup: true }; }
  };
  try {
    page = await context.newPage();
    context.on('page', popup => { if (popup !== page) void popup.close().catch(() => {}); });
    page.on('pageerror', () => { report.pageErrors++; });
    page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });
    page.on('download', download => { void download.cancel().catch(() => {}); stop('download_stopped'); });
    await context.routeWebSocket('**/*', socket => { report.requests.blockedByProbe++; socket.close(); });
    await context.route('**/*', async route => {
      const request = route.request();
      const denied = requestPolicy(request.url(), target.origin, requestContext(request));
      if (finished || report.stopReason || denied) {
        if (!finished) report.requests.blockedByProbe++;
        await route.abort().catch(() => {});
      } else await route.continue().catch(() => { if (!finished) stop('probe_error'); });
    });
    context.on('request', request => {
      if (finished) return;
      report.requests.observed++;
      let origin;
      try { origin = new URL(request.url()).origin; } catch { /* recorded as other */ }
      report.requests[origin === target.origin ? 'firstParty' : origin === CHALLENGES ? 'cloudflare' : 'other']++;
      if (mainRequest(request)) {
        report.navigationAttempts++;
        if (origin !== target.origin) stop('external_navigation_stopped');
        if (report.navigationAttempts > LIMITS.navigations) stop('navigation_budget_exceeded');
      }
      if (report.requests.observed > LIMITS.requests) stop('request_budget_exceeded');
      // Redirects can skip route interception; record this limit honestly and stop.
      if (request.redirectedFrom() && requestPolicy(request.url(), target.origin, requestContext(request))) stop('redirect_out_of_scope');
    });
    context.on('requestfailed', () => { if (!finished) report.requests.failed++; });
    context.on('response', response => {
      if (finished) return;
      if (response.status() === 429) stop('rate_limited');
      if (!mainRequest(response.request()) || report.navigations.length >= LIMITS.navigations) return;
      const entry = navigationEntry(response.url(), target.origin, response.status(), response.headers(), response.request().method());
      report.navigations.push(entry);
      report.challengeObserved ||= entry.challenge;
      lastDocumentResponseAt = Date.now();
    });
    // Keep the normal browser network stack: do not proxy through route.fetch().
    void page.goto(target.href, { waitUntil: 'commit', timeout: Math.min(10000, observationMs) }).catch(() => { navigationError = true; });
    while (!report.stopReason && Date.now() - started < observationMs) {
      const snapshot = await boundedSnapshot(page);
      if (snapshot) { report.dom = snapshot; report.gateObserved ||= snapshot.gate; }
      const outcome = browserOutcome(report);
      if (outcome === 'profile_links_exposed') break;
      // Give an error document time to parse, so a 503 branded gate is not
      // prematurely classified from the previous/blank document's snapshot.
      if (Date.now() - lastDocumentResponseAt >= 250 && ['verification_unavailable', 'server_error', 'blocked', 'http_error'].includes(outcome)) break;
      if (navigationError && !report.navigations.length) { stop('network_error'); break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Freeze traffic before capturing evidence. No further retries while saving.
    finished = true;
    await context.setOffline(true);
    report.outcome = browserOutcome(report);
    if (screenshot) {
      try { image = await page.screenshot({ timeout: 3000 }); report.screenshot = 'captured'; }
      catch { report.screenshot = 'unavailable'; }
    } else report.screenshot = 'disabled';
    report.durationMs = Date.now() - started;
    return { report, screenshot: image };
  } finally { finished = true; await context.close(); }
}

async function privateFile(filename, contents) {
  await writeFile(filename, contents, { mode: 0o600 });
  await chmod(filename, 0o600);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let browser;
  try {
    if (process.argv.includes('--help')) {
      console.log('Usage: npm run check:crawl:browser -- [--headed] [--channel bundled|chromium|chrome|msedge] [--url https://your-domain.example/profile/]\nFresh browser; up to 20 seconds. Saves private report/screenshot. Does not click challenges or outbound links.');
    } else {
      if (process.env.CI) throw new Error('Live browser checks are disabled in CI; run the local fixture tests instead.');
      const options = browserOptions(process.argv.slice(2));
      const target = await crawlTarget(options.targetArgs);
      let chromium;
      try { ({ chromium } = await import('@playwright/test')); }
      catch { throw new Error('Install existing dev dependencies with npm ci, then run npx playwright install chromium.'); }
      try { browser = await chromium.launch({ headless: !options.headed, ...(options.channel === 'bundled' ? {} : { channel: options.channel }), timeout: 15000 }); }
      catch (error) { throw new Error(browserLaunchError(error, options.channel)); }
      console.log('Observing one page with JavaScript enabled (up to 20 seconds); no challenge or link clicks.');
      let result;
      try { result = await browserProbe(browser, target); }
      catch { throw new Error('Browser observation failed. No protection conclusion is available; check that Chromium can run locally.'); }
      result.report.headless = !options.headed;
      result.report.channel = options.channel;
      const output = path.join(root, '.private/browser-crawl');
      await mkdir(output, { recursive: true, mode: 0o700 });
      // Unique names prevent an old screenshot being mistaken for a new failure.
      const name = result.report.startedAt.replace(/[:.]/g, '-');
      await privateFile(path.join(output, name + '.json'), JSON.stringify(result.report, null, 2) + '\n');
      if (result.screenshot) await privateFile(path.join(output, name + '.png'), result.screenshot);
      console.log(`Browser result: ${result.report.outcome}. Requests observed: ${result.report.requests.observed}. Profile links in DOM: ${result.report.dom?.profileLinks ?? 'unknown'}.`);
      console.log(`Evidence: .private/browser-crawl/${name}.json${result.screenshot ? ' (plus .png)' : ''}`);
      console.log('This observes one automated browser; it does not simulate Meta or prove all crawlers are blocked.');
      if (['network_error', 'probe_error'].includes(result.report.outcome)) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Browser check could not complete: ${['ERR_MODULE_NOT_FOUND'].includes(error.code) ? 'Install dependencies with npm ci.' : error.message}`);
    process.exitCode = 1;
  } finally { await browser?.close(); }
}
