import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from '../scripts/build.mjs';
import { root, validateConfig } from '../scripts/config.mjs';
import { createPreviewHandler } from '../scripts/serve.mjs';
import { guardedPageURL, openingPlan } from '../src/client/browser-opening.js';

const sample = JSON.parse(await readFile(path.join(root, 'config/site.example.json'), 'utf8'));
const fixture = () => {
  const config = { ...structuredClone(sample), name: 'SYNTHETIC_CREATOR',
    siteUrl: 'https://profile.example', profilePath: '/sample-creator', placeholderLinks: false,
    styles: { variables: { accent: '#234567' } },
  };
  for (const link of [config.primaryLink, ...config.secondaryLinks]) link.url = `https://example.com/${link.id}`;
  return config;
};
async function directory(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-path-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function request(handler, url, method = 'GET') {
  const res = { statusCode: 200, headers: {},
    writeHead(status, headers = {}) { this.statusCode = status; this.headers = headers; return this; },
    end(body) { this.body = body?.toString() ?? ''; },
  };
  await handler({ url, method }, res);
  return res;
}

test('profile paths reject traversal, collisions, malformed and ambiguous routes without echoing inputs', () => {
  for (const profilePath of [undefined, '/', '/a', '/sample-creator', `/${'a'.repeat(64)}`]) {
    assert.doesNotThrow(() => validateConfig({ ...fixture(), profilePath }));
  }
  for (const profilePath of [null, 1, '', 'sample', '//sample', '/Sample', '/sample/', '/a/b', '/..', '/%2e%2e', '/a\\b', '/a?b', '/a#b', '/a\n', '/a\r\n', '/a\u2028', '/example', '/assets', '/images', `/${'a'.repeat(65)}`]) {
    assert.throws(() => validateConfig({ ...fixture(), profilePath }), /profilePath must be/);
  }
  assert.throws(() => validateConfig({ ...fixture(), profilePath: '/PRIVATE_INVALID_VALUE' }), error => !error.message.includes('PRIVATE_INVALID_VALUE'));
});

test('nested build separates root content and styles; all profile assets and SEO resolve to the profile', async (t) => {
  const dir = await directory(t), outDir = path.join(dir, 'output'), assetDirectory = path.join(dir, 'images');
  await mkdir(assetDirectory);
  await writeFile(path.join(assetDirectory, 'portrait.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const config = fixture();
  config.profile.image = config.seo.image = '/images/portrait.png';
  config.seo.imageAlt = 'Sample portrait';
  config.analytics.ga4MeasurementId = 'G-TEST1234';
  config.analytics.cloudflareToken = 'a'.repeat(32);
  config.primaryLink.url = 'https://example.com/projects?a=1&a=2&encoded=%20#latest';
  config.internalNote = 'NEVER_EMITTED_MARKER';
  const result = await build({ config, outDir, assetDirectory, production: true });
  assert.equal(result.pageCount, 4);
  const neutral = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const html = await readFile(path.join(outDir, 'sample-creator/index.html'), 'utf8');
  assert.match(neutral, /href="\/example\/"/);
  const demo = await readFile(path.join(outDir, 'example/index.html'), 'utf8');
  assert.ok(demo.includes(sample.name));
  assert.doesNotMatch(demo, /SYNTHETIC_CREATOR|sample-creator|G-TEST1234|NEVER_EMITTED_MARKER/);
  assert.doesNotMatch(neutral, /SYNTHETIC_CREATOR|sample-creator|G-TEST1234|aaaaaaaaaaaaaaaa|NEVER_EMITTED_MARKER/);
  assert.match(neutral, /noindex, follow/);
  assert.match(html, /SYNTHETIC_CREATOR/);
  assert.match(html, /href="https:\/\/example.com\/projects\?a=1&amp;a=2&amp;encoded=%20#latest"/);
  assert.match(html, /rel="canonical" href="https:\/\/profile.example\/sample-creator\/"/);
  assert.match(html, /og:image" content="https:\/\/profile.example\/sample-creator\/images\/portrait.png"/);
  assert.match(html, /src="\/sample-creator\/images\/portrait.png"/);
  assert.doesNotMatch(html, /NEVER_EMITTED_MARKER|publish-guide|\{\{[A-Z_]+\}\}/);
  // Resolve the actual emitted URLs against both entry forms, then read the files.
  for (const base of ['https://profile.example/sample-creator', 'https://profile.example/sample-creator/']) {
    for (const [, asset] of html.matchAll(/(?:src|href)="(\/sample-creator\/[^\"]+)"/g)) {
      const url = new URL(asset, base);
      assert.ok((await readFile(path.join(outDir, url.pathname.slice(1)))).length > 0);
    }
  }
  assert.match(await readFile(path.join(outDir, 'sample-creator/styles.css'), 'utf8'), /--accent: #234567/);
  assert.doesNotMatch(await readFile(path.join(outDir, 'styles.css'), 'utf8'), /#234567/);
  const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/profile.example\/sample-creator\/<\/loc>/);
  assert.equal((sitemap.match(/<loc>/g) ?? []).length, 1);
  assert.match(await readFile(path.join(outDir, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/profile.example\/sitemap.xml/);
  assert.doesNotMatch(await readFile(path.join(outDir, '404.html'), 'utf8'), /SYNTHETIC_CREATOR|sample-creator/);
  assert.deepEqual((await readdir(outDir, { recursive: true })).filter(file => file.endsWith('.json')).map(file => file.replaceAll('\\', '/')), ['_verification/manifest.json']);
  const manifest = JSON.parse(await readFile(path.join(outDir, '_verification/manifest.json'), 'utf8'));
  assert.equal(manifest.enabled, false);
  assert.equal(manifest.template, undefined);
});

test('preview routes slashless entry with intact queries, serves the page and assets, and returns real 404s', async (t) => {
  const outDir = await directory(t);
  await build({ config: fixture(), outDir });
  const handler = createPreviewHandler(outDir);
  const entry = await request(handler, '/sample-creator?a=%20&a=2&plus=+');
  assert.equal(entry.statusCode, 307);
  assert.equal(entry.headers.Location, '/sample-creator/?a=%20&a=2&plus=+');
  const page = await request(handler, entry.headers.Location);
  assert.equal(page.statusCode, 200);
  assert.match(page.headers['Content-Type'], /text\/html/);
  assert.match(page.body, /SYNTHETIC_CREATOR/);
  assert.doesNotMatch((await request(handler, '/')).body, /SYNTHETIC_CREATOR/);
  const exampleEntry = await request(handler, '/example?source=test');
  assert.equal(exampleEntry.headers.Location, '/example/?source=test');
  const example = await request(handler, exampleEntry.headers.Location);
  assert.equal(example.statusCode, 200);
  assert.ok(example.body.includes(sample.name));
  assert.doesNotMatch(example.body, /SYNTHETIC_CREATOR/);
  const buttons = [...example.body.matchAll(/href="([^"]+)" data-link-id="[^"]+" data-opening-mode="([^"]+)"/g)];
  assert.equal(buttons.length, 3);
  for (const [, href, mode] of buttons) {
    assert.equal(href, '/example/more-soon/');
    assert.equal(mode, 'direct');
    const destination = await request(handler, href);
    assert.equal(destination.statusCode, 200);
    assert.match(destination.body, /<h1>More soon<\/h1>/);
    assert.match(destination.body, /href="\/example\/"/);
    assert.doesNotMatch(destination.body, /<script|SYNTHETIC_CREATOR|style=/);
    const stylesheet = destination.body.match(/rel="stylesheet" href="([^"]+)"/)[1];
    assert.equal((await request(handler, stylesheet)).statusCode, 200);
  }
  const css = await request(handler, '/sample-creator/styles.css?v=123');
  assert.equal(css.statusCode, 200);
  assert.match(css.headers['Content-Type'], /text\/css/);
  const head = await request(handler, '/sample-creator/', 'HEAD');
  assert.equal(head.statusCode, 200); assert.equal(head.body, '');
  for (const url of ['/missing', '/missing/', '/sample-creator/missing', '/sample-creator/assets', '/config/site.json']) {
    const response = await request(handler, url);
    assert.equal(response.statusCode, 404, url);
    assert.match(response.body, /Page not found/);
    assert.doesNotMatch(response.body, /SYNTHETIC_CREATOR/);
  }
  assert.equal((await request(handler, '/sample-creator', 'POST')).statusCode, 405);
  assert.equal((await request(handler, '/%')).statusCode, 400);
  assert.equal((await request(handler, '/_headers')).statusCode, 404);
});

test('invalid rebuild preserves output; moving the profile removes the old path; explicit example ignores private routing', async (t) => {
  const outDir = await directory(t), config = fixture();
  await build({ config, outDir });
  const previous = await readFile(path.join(outDir, 'sample-creator/index.html'), 'utf8');
  await assert.rejects(() => build({ config: { ...config, profilePath: '/assets' }, outDir }), /profilePath/);
  assert.equal(await readFile(path.join(outDir, 'sample-creator/index.html'), 'utf8'), previous);
  await build({ config: { ...config, profilePath: '/another-creator' }, outDir });
  assert.ok(!(await readdir(outDir)).includes('sample-creator'));
  assert.ok((await readdir(outDir)).includes('another-creator'));
  await build({ exampleBuild: true, env: { SITE_CONFIG_JSON: JSON.stringify(config) }, outDir });
  assert.ok(!(await readdir(outDir)).includes('another-creator'));
  assert.ok(!(await readdir(outDir)).includes('sample-creator'));
  assert.doesNotMatch(await readFile(path.join(outDir, 'index.html'), 'utf8'), /SYNTHETIC_CREATOR/);
});

test('placeholder profile remains usable and noindex without a sitemap, while strict production rejects it', async (t) => {
  const outDir = await directory(t), config = { ...fixture(), placeholderLinks: true };
  await build({ config, outDir, privateBuild: true });
  assert.match(await readFile(path.join(outDir, 'sample-creator/index.html'), 'utf8'), /noindex, follow/);
  assert.ok(!(await readdir(outDir)).includes('sitemap.xml'));
  await assert.rejects(() => build({ config, outDir, production: true }), /Before production/);
});

test('native page handoff preserves the profile path and query and retains its loop guard', () => {
  const target = 'https://profile.example/sample-creator/?source=ig&a=%20&a=2';
  const guarded = guardedPageURL(target);
  assert.equal(guarded.url, `${target}&_lp_handoff=1`);
  const ios = openingPlan(guarded.url, { mode: 'native' }, { eligible: true, platform: 'ios' });
  assert.equal(decodeURIComponent(ios.uri.split('?url=')[1]), guarded.url);
  const android = openingPlan(guarded.url, { mode: 'native' }, { eligible: true, platform: 'android' });
  assert.equal(decodeURIComponent(android.uri.match(/S.browser_fallback_url=([^;]+);end$/)[1]), guarded.url);
  assert.equal(guardedPageURL(guarded.url).marked, true);
});

test('landing content and styling overrides stay separate from the demo and creator', async (t) => {
  const outDir = await directory(t), config = fixture();
  config.landing = { name: 'PLATFORM_BRAND_MARKER', headline: 'A <small> place & a big idea',
    styles: { variables: { accent: '#197a41' } }, appearance: { faviconBackground: '#ffffff' } };
  await build({ config, outDir });
  const home = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(home, /PLATFORM_BRAND_MARKER/);
  assert.match(home, /A &lt;small&gt; place &amp; a big idea/);
  assert.match(home, /class="landing-cta" href="\/example\/"/);
  assert.doesNotMatch(home, /<script|data-link-id|SYNTHETIC_CREATOR|publish-guide/);
  assert.match(home, /rel="canonical" href="https:\/\/profile.example\/"/);
  assert.match(await readFile(path.join(outDir, 'styles.css'), 'utf8'), /--accent: #197a41/);
  assert.match(await readFile(path.join(outDir, 'favicon.svg'), 'utf8'), /fill="#ffffff"/);
  for (const page of ['example', 'sample-creator']) {
    assert.doesNotMatch(await readFile(path.join(outDir, page, 'index.html'), 'utf8'), /PLATFORM_BRAND_MARKER|A &lt;small&gt;/);
    assert.doesNotMatch(await readFile(path.join(outDir, page, 'styles.css'), 'utf8'), /#197a41/);
  }
  const demoBefore = await readFile(path.join(outDir, 'example/index.html'), 'utf8');
  await build({ exampleBuild: true, env: { SITE_CONFIG_JSON: JSON.stringify(config) }, outDir });
  assert.doesNotMatch(await readFile(path.join(outDir, 'index.html'), 'utf8'), /PLATFORM_BRAND_MARKER/);
  assert.equal(await readFile(path.join(outDir, 'example/index.html'), 'utf8'), demoBefore);
});

test('invalid landing inputs fail before replacing the previous build', async (t) => {
  const outDir = await directory(t), config = fixture();
  await build({ config, outDir });
  const before = await readFile(path.join(outDir, 'index.html'), 'utf8');
  for (const landing of [null, [], { name: '' }, { headline: ' '.repeat(10) }, { footer: 'a'.repeat(501) },
    { unexpected: true }, { appearance: null }, { appearance: { browserThemeColor: 'red' } },
    { styles: null }, { styles: { variables: { accent: 'red; display:none' } } }, JSON.parse('{"__proto__":{}}')]) {
    await assert.rejects(() => build({ config: { ...config, landing }, outDir }));
    assert.equal(await readFile(path.join(outDir, 'index.html'), 'utf8'), before);
  }
});

test('legacy root profiles retain their identity and receive an independent example page', async (t) => {
  const outDir = await directory(t), config = fixture();
  delete config.profilePath;
  await build({ config, outDir });
  const home = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const demo = await readFile(path.join(outDir, 'example/index.html'), 'utf8');
  assert.match(home, /SYNTHETIC_CREATOR/);
  assert.doesNotMatch(home, /class="landing-cta"/);
  assert.doesNotMatch(demo, /SYNTHETIC_CREATOR/);
  assert.ok(demo.includes(sample.name));
});
