import assert from 'node:assert/strict';
import { copyFile, cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from '../scripts/build.mjs';
import { loadConfig, root, validateConfig } from '../scripts/config.mjs';
import { compileTheme } from '../scripts/theme.mjs';

const original = JSON.parse(await readFile(path.join(root, 'config/site.example.json'), 'utf8'));
const theme = JSON.parse(await readFile(path.join(root, 'config/theme.json'), 'utf8'));
const fresh = () => { const config = structuredClone(original); delete config.browserOpening; delete config.schemaVersion; delete config.ageAcknowledgment; return config; };
async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-page-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function built(t, options = {}) {
  const outDir = path.join(await temp(t), 'output');
  await build({ outDir, ...options });
  return { outDir, html: await readFile(path.join(outDir, 'index.html'), 'utf8') };
}

test('standalone example has embedded styling and stays unchanged by configured builds', async (t) => {
  const file = path.join(root, 'example.html');
  const before = await readFile(file, 'utf8');
  assert.match(before, /<style>[\s\S]+<\/style>/);
  assert.doesNotMatch(before, /<script\b|<link\b[^>]*rel=["']stylesheet|<img\b|<iframe\b|@import\b|url\s*\(|\{\{[A-Z_]+\}\}/i);
  const links = [...before.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*data-link-id=/g)].map((match) => match[1]);
  assert.ok(links.length >= 3);
  assert.ok(links.every((url) => url === './more-soon.html'));
  const allLinks = [...before.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(allLinks.every((url) => url.startsWith('#') || url === './more-soon.html'));
  const moreSoon = await readFile(path.join(root, 'more-soon.html'), 'utf8');
  assert.match(moreSoon, /<h1>More soon<\/h1>/);
  assert.match(moreSoon, /href="\.\/example.html"/);
  assert.doesNotMatch(moreSoon, /<script\b|<link\b[^>]*rel=["']stylesheet/i);
  assert.doesNotMatch(before, /id="publish-guide"|Publish with Cloudflare|Software engineer|Demo ·|class="preview-note"/);
  const config = { ...fresh(), name: 'PRIVATE_EXAMPLE_ISOLATION_MARKER', styles: { variables: { accent: '#234567' } } };
  const { html } = await built(t, { privateBuild: true, env: { SITE_CONFIG_JSON: JSON.stringify(config) } });
  assert.match(html, /PRIVATE_EXAMPLE_ISOLATION_MARKER/);
  assert.doesNotMatch(html, /id="publish-guide"|Publish with Cloudflare/);
  assert.equal(await readFile(file, 'utf8'), before);
  assert.doesNotMatch(before, /PRIVATE_EXAMPLE_ISOLATION_MARKER/);
});

test('explicit example build ignores private inputs and emits direct functional links', async (t) => {
  const { html: home, outDir } = await built(t, { exampleBuild: true, env: { SITE_CONFIG_JSON: 'INVALID_PRIVATE_MARKER' } });
  assert.match(home, /href="\/example\/"/);
  assert.doesNotMatch(home, /PRIVATE_MARKER|publish-guide/);
  const html = await readFile(path.join(outDir, 'example/index.html'), 'utf8');
  for (const link of [original.primaryLink, ...original.secondaryLinks]) assert.ok(html.includes(`href="${link.url}"`));
  assert.match(html, /noindex, follow/);
  assert.doesNotMatch(html, /id="publish-guide"|Publish with Cloudflare|Software engineer|Demo ·|class="preview-note"/);
  assert.doesNotMatch(html, /PRIVATE_MARKER|http-equiv=["']refresh|target=["']_blank|onclick=/i);
  assert.match(await readFile(path.join(outDir, 'robots.txt'), 'utf8'), /User-agent: \*\nAllow: \//);
  assert.deepEqual((await readdir(outDir)).sort(), ['404.html', '_headers', '_verification', 'example', 'favicon.svg', 'index.html', 'robots.txt', 'styles.css']);
  const manifest = JSON.parse(await readFile(path.join(outDir, '_verification/manifest.json'), 'utf8'));
  assert.equal(manifest.enabled, false);
  assert.deepEqual(Object.keys(manifest).sort(), ['enabled', 'responseHeaders', 'version']);
});

test('default build uses local config, styles and private images, then falls back when the file is absent', async (t) => {
  const projectRoot = await temp(t);
  for (const file of ['config/site.example.json', 'config/theme.json', 'config/landing.example.json', 'config/landing.theme.json', 'src/landing.html', 'src/index.html', 'src/more-soon.html', 'public/_headers']) {
    await mkdir(path.dirname(path.join(projectRoot, file)), { recursive: true });
    await copyFile(path.join(root, file), path.join(projectRoot, file));
  }
  await cp(path.join(root, 'src/client'), path.join(projectRoot, 'src/client'), { recursive: true });
  const local = fresh();
  local.name = 'LOCAL_CUSTOM_MARKER';
  local.primaryLink.url = 'https://custom.example/projects';
  local.profile.image = '/images/portrait.png';
  local.profile.alt = 'A portrait';
  local.styles = { variables: { accent: '#234567' } };
  await writeFile(path.join(projectRoot, 'config/site.json'), JSON.stringify(local));
  await mkdir(path.join(projectRoot, '.private/assets'), { recursive: true });
  await writeFile(path.join(projectRoot, '.private/assets/portrait.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await build({ projectRoot, env: {} });
  const index = path.join(projectRoot, 'dist/index.html');
  assert.equal(result.outDir, path.dirname(index));
  assert.equal(result.configSource, 'local');
  assert.match(await readFile(index, 'utf8'), /LOCAL_CUSTOM_MARKER/);
  assert.doesNotMatch(await readFile(index, 'utf8'), /id="publish-guide"/);
  assert.ok((await readFile(index, 'utf8')).includes(`href="${local.primaryLink.url}"`));
  assert.match(await readFile(path.join(result.outDir, 'styles.css'), 'utf8'), /--accent: #234567/);
  assert.deepEqual(await readdir(path.join(result.outDir, 'images')), ['portrait.png']);

  await build({ projectRoot, exampleBuild: true, env: { SITE_CONFIG_JSON: 'INVALID_PRIVATE_MARKER' } });
  const exampleHTML = await readFile(index, 'utf8');
  assert.match(exampleHTML, /href="\/example\/"/);
  const demoHTML = await readFile(path.join(result.outDir, 'example/index.html'), 'utf8');
  assert.ok(demoHTML.includes(original.name));
  assert.doesNotMatch(demoHTML, /id="publish-guide"|class="preview-note"/);
  assert.doesNotMatch(exampleHTML, /LOCAL_CUSTOM_MARKER|custom\.example/);
  assert.ok(!(await readdir(result.outDir)).includes('images'));

  await rm(path.join(projectRoot, 'config/site.json'));
  assert.equal((await build({ projectRoot, env: {} })).configSource, 'example');
  assert.equal(await readFile(index, 'utf8'), exampleHTML);
});

test('default config prefers environment and only falls back for an absent local file', async (t) => {
  const projectRoot = await temp(t);
  await mkdir(path.join(projectRoot, 'config'));
  await writeFile(path.join(projectRoot, 'config/site.example.json'), JSON.stringify(fresh()));
  const localFile = path.join(projectRoot, 'config/site.json');
  await writeFile(localFile, '"PRIVATE_MARKER": broken');
  const env = { SITE_CONFIG_JSON: JSON.stringify({ ...fresh(), name: 'ENV_PRIVATE_MARKER' }) };
  const { html } = await built(t, { env });
  assert.match(html, /ENV_PRIVATE_MARKER/);
  assert.equal((await loadConfig({ projectRoot, env })).name, 'ENV_PRIVATE_MARKER');
  await assert.rejects(() => loadConfig({ projectRoot, env: {} }), (error) => error.message.includes('config/site.json') && !error.message.includes('PRIVATE_MARKER'));
  for (const value of ['', '"PRIVATE_MARKER": broken']) {
    await assert.rejects(() => loadConfig({ projectRoot, env: { SITE_CONFIG_JSON: value } }), (error) => error.message.includes('SITE_CONFIG_JSON') && !error.message.includes('PRIVATE_MARKER'));
  }
  await writeFile(localFile, '{}');
  await assert.rejects(() => built(t, { projectRoot, env: {} }), /name must be nonempty/);
  await rm(localFile);
  await mkdir(localFile);
  await assert.rejects(() => loadConfig({ projectRoot, env: {} }), /could not be read/);
  await assert.rejects(() => loadConfig({ privateBuild: true, exampleBuild: true }), /either --private or --example/);
});

test('private config selects environment before local file and never falls back to public data', async (t) => {
  const projectRoot = await temp(t);
  await assert.rejects(() => loadConfig({ privateBuild: true, projectRoot, env: {} }), /Private configuration/);
  await mkdir(path.join(projectRoot, 'config'));
  const local = { ...fresh(), name: 'LOCAL_PRIVATE_MARKER' };
  await writeFile(path.join(projectRoot, 'config/site.json'), JSON.stringify(local));
  assert.equal((await loadConfig({ privateBuild: true, projectRoot, env: {} })).name, local.name);
  const env = { SITE_CONFIG_JSON: JSON.stringify({ ...fresh(), name: 'ENV_PRIVATE_MARKER' }) };
  assert.equal((await loadConfig({ privateBuild: true, projectRoot, env })).name, 'ENV_PRIVATE_MARKER');
  await assert.rejects(() => loadConfig({ privateBuild: true, projectRoot, env: { SITE_CONFIG_JSON: '"PRIVATE_MARKER": broken' } }), (error) => !error.message.includes('PRIVATE_MARKER'));
});

for (const [platform, ciFlag, branchKey] of [['Workers', 'WORKERS_CI', 'WORKERS_CI_BRANCH'], ['Pages', 'CF_PAGES', 'CF_PAGES_BRANCH']]) {
  test(`${platform} customized builds require production branch and strict mode requires a build variable`, async (t) => {
    const env = { [ciFlag]: '1', [branchKey]: 'feature', SITE_CONFIG_JSON: JSON.stringify(fresh()) };
    await assert.rejects(() => loadConfig({ env }), /production branch/);
    await assert.rejects(() => loadConfig({ privateBuild: true, env }), /production branch/);
    await assert.rejects(() => loadConfig({ privateBuild: true, env: { [ciFlag]: '1', [branchKey]: 'main' } }), /requires SITE_CONFIG_JSON/);
    await assert.rejects(() => loadConfig({ env: { [ciFlag]: '1', SITE_CONFIG_JSON: env.SITE_CONFIG_JSON } }), /production branch/);
    assert.equal((await loadConfig({ env: { ...env, [branchKey]: 'main' } })).name, original.name);
    assert.equal((await loadConfig({ exampleBuild: true, env: { ...env, SITE_CONFIG_JSON: 'INVALID_PRIVATE_MARKER' } })).name, original.name);
    env.SITE_PRODUCTION_BRANCH = 'feature';
    assert.equal((await loadConfig({ env })).name, original.name);
    assert.equal((await loadConfig({ privateBuild: true, env })).name, original.name);
    const projectRoot = await temp(t);
    await mkdir(path.join(projectRoot, 'config'));
    await writeFile(path.join(projectRoot, 'config/site.example.json'), JSON.stringify(fresh()));
    const preview = { [ciFlag]: '1', [branchKey]: 'feature' };
    assert.equal((await loadConfig({ projectRoot, env: preview })).name, original.name);
    await writeFile(path.join(projectRoot, 'config/site.json'), JSON.stringify(fresh()));
    await assert.rejects(() => loadConfig({ projectRoot, env: preview }), /production branch/);
  });
}

test('private build renders only selected display fields without publishing its source config', async (t) => {
  const config = { ...fresh(), name: 'PRIVATE_DISPLAY_NAME', internalNote: 'DO_NOT_PUBLISH_MARKER' };
  const { html, outDir } = await built(t, { privateBuild: true, env: { SITE_CONFIG_JSON: JSON.stringify(config) } });
  assert.match(html, /PRIVATE_DISPLAY_NAME/);
  for (const file of await readdir(outDir, { recursive: true, withFileTypes: true })) {
    if (file.isFile()) assert.doesNotMatch(await readFile(path.join(file.parentPath, file.name), 'utf8'), /DO_NOT_PUBLISH_MARKER/);
  }
  assert.ok(!(await readdir(outDir)).some((file) => file.endsWith('.json')));
});

test('production rejects unfinished config and generates canonical metadata for a configured page', async (t) => {
  assert.throws(() => validateConfig(fresh(), { production: true }), /Before production/);
  const config = fresh();
  config.siteUrl = 'https://profile.example';
  for (const link of [config.primaryLink, ...config.secondaryLinks]) link.url = `https://example.com/${link.id}`;
  config.placeholderLinks = false;
  const { html, outDir } = await built(t, { config, production: true });
  assert.match(html, /rel="canonical" href="https:\/\/profile.example\/"/);
  assert.match(html, /content="index, follow"/);
  assert.doesNotMatch(html, /class="preview-note"/);
  assert.match(await readFile(path.join(outDir, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/profile.example\/<\/loc>/);
});

test('text is escaped, disabled links are omitted, and analytics is opt-in', async (t) => {
  const config = fresh();
  config.name = '<img src=x onerror=alert(1)> & "Name"';
  config.secondaryLinks[0].enabled = false;
  config.analytics.cloudflareToken = 'a'.repeat(32);
  const { html } = await built(t, { config });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Name&quot;/);
  assert.ok(!html.includes(`data-link-id="${config.secondaryLinks[0].id}"`));
  assert.equal((html.match(/<script /g) || []).length, 1);
});

test('invalid config reports field names without exposing private input', () => {
  for (const url of ['javascript:PRIVATE_MARKER', 'http://example.com/PRIVATE_MARKER', 'https://user:PRIVATE_MARKER@example.com/', '/PRIVATE_MARKER', '//PRIVATE_MARKER', '/example/more-soon/?to=PRIVATE_MARKER', './more-soon.html']) {
    const config = fresh(); config.primaryLink.url = url;
    assert.throws(() => validateConfig(config), (error) => !error.message.includes('PRIVATE_MARKER'));
  }
  const config = fresh(); config.analytics.cloudflareToken = 'PRIVATE_MARKER';
  assert.throws(() => validateConfig(config), /Web Analytics token/);
  const finished = fresh(); finished.placeholderLinks = false;
  assert.throws(() => validateConfig(finished), /primaryLink.url/);
});

test('theme config controls layout, fonts, responsive rules, shadows, and animations', () => {
  const snapshot = JSON.stringify(theme);
  const css = compileTheme(theme, {
    variables: { 'font-family': 'Georgia, serif', 'primary-shadow': 'none' },
    rules: { '.page': { width: 'min(100%, 620px)', padding: '30px' }, '.avatar': { 'border-radius': '20px' } },
    media: { '(max-width: 350px)': { '.page': { 'padding-inline': '10px' } } },
    keyframes: { arrive: { from: { opacity: '0.2' } } },
  });
  for (const token of ['--font-family: Georgia, serif', '--primary-shadow: none', 'width: min(100%, 620px)', 'border-radius: 20px', 'padding-inline: 10px', 'opacity: 0.2']) assert.ok(css.includes(token));
  assert.equal(JSON.stringify(theme), snapshot);
  assert.doesNotMatch(compileTheme(theme, { keyframes: { arrive: null } }), /@keyframes arrive/);
});

test('theme rejects stylesheet escapes, remote loads, and prototype keys', () => {
  for (const invalid of ['red; display:none', 'url(https://example.com/x)', '@import x', 'var(--x)/*', 'red\n']) {
    assert.throws(() => compileTheme(theme, { variables: { accent: invalid } }));
  }
  assert.throws(() => compileTheme(theme, JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.throws(() => compileTheme(theme, { media: { 'screen } body {': {} } }));
  assert.equal({}.polluted, undefined);
});

test('only referenced assets are copied; traversal, missing files, and escaping symlinks fail', async (t) => {
  const assetDirectory = path.join(await temp(t), 'images');
  await mkdir(assetDirectory);
  await writeFile(path.join(assetDirectory, 'portrait.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await writeFile(path.join(assetDirectory, 'unused.png'), 'UNUSED_PRIVATE_MARKER');
  const config = fresh(); config.profile.image = '/images/portrait.png';
  const { outDir } = await built(t, { config, assetDirectory });
  assert.deepEqual(await readdir(path.join(outDir, 'images')), ['portrait.png']);
  const outside = path.join(await temp(t), 'outside.png');
  await writeFile(outside, 'OUTSIDE_MARKER');
  await symlink(outside, path.join(assetDirectory, 'escape.png'));
  for (const image of ['/images/../../site.json', '/images/missing.png', '/images/escape.png']) {
    config.profile.image = image;
    await assert.rejects(() => built(t, { config, assetDirectory }));
  }
});

test('external image origin is allowed in CSP without permitting every host', async (t) => {
  const config = fresh(); config.profile.image = 'https://images.example/portrait.webp';
  const { html, outDir } = await built(t, { config });
  assert.match(html, /src="https:\/\/images.example\/portrait.webp"/);
  const headers = await readFile(path.join(outDir, '_headers'), 'utf8');
  assert.match(headers, /img-src 'self' https:\/\/images.example;/);
  assert.doesNotMatch(headers, /img-src[^;]*\*/);
});

test('default text colors meet WCAG AA normal text contrast', () => {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
      .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const v = theme.variables;
  for (const [text, background] of [[v['on-accent'], v.accent], [v['on-accent'], v['accent-hover']], [v.text, v['link-background']], [v.muted, v.background], [v['avatar-text'], v['avatar-background']]]) {
    const values = [luminance(text), luminance(background)].sort((a, b) => a - b);
    assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, 'Default text contrast is below 4.5:1');
  }
});

test('native build ships versioned modules and only safe allowlisted public options', async (t) => {
  const config = fresh();
  config.browserOpening = { mode: 'native', internalNote: 'RUNTIME_PRIVATE_MARKER', labels: { unconfirmed: '</script><script>injection</script>' } };
  config.ageAcknowledgment = { enabled: true, internalNote: 'RUNTIME_PRIVATE_MARKER' };
  config.analytics.ga4MeasurementId = 'G-TEST1234';
  const { html, outDir } = await built(t, { config });
  assert.ok(html.includes('type="module"'));
  assert.ok(html.includes('id="age-notice"'));
  const runtime = html.match(/id="profile-options" type="application\/json">(.*?)<\/script>/s)[1];
  assert.doesNotMatch(runtime, /RUNTIME_PRIVATE_MARKER|<script>|<\/script>/);
  assert.equal(JSON.parse(runtime).browserOpening.labels.unconfirmed, config.browserOpening.labels.unconfirmed);
  const script = html.match(/type="module" src="\.\/([^\"]+)"/)[1];
  assert.match(await readFile(path.join(outDir, script), 'utf8'), /initialize/);
  const headers = await readFile(path.join(outDir, '_headers'), 'utf8');
  assert.match(headers, /www\.googletagmanager\.com/);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
  assert.ok(!(await readdir(outDir)).includes('site.json'));
});

test('two deployments built from identical source isolate branding and runtime settings', async (t) => {
  const left = fresh(); left.name = 'Site Alpha'; left.browserOpening = { mode: 'native' };
  const right = fresh(); right.name = 'Site Beta'; right.primaryLink.url = 'https://beta.example/projects';
  const a = await built(t, { config: left }); const b = await built(t, { config: right });
  assert.match(a.html, /Site Alpha/); assert.doesNotMatch(a.html, /Site Beta|beta\.example/);
  assert.match(b.html, /Site Beta/); assert.doesNotMatch(b.html, /Site Alpha|type="module"/);
});
