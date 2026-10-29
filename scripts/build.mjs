import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHTML, httpsURL, resolveConfig, readJSON, root, validateConfig } from './config.mjs';
import { compileTheme } from './theme.mjs';
import { normalizeFeatures } from './features.mjs';
import { renderPage, renderMoreSoon } from './render.mjs';
import { compileLanding } from './landing.mjs';
import { compileVerification, verificationManifest } from './verification.mjs';

export { root, escapeHTML, validateConfig } from './config.mjs';
async function imageAsset(value, field, assetDirectory, assetBase) {
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
    return { src: `${assetBase}${value.slice(1)}`, source, target: value.slice(1) };
  } catch {
    throw new Error(`${field} could not be read from the selected assets directory.`);
  }
}

async function compilePage({ config, projectRoot, assetDirectory, showSetupGuide = false, production = false, pagePath }) {
  validateConfig(config, { production });
  config = normalizeFeatures(config);
  // Internal demo routing is independent of the selected creator's reserved path validation.
  if (pagePath !== undefined) config.profilePath = pagePath;
  const directory = config.profilePath && config.profilePath !== '/' ? config.profilePath.slice(1) : '';
  const assetBase = directory ? `/${directory}/` : './';
  const baseTheme = await readJSON(path.join(projectRoot, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(baseTheme, config.styles ?? {});
  const profile = await imageAsset(config.profile.image, 'profile.image', assetDirectory, assetBase);
  const share = await imageAsset(config.seo.image, 'seo.image', assetDirectory, assetBase);
  const template = await readFile(path.join(projectRoot, 'src/index.html'), 'utf8');
  const assetVersion = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const enhanced = config.browserOpening.mode === 'native' || [config.primaryLink, ...config.secondaryLinks.filter((link) => link.enabled)].some((link) => link.openingMode === 'native') || config.ageAcknowledgment.enabled || Boolean(config.analytics.ga4MeasurementId) || config.analytics.debug;
  const clients = [];
  if (enhanced) {
    for (const file of (await readdir(path.join(projectRoot, 'src/client'))).filter((file) => file.endsWith('.js')).sort()) {
      clients.push({ file, source: await readFile(path.join(projectRoot, 'src/client', file), 'utf8') });
    }
  }
  const clientVersion = createHash('sha256').update(clients.map(({ file, source }) => file + source).join('')).digest('hex').slice(0, 12);
  const rendered = renderPage({ config, template, profile, share, assetVersion, clientVersion, enhanced, showSetupGuide });
  return { config, directory, css, profile, share, assetVersion, clients, clientVersion, ...rendered };
}

async function writePage(outDir, page) {
  const { directory, html, css, config, profile, share, clients, clientVersion } = page;
  const pageDirectory = path.join(outDir, directory);
  await mkdir(pageDirectory, { recursive: true });
  for (const asset of [profile, share].filter((asset) => asset?.source)) {
    const target = path.join(pageDirectory, asset.target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(asset.source, target);
  }
  if (clients.length) {
    const clientOutput = path.join(pageDirectory, 'assets', clientVersion);
    await mkdir(clientOutput, { recursive: true });
    await Promise.all(clients.map(({ file, source }) => writeFile(path.join(clientOutput, file), source)));
  }
  await Promise.all([
    writeFile(path.join(pageDirectory, 'index.html'), html),
    writeFile(path.join(pageDirectory, 'styles.css'), css),
    writeFile(path.join(pageDirectory, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${config.appearance.faviconBackground}"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="${config.appearance.faviconText}">${escapeHTML(config.profile.initials)}</text></svg>\n`),
  ]);
}

export async function build({ config, privateBuild = false, exampleBuild = false, production = false, env = process.env,
  projectRoot = root,
  outDir = path.join(projectRoot, privateBuild ? 'dist-private' : 'dist'),
  assetDirectory,
} = {}) {
  if (privateBuild && exampleBuild) throw new Error('Choose either --private or --example.');
  const selected = config == null ? await resolveConfig({ privateBuild, exampleBuild, env, projectRoot }) : { config, source: 'provided' };
  validateConfig(selected.config, { production });
  const privateAssets = privateBuild || ['local', 'environment'].includes(selected.source);
  assetDirectory ??= path.join(projectRoot, privateAssets ? '.private/assets' : 'public/images');
  const neutral = selected.source === 'example' ? selected : await resolveConfig({ exampleBuild: true, projectRoot });
  const demo = await compilePage({
    config: { ...neutral.config, profilePath: '/', siteUrl: '', placeholderLinks: true }, pagePath: '/example',
    projectRoot, assetDirectory: path.join(projectRoot, 'public/images'),
  });
  const moreSoon = renderMoreSoon({ template: await readFile(path.join(projectRoot, 'src/more-soon.html'), 'utf8'), assetVersion: demo.assetVersion });
  const profilePage = selected.source === 'example' ? null : await compilePage({ config: selected.config, projectRoot, assetDirectory, production });
  const pages = [];
  if (!profilePage || profilePage.directory) {
    // Only explicit landing overrides are used; creator display fields never become root content.
    pages.push(await compileLanding({ projectRoot,
      overrides: selected.source === 'example' ? {} : selected.config.landing,
      siteUrl: selected.source === 'example' ? '' : selected.config.siteUrl,
    }));
  } else pages.push(profilePage); // Preserve older customized root-profile deployments.
  pages.push(demo);
  if (profilePage?.directory) pages.push(profilePage);
  let headers = await readFile(path.join(projectRoot, 'public/_headers'), 'utf8');
  const imageOrigins = [...new Set(pages.flatMap(({ profile, share }) => [profile?.origin, share?.origin]).filter(Boolean))];
  if (imageOrigins.length) headers = headers.replace("img-src 'self';", `img-src 'self' ${imageOrigins.join(' ')};`);
  if (pages.some(({ config }) => config.analytics.ga4MeasurementId)) {
    headers = headers.replace("script-src 'self'", "script-src 'self' https://www.googletagmanager.com")
      .replace("img-src 'self'", "img-src 'self' https://www.googletagmanager.com https://*.google-analytics.com")
      .replace("connect-src 'self'", "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com");
  }
  const verification = profilePage ? await compileVerification({ config: selected.config, profile: profilePage, projectRoot }) : null;
  if (verification && env.CF_PAGES === '1') throw new Error('Branded verification requires the Cloudflare Worker deployment, not Pages static hosting.');
  const manifest = verificationManifest({ pages, headers, verification });
  // Compile every page before replacing output. Only referenced images are copied.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await Promise.all(pages.map((page) => writePage(outDir, page)));
  await mkdir(path.join(outDir, '_verification'), { recursive: true });
  await writeFile(path.join(outDir, '_verification/manifest.json'), JSON.stringify(manifest));
  if (verification) {
    await writeFile(path.join(outDir, '_verification/styles.css'), verification.css);
    await writeFile(path.join(outDir, '_verification/client.js'), verification.client);
  }
  await mkdir(path.join(outDir, 'example/more-soon'), { recursive: true });
  await writeFile(path.join(outDir, 'example/more-soon/index.html'), moreSoon);
  const rootPage = pages[0];
  const indexable = pages.some((page) => page.indexable);
  const sitemapURL = indexable ? new URL('/sitemap.xml', profilePage.config.siteUrl).href : '';
  const notFound = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | ${escapeHTML(rootPage.config.name)}</title><link rel="stylesheet" href="/styles.css?v=${rootPage.assetVersion}"><main class="page"><h1>Page not found</h1><p><a class="link" href="/">Back to ${escapeHTML(rootPage.config.name)}</a></p></main></html>\n`;
  await Promise.all([
    writeFile(path.join(outDir, '_headers'), headers), writeFile(path.join(outDir, '404.html'), notFound),
    writeFile(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n${indexable ? `\nSitemap: ${sitemapURL}\n` : ''}`),
  ]);
  if (indexable) await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter((page) => page.indexable).map((page) => `<url><loc>${escapeHTML(page.siteURL)}</loc></url>`).join('')}</urlset>\n`);
  return { outDir, privateBuild, configSource: selected.source, indexable, pageCount: pages.length + 1, verificationEnabled: Boolean(verification),
    htmlBytes: pages.reduce((sum, page) => sum + Buffer.byteLength(page.html), Buffer.byteLength(moreSoon)),
    cssBytes: pages.reduce((sum, page) => sum + Buffer.byteLength(page.css), 0),
    jsBytes: pages.reduce((sum, page) => sum + page.clients.reduce((bytes, item) => bytes + Buffer.byteLength(item.source), 0), 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => !['--private', '--example', '--production'].includes(arg))) throw new Error('Supported build options: --private, --example, --production.');
    const result = await build({ privateBuild: process.argv.includes('--private'), exampleBuild: process.argv.includes('--example'), production: process.argv.includes('--production') });
    const source = { example: 'config/site.example.json', local: 'config/site.json', environment: 'SITE_CONFIG_JSON' }[result.configSource];
    console.log(`Built ${result.privateBuild ? 'dist-private' : 'dist'} using ${source} (${result.pageCount} page(s), ${result.htmlBytes} bytes HTML, ${result.cssBytes} bytes CSS). ${result.indexable ? 'Search indexing enabled for configured pages.' : 'Pages use noindex.'}`);
    if (result.verificationEnabled) console.log('Branded verification enabled. Deploy with the Worker and configure its runtime keys; static-only hosting cannot enforce this gate.');
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
