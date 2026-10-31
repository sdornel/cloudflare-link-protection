import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { browserProbe, LIMITS } from '../../scripts/browser-crawl-check.mjs';

// Actual Chromium networking and JavaScript against local servers only. No
// provider accounts, production targets, clearance cookies or live challenges.
test.beforeEach(async ({ browserName }) => { test.skip(browserName !== 'chromium', 'The live diagnostic intentionally uses Chromium.'); });

async function fixture(handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}
const html = (response, body, status = 200, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'text/html', ...headers }); response.end(body);
};
const options = { observationMs: 2000, screenshot: false };

test('executes JS, counts hidden links and blocks third-party resources without clicking links', async ({ browser }) => {
  let externalRequests = 0, destinationRequests = 0;
  const external = await fixture((_request, response) => { externalRequests++; response.end('outside'); });
  const own = await fixture((request, response) => {
    if (request.url.startsWith('/destination')) destinationRequests++;
    html(response, `<script>
      fetch('${external.url}/tracking').catch(() => {});
      setTimeout(() => { document.body.innerHTML = '<a data-link-id="one" href="/destination">Visit</a><div hidden><a data-link-id="two" href="https://private-destination.example/secret">Hidden</a></div>'; }, 100);
    </script><body></body>`);
  });
  try {
    const { report, screenshot } = await browserProbe(browser, own.url + '/sample/?secret-query#secret-fragment', { ...options, screenshot: true });
    expect(report.outcome).toBe('profile_links_exposed');
    expect(report.dom).toMatchObject({ profileLinks: 2, renderedProfileLinks: 1, outboundAnchors: 1 });
    expect(report.requests.blockedByProbe).toBeGreaterThan(0);
    expect(externalRequests).toBe(0);
    expect(destinationRequests).toBe(0);
    expect(screenshot.subarray(1, 4).toString()).toBe('PNG');
    expect(JSON.stringify(report)).not.toMatch(/secret|private-destination/);
  } finally { await own.close(); await external.close(); }
});

test('observes natural JS form submission and redirects with cookies isolated between runs', async ({ browser }) => {
  const initialCookies = [], posts = [];
  const own = await fixture((request, response) => {
    if (request.url === '/_verification/verify') {
      posts.push({ method: request.method, cookie: request.headers.cookie });
      response.writeHead(303, { Location: '/complete/?private=return', 'Set-Cookie': 'session=fixture; HttpOnly; SameSite=Lax' }); response.end();
    } else if (request.url.startsWith('/complete/')) {
      html(response, '<a data-link-id="one" href="https://destination.example/secret">Visit</a>');
    } else if (request.url.startsWith('/sample/')) {
      initialCookies.push(request.headers.cookie);
      html(response, `<form id="verification-form" data-state="loading" action="/_verification/verify" method="post"><input name="token" value="synthetic-secret"></form><script>setTimeout(() => document.querySelector('form').submit(), 600)</script>`, 200, { 'Set-Cookie': 'nonce=fixture; HttpOnly; SameSite=Lax' });
    } else { response.writeHead(404); response.end(); }
  });
  try {
    for (let i = 0; i < 2; i++) {
      const { report } = await browserProbe(browser, own.url + '/sample/', options);
      expect(report.outcome).toBe('profile_links_exposed');
      expect(report.gateObserved).toBe(true);
      expect(report.navigations.map(item => item.status)).toEqual([200, 303, 200]);
      expect(JSON.stringify(report)).not.toMatch(/synthetic-secret|nonce=|session=|private=return/);
    }
    expect(initialCookies).toEqual([undefined, undefined]);
    expect(posts).toEqual([{ method: 'POST', cookie: 'nonce=fixture' }, { method: 'POST', cookie: 'nonce=fixture' }]);
  } finally { await own.close(); }
});

test('a pending edge challenge is observed without clicking its controls', async ({ browser }) => {
  let clicked = false;
  const own = await fixture((request, response) => {
    if (request.url === '/clicked') clicked = true;
    html(response, '<button onclick="fetch(\'/clicked\')">Verify</button>', 200, { 'cf-mitigated': 'challenge', 'cf-ray': 'abc123-TEST' });
  });
  try {
    const { report } = await browserProbe(browser, own.url, { ...options, observationMs: 600 });
    expect(report.outcome).toBe('cloudflare_challenge');
    expect(report.challengeObserved).toBe(true);
    expect(report.navigations).toHaveLength(1);
    expect(clicked).toBe(false);
  } finally { await own.close(); }
});

test('detects client-side unavailable state and reports rate limiting separately', async ({ browser }) => {
  const own = await fixture((request, response) => {
    if (request.url === '/limited') html(response, 'Wait', 429);
    else if (request.url === '/unavailable') html(response, '<form id="verification-form" data-state="unavailable"></form>', 503);
    else html(response, '<form id="verification-form" data-state="loading"></form><p id="verification-status">Provider unavailable</p><span hidden data-message="unavailable">Provider unavailable</span>');
  });
  try {
    expect((await browserProbe(browser, own.url, options)).report.outcome).toBe('verification_unavailable');
    expect((await browserProbe(browser, own.url + '/unavailable', options)).report.outcome).toBe('verification_unavailable');
    expect((await browserProbe(browser, own.url + '/limited', options)).report.outcome).toBe('rate_limited');
  } finally { await own.close(); }
});

test('stops and redacts an out-of-scope HTTP redirect, without claiming it was prevented before sending', async ({ browser }) => {
  const external = await fixture((_request, response) => html(response, '<p>Outside</p>'));
  const own = await fixture((_request, response) => { response.writeHead(302, { Location: external.url + '/secret?private=value' }); response.end(); });
  try {
    const { report } = await browserProbe(browser, own.url, options);
    expect(report.outcome).toBe('external_navigation_stopped');
    expect(JSON.stringify(report)).not.toMatch(/secret|private=value/);
  } finally { await own.close(); await external.close(); }
});

test('redirect loops exhaust the navigation budget and resource floods exhaust the request budget', async ({ browser }) => {
  const own = await fixture((request, response) => {
    if (request.url.startsWith('/loop')) { response.writeHead(302, { Location: '/loop?n=' + Math.random() }); response.end(); }
    else if (request.url === '/flood') html(response, '<script>for(let i=0;i<100;i++) fetch("/resource?n="+i).catch(()=>{});</script>');
    else response.end('resource');
  });
  try {
    const loop = (await browserProbe(browser, own.url + '/loop', options)).report;
    expect(loop.outcome).toBe('navigation_budget_exceeded');
    expect(loop.navigations.length).toBeLessThanOrEqual(LIMITS.navigations);
    const flood = (await browserProbe(browser, own.url + '/flood', options)).report;
    expect(flood.outcome).toBe('request_budget_exceeded');
  } finally { await own.close(); }
});
