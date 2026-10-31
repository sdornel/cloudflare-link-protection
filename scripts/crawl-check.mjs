import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpsURL, resolveConfig, root, validateConfig } from './config.mjs';

export const USER_AGENT = 'ProfilePageProbe/1.0';
const MAX_REQUESTS = 3;
const MAX_BYTES = 256 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const displayURL = url => url.origin + url.pathname; // Never report query/fragment values.

export async function crawlTarget(args, options = {}) {
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--url') throw new Error('Use --url followed by one HTTPS URL, or omit it to use your site config.');
    return httpsURL(args[1], 'Crawl target');
  }
  const { config } = await resolveConfig(options);
  validateConfig(config);
  if (!config.siteUrl) throw new Error('Set siteUrl in your private config, or supply --url for your deployment.');
  const base = config.profilePath && config.profilePath !== '/' ? config.profilePath + '/' : '/';
  return new URL(base, config.siteUrl);
}

async function boundedText(response) {
  if (!response.body) return { text: '', truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { text: text + decoder.decode(), truncated: false };
      const remaining = MAX_BYTES - bytes;
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return { text: text + decoder.decode(), truncated: true };
      }
    }
  } finally { reader.releaseLock(); }
}

export function classify(response, text) {
  if (response.status === 429) return 'rate_limited';
  if (response.headers.get('cf-mitigated') === 'challenge') return 'cloudflare_challenge';
  const html = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('Content-Type') || '');
  const gate = html && /\bid\s*=\s*["']verification-form["']/i.test(text);
  if (gate && (response.status >= 500 || /\bdata-state\s*=\s*["']unavailable["']/i.test(text))) return 'verification_unavailable';
  if (response.status >= 500) return 'server_error';
  if ([401, 403].includes(response.status)) return 'blocked';
  if (REDIRECTS.has(response.status)) return 'redirect';
  if (!response.ok) return 'http_error';
  if (gate) return 'verification_gate';
  if (html && /<a\b[^>]*\bdata-link-id\s*=/i.test(text)) return 'profile_links_visible';
  return 'other_response';
}

export async function probe(value, { fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let url = httpsURL(String(value), 'Crawl target');
  url.hash = '';
  const origin = url.origin;
  const visited = new Set();
  const report = { version: 1, userAgent: USER_AGENT, target: displayURL(url), outcome: '', requests: [] };
  for (let index = 0; index < MAX_REQUESTS; index++) {
    if (index) await wait(3000);
    visited.add(url.href);
    const entry = { url: displayURL(url), at: new Date().toISOString() };
    report.requests.push(entry);
    let response, body;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(10000),
      });
      entry.status = response.status;
      // A challenge/rate limit is already conclusive for this probe. Do not
      // download its scripts or keep its cookies, even when its status is 200.
      if (response.headers.get('cf-mitigated') === 'challenge' || response.status === 429) {
        await response.body?.cancel();
        body = { text: '', truncated: false };
      } else body = await boundedText(response);
    } catch (error) {
      entry.result = report.outcome = 'network_error';
      const code = error.cause?.code || error.name;
      entry.error = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'TimeoutError', 'AbortError', 'EPERM', 'EACCES'].includes(code) ? code : 'request_failed';
      return report;
    }
    entry.result = report.outcome = classify(response, body.text);
    entry.bodyTruncated = body.truncated;
    const ray = response.headers.get('cf-ray');
    if (ray && /^[a-z0-9-]{1,64}$/i.test(ray)) entry.rayId = ray;
    if (entry.result !== 'redirect') return report;
    let next;
    try {
      const location = response.headers.get('Location');
      if (!location) throw new Error();
      next = httpsURL(new URL(location, url).href, 'Redirect');
      next.hash = '';
    } catch { report.outcome = 'invalid_redirect'; return report; }
    if (next.origin !== origin) { report.outcome = 'external_redirect_stopped'; return report; }
    if (visited.has(next.href)) { report.outcome = 'redirect_loop_stopped'; return report; }
    url = next;
  }
  report.outcome = 'redirect_limit_stopped';
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--help')) {
      console.log('Usage: npm run check:crawl [-- --url https://your-domain.example/profile/]\nDefaults to your configured profile. At most 3 GETs, 3 seconds apart; stops at challenges.');
    } else {
      if (process.env.CI) throw new Error('Live crawler checks are disabled in CI. Run the mocked Node tests instead.');
      const target = await crawlTarget(process.argv.slice(2));
      const report = await probe(target);
      const output = path.join(root, '.private/crawl-check.json');
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
      console.log(`Crawler result: ${report.outcome}. Requests attempted: ${report.requests.length}. Report: .private/crawl-check.json`);
      if (report.outcome === 'network_error') {
        console.log('The request could not complete. This is not evidence of a Cloudflare block.');
        process.exitCode = 1;
      } else {
        console.log('This describes one fresh HTTP client, not Meta or all crawlers. No scripts, forms, or outbound links were followed.');
      }
    }
  } catch (error) {
    console.error(`Crawler check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
