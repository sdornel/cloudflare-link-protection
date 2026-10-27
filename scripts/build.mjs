import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHTML, httpsURL, resolveConfig, readJSON, root, validateConfig } from './config.mjs';
import { compileTheme } from './theme.mjs';
import { normalizeFeatures } from './features.mjs';
import { renderPage } from './render.mjs';

export { root, escapeHTML, validateConfig } from './config.mjs';
async function imageAsset(value, field, assetDirectory) {
  if (!value) return null;
  if (value.startsWith('https://')) {
    const url = httpsURL(value, field);
    if (url.hash) throw new Error(`${field} must not contain a fragment.`);
    return { src: url.href, origin: url.origin };
  }
  if (!/^\/images\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:webp|avif|png|jpe?g)$/i.test(value)) throw new Error(`${field} must be an HTTPS URL or a local /images/ raster filename.`);
  try {
    const base = await realpath(assetDirectory);
    const source = await realpath(path.join(base, value.slice('/images/'.length)));
    if (!source.startsWith(`${base}${path.sep}`) || !(await stat(source)).isFile()) throw new Error();
    return { src: `.${value}`, source, target: value.slice(1) };
  } catch {
    throw new Error(`${field} could not be read from the selected assets directory.`);
  }
}

export async function build({ config, privateBuild = false, exampleBuild = false, production = false, env = process.env,
  projectRoot = root,
  outDir = path.join(projectRoot, privateBuild ? 'dist-private' : 'dist'),
  assetDirectory,
} = {}) {
  if (privateBuild && exampleBuild) throw new Error('Choose either --private or --example.');
  const selected = config == null ? await resolveConfig({ privateBuild, exampleBuild, env, projectRoot }) : { config, source: 'provided' };
  validateConfig(selected.config, { production });
  config = normalizeFeatures(selected.config);
  const privateAssets = privateBuild || ['local', 'environment'].includes(selected.source);
  assetDirectory ??= path.join(projectRoot, privateAssets ? '.private/assets' : 'public/images');
  const baseTheme = await readJSON(path.join(projectRoot, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(baseTheme, config.styles ?? {});
  const profile = await imageAsset(config.profile.image, 'profile.image', assetDirectory);
  const share = await imageAsset(config.seo.image, 'seo.image', assetDirectory);
  const template = await readFile(path.join(projectRoot, 'src/index.html'), 'utf8');
  let headers = await readFile(path.join(projectRoot, 'public/_headers'), 'utf8');
  const imageOrigins = [...new Set([profile?.origin, share?.origin].filter(Boolean))];
  if (imageOrigins.length) headers = headers.replace("img-src 'self';", `img-src 'self' ${imageOrigins.join(' ')};`);
  const assetVersion = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const enhanced = config.browserOpening.mode === 'native' || [config.primaryLink, ...config.secondaryLinks.filter((link) => link.enabled)].some((link) => link.openingMode === 'native') || config.ageAcknowledgment.enabled || Boolean(config.analytics.ga4MeasurementId) || config.analytics.debug;
  const clients = [];
  if (enhanced) {
    for (const file of (await readdir(path.join(projectRoot, 'src/client'))).filter((file) => file.endsWith('.js')).sort()) {
      clients.push({ file, source: await readFile(path.join(projectRoot, 'src/client', file), 'utf8') });
    }
  }
  const clientVersion = createHash('sha256').update(clients.map(({ file, source }) => file + source).join('')).digest('hex').slice(0, 12);
  if (config.analytics.ga4MeasurementId) {
    headers = headers.replace("script-src 'self'", "script-src 'self' https://www.googletagmanager.com")
      .replace("img-src 'self'", "img-src 'self' https://www.googletagmanager.com https://*.google-analytics.com")
      .replace("connect-src 'self'", "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com");
  }
  const { html, indexable, siteURL } = renderPage({ config, template, profile, share, assetVersion, clientVersion, enhanced, showSetupGuide: selected.source === 'example' });
  // Validate before replacing generated output. Only explicitly referenced images are copied.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const asset of [profile, share].filter((asset) => asset?.source)) {
    const target = path.join(outDir, asset.target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(asset.source, target);
  }
  if (clients.length) {
    const clientOutput = path.join(outDir, 'assets', clientVersion);
    await mkdir(clientOutput, { recursive: true });
    await Promise.all(clients.map(({ file, source }) => writeFile(path.join(clientOutput, file), source)));
  }
  const notFound = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | ${escapeHTML(config.name)}</title><link rel="stylesheet" href="/styles.css?v=${assetVersion}"><main class="page"><h1>Page not found</h1><p><a class="link" href="/">Back to ${escapeHTML(config.name)}</a></p></main></html>\n`;
  await Promise.all([
    writeFile(path.join(outDir, 'index.html'), html), writeFile(path.join(outDir, 'styles.css'), css),
    writeFile(path.join(outDir, '_headers'), headers), writeFile(path.join(outDir, '404.html'), notFound),
    writeFile(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n${indexable ? `\nSitemap: ${siteURL}sitemap.xml\n` : ''}`),
    writeFile(path.join(outDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${config.appearance.faviconBackground}"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="${config.appearance.faviconText}">${escapeHTML(config.profile.initials)}</text></svg>\n`),
  ]);
  if (indexable) await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHTML(siteURL)}</loc></url></urlset>\n`);
  return { outDir, privateBuild, configSource: selected.source, indexable, htmlBytes: Buffer.byteLength(html), cssBytes: Buffer.byteLength(css), jsBytes: clients.reduce((sum, item) => sum + Buffer.byteLength(item.source), 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => !['--private', '--example', '--production'].includes(arg))) throw new Error('Supported build options: --private, --example, --production.');
    const result = await build({ privateBuild: process.argv.includes('--private'), exampleBuild: process.argv.includes('--example'), production: process.argv.includes('--production') });
    const source = { example: 'config/site.example.json', local: 'config/site.json', environment: 'SITE_CONFIG_JSON' }[result.configSource];
    console.log(`Built ${result.privateBuild ? 'dist-private' : 'dist'} using ${source} (${result.htmlBytes} bytes HTML, ${result.cssBytes} bytes CSS). ${result.indexable ? 'Search indexing enabled.' : 'Demo uses noindex.'}`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
