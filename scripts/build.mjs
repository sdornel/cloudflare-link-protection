import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHTML, httpsURL, resolveConfig, readJSON, root, validateConfig } from './config.mjs';
import { compileTheme } from './theme.mjs';

export { root, escapeHTML, validateConfig } from './config.mjs';
const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
};

function renderLink(link, primary = false) {
  const icon = icons[link.icon] ? `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[link.icon]}</svg>` : '';
  return `<a class="link${primary ? ' link-primary' : ''}" href="${escapeHTML(link.url)}" title="${escapeHTML(new URL(link.url).hostname)}"><span>${escapeHTML(link.label)}</span>${icon}</a>`;
}

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
  config = selected.config;
  const privateAssets = privateBuild || ['local', 'environment'].includes(selected.source);
  assetDirectory ??= path.join(projectRoot, privateAssets ? '.private/assets' : 'public/images');
  validateConfig(config, { production });
  const baseTheme = await readJSON(path.join(projectRoot, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(baseTheme, config.styles ?? {});
  const profile = await imageAsset(config.profile.image, 'profile.image', assetDirectory);
  const share = await imageAsset(config.seo.image, 'seo.image', assetDirectory);
  const template = await readFile(path.join(projectRoot, 'src/index.html'), 'utf8');
  let headers = await readFile(path.join(projectRoot, 'public/_headers'), 'utf8');
  const imageOrigins = [...new Set([profile?.origin, share?.origin].filter(Boolean))];
  if (imageOrigins.length) headers = headers.replace("img-src 'self';", `img-src 'self' ${imageOrigins.join(' ')};`);
  const assetVersion = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const indexable = Boolean(config.siteUrl && !config.placeholderLinks);
  const siteURL = config.siteUrl ? new URL('/', config.siteUrl).href : '';
  const seo = [];
  if (siteURL) {
    seo.push(`<link rel="canonical" href="${escapeHTML(siteURL)}">`, `<meta property="og:url" content="${escapeHTML(siteURL)}">`);
    if (share) seo.push(`<meta property="og:image" content="${escapeHTML(new URL(share.src, siteURL).href)}">`, `<meta property="og:image:alt" content="${escapeHTML(config.seo.imageAlt)}">`);
  }
  const tokens = {
    TITLE: escapeHTML(config.seo.title), DESCRIPTION: escapeHTML(config.description),
    NAME: escapeHTML(config.name), BIO: escapeHTML(config.bio), BACKGROUND: config.appearance.browserThemeColor,
    COLOR_SCHEME: config.appearance.colorScheme, ROBOTS: indexable ? 'index, follow' : 'noindex, follow', SEO: seo.join('\n    '),
    TWITTER_CARD: siteURL && share ? 'summary_large_image' : 'summary', ASSET_VERSION: assetVersion,
    AVATAR: profile ? `<img src="${escapeHTML(profile.src)}" alt="${escapeHTML(config.profile.alt)}" width="124" height="124" fetchpriority="high" decoding="async">` : `<span aria-hidden="true">${escapeHTML(config.profile.initials)}</span>`,
    PRIMARY_LINK: renderLink(config.primaryLink, true),
    SECONDARY_LINKS: config.secondaryLinks.filter((link) => link.enabled).map((link) => renderLink(link)).join('\n          '),
    PREVIEW_NOTE: config.placeholderLinks && config.previewNote ? `<p class="preview-note">${escapeHTML(config.previewNote)}</p>` : '',
    ANALYTICS: config.analytics.cloudflareToken ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${config.analytics.cloudflareToken}"}'></script>` : '',
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error('Unknown template token.');
    return tokens[key];
  });
  // Validate before replacing generated output. Only explicitly referenced images are copied.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const asset of [profile, share].filter((asset) => asset?.source)) {
    const target = path.join(outDir, asset.target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(asset.source, target);
  }
  const notFound = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | ${escapeHTML(config.name)}</title><link rel="stylesheet" href="/styles.css?v=${assetVersion}"><main class="page"><h1>Page not found</h1><p><a class="link" href="/">Back to ${escapeHTML(config.name)}</a></p></main></html>\n`;
  await Promise.all([
    writeFile(path.join(outDir, 'index.html'), html), writeFile(path.join(outDir, 'styles.css'), css),
    writeFile(path.join(outDir, '_headers'), headers), writeFile(path.join(outDir, '404.html'), notFound),
    writeFile(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n${indexable ? `\nSitemap: ${siteURL}sitemap.xml\n` : ''}`),
    writeFile(path.join(outDir, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${config.appearance.faviconBackground}"/><text x="32" y="41" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" fill="${config.appearance.faviconText}">${escapeHTML(config.profile.initials)}</text></svg>\n`),
  ]);
  if (indexable) await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHTML(siteURL)}</loc></url></urlset>\n`);
  return { outDir, privateBuild, configSource: selected.source, indexable, htmlBytes: Buffer.byteLength(html), cssBytes: Buffer.byteLength(css) };
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
