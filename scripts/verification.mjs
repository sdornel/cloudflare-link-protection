import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { escapeHTML, readJSON } from './config.mjs';
import { compileTheme } from './theme.mjs';
import { normalizeVerification } from './verification-config.mjs';

export async function compileVerification({ config, profile, projectRoot }) {
  const settings = normalizeVerification(config.verification);
  if (!settings.enabled) return null;
  const theme = await readJSON(path.join(projectRoot, 'config/verification.theme.json'), 'Verification theme');
  const baseTheme = await readJSON(path.join(projectRoot, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(baseTheme, config.styles ?? {}) + compileTheme(theme, settings.styles);
  const client = await readFile(path.join(projectRoot, 'src/verification/client.js'), 'utf8');
  const version = createHash('sha256').update(css + client).digest('hex').slice(0, 12);
  const base = profile.directory ? `/${profile.directory}/` : '/';
  const imageURL = profile.profile?.src.replace(/^\.\//, '/');
  const avatar = profile.profile
    ? `<img src="${escapeHTML(imageURL)}" alt="${escapeHTML(config.profile.alt)}" width="84" height="84" decoding="async">`
    : `<span aria-hidden="true">${escapeHTML(config.profile.initials)}</span>`;
  const text = settings.copy;
  const tokens = {
    BACKGROUND: config.appearance.browserThemeColor, COLOR_SCHEME: config.appearance.colorScheme,
    NAME: escapeHTML(config.name), HEADING: escapeHTML(text.heading), DESCRIPTION: escapeHTML(text.description),
    FOOTER: escapeHTML(text.footer), RETRY: escapeHTML(text.retry), NO_SCRIPT: escapeHTML(text.noScript),
    FAVICON: `${base}favicon.svg`, AVATAR: avatar, WIDGET_THEME: settings.widgetTheme, VERSION: version,
    MESSAGES: ['loading', 'verifying', 'error', 'expired', 'unavailable'].map(key => `<span data-message="${key}">${escapeHTML(text[key])}</span>`).join(''),
  };
  const template = (await readFile(path.join(projectRoot, 'src/verification.html'), 'utf8')).replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (key.startsWith('VERIFICATION_')) return match;
    if (!Object.hasOwn(tokens, key)) throw new Error('Unknown verification template token.');
    return tokens[key];
  });
  return { css, client, manifest: {
    origin: new URL(config.siteUrl).origin, profilePath: config.profilePath || '/',
    sessionSeconds: settings.sessionMinutes * 60, template,
    messages: { loading: text.loading, error: text.error, expired: text.expired, unavailable: text.unavailable },
  } };
}

export function verificationManifest({ pages, headers, verification }) {
  const responseHeaders = Object.fromEntries(headers.split('\n\n')[0].split('\n').slice(1).filter(line => line.trim()).map(line => {
    const split = line.indexOf(':');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
  }));
  const publicPaths = new Set(['/robots.txt', '/sitemap.xml']);
  for (const page of pages) {
    const base = page.directory ? `/${page.directory}/` : '/';
    for (const file of ['styles.css', 'favicon.svg']) publicPaths.add(base + file);
    for (const item of page.clients) publicPaths.add(`${base}assets/${page.clientVersion}/${item.file}`);
    for (const item of [page.profile, page.share]) if (item?.source) publicPaths.add(base + item.target);
  }
  return { version: 1, enabled: Boolean(verification), responseHeaders,
    ...(verification ? { ...verification.manifest, publicPaths: [...publicPaths] } : {}) };
}
