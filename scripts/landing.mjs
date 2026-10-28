import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { escapeHTML, readJSON, validateLanding } from './config.mjs';
import { compileTheme } from './theme.mjs';

export async function compileLanding({ projectRoot, overrides = {}, siteUrl = '' }) {
  const defaults = validateLanding(await readJSON(path.join(projectRoot, 'config/landing.example.json'), 'Landing defaults'));
  validateLanding(overrides, { partial: true });
  const landing = validateLanding({ ...defaults, ...overrides, appearance: { ...defaults.appearance, ...overrides.appearance } });
  const theme = await readJSON(path.join(projectRoot, 'config/landing.theme.json'), 'Landing theme');
  const css = compileTheme(theme, landing.styles ?? {});
  const assetVersion = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const siteURL = siteUrl ? new URL('/', siteUrl).href : '';
  const tokens = {
    NAME: landing.name, INITIALS: landing.initials, EYEBROW: landing.eyebrow,
    HEADLINE: landing.headline, DESCRIPTION: landing.description, CTA_LABEL: landing.ctaLabel,
    FOOTER: landing.footer, BACKGROUND: landing.appearance.browserThemeColor,
    COLOR_SCHEME: landing.appearance.colorScheme, ASSET_VERSION: assetVersion,
  };
  const template = await readFile(path.join(projectRoot, 'src/landing.html'), 'utf8');
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (key === 'SEO') return siteURL ? `<link rel="canonical" href="${escapeHTML(siteURL)}"><meta property="og:url" content="${escapeHTML(siteURL)}">` : '';
    if (!(key in tokens)) throw new Error('Unknown landing template token.');
    return escapeHTML(tokens[key]);
  });
  return { html, css, assetVersion, directory: '', clients: [], profile: null, share: null,
    indexable: false, siteURL, config: { name: landing.name, profile: { initials: landing.initials }, appearance: landing.appearance, analytics: {} } };
}
