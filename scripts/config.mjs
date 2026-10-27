import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function parseJSON(text, label) {
  // JSON.parse errors can contain input. Never echo private config into logs.
  try { return JSON.parse(text); } catch { throw new Error(`${label} must contain valid JSON.`); }
}

export async function readJSON(file, label) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch { throw new Error(`${label} could not be read.`); }
  return parseJSON(text, label);
}

export async function loadConfig({ privateBuild = false, env = process.env, projectRoot = root } = {}) {
  if (!privateBuild) return readJSON(path.join(projectRoot, 'config/site.example.json'), 'Public configuration');
  if (env.CF_PAGES === '1' && env.CF_PAGES_BRANCH !== (env.SITE_PRODUCTION_BRANCH || 'main')) {
    throw new Error('Private builds are restricted to the configured production branch. Use a public build for previews.');
  }
  if (env.SITE_CONFIG_JSON !== undefined) return parseJSON(env.SITE_CONFIG_JSON, 'SITE_CONFIG_JSON');
  if (env.CF_PAGES === '1') throw new Error('Private build requires SITE_CONFIG_JSON in the production build environment.');
  return readJSON(path.join(projectRoot, 'config/site.json'), 'Private configuration (config/site.json)');
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be nonempty text.`);
}

export function httpsURL(value, field) {
  requireText(value, field);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${field} must be a complete HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field} must use HTTPS without embedded credentials.`);
  return url;
}

export function validateConfig(config, { production = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be an object.');
  for (const field of ['name', 'bio', 'description']) requireText(config[field], field);
  requireText(config.profile?.initials, 'profile.initials');
  requireText(config.seo?.title, 'seo.title');
  if (typeof config.placeholderLinks !== 'boolean') throw new Error('placeholderLinks must be true or false.');
  if (typeof config.previewNote !== 'string') throw new Error('previewNote must be text.');
  if (!Array.isArray(config.secondaryLinks)) throw new Error('secondaryLinks must be an array.');
  for (const link of config.secondaryLinks) {
    if (typeof link?.enabled !== 'boolean') throw new Error('Each secondary link needs enabled: true or false.');
  }
  for (const [index, link] of [config.primaryLink, ...config.secondaryLinks.filter((link) => link.enabled)].entries()) {
    const field = index === 0 ? 'primaryLink' : `secondaryLinks[${index - 1}]`;
    requireText(link?.label, `${field}.label`);
    httpsURL(link.url, `${field}.url`);
    if (!['none', 'arrow', 'heart'].includes(link.icon ?? 'none')) throw new Error(`${field}.icon must be none, arrow, or heart.`);
  }
  if (typeof config.siteUrl !== 'string') throw new Error('siteUrl must be text.');
  if (config.siteUrl) {
    const url = httpsURL(config.siteUrl, 'siteUrl');
    if (url.pathname !== '/' || url.search || url.hash) throw new Error('siteUrl must be an HTTPS origin without a path, query, or fragment.');
  }
  if (production && (!config.siteUrl || config.placeholderLinks)) throw new Error('Before production: set siteUrl, replace example links, and set placeholderLinks to false.');
  for (const section of ['profile', 'seo']) {
    const value = config[section]?.image;
    if (typeof value !== 'string') throw new Error(`${section}.image must be a path, HTTPS URL, or empty string.`);
    if (value) requireText(config[section][section === 'seo' ? 'imageAlt' : 'alt'], `${section}.imageAlt/alt`);
  }
  for (const field of ['browserThemeColor', 'faviconBackground', 'faviconText']) {
    if (!/^#[0-9a-f]{6}$/i.test(config.appearance?.[field] ?? '')) throw new Error(`appearance.${field} must be a six-digit hex color.`);
  }
  if (!['light', 'dark', 'light dark', 'dark light'].includes(config.appearance.colorScheme)) throw new Error('appearance.colorScheme must be light, dark, light dark, or dark light.');
  const token = config.analytics?.cloudflareToken;
  if (typeof token !== 'string' || (token && !/^[a-f0-9]{32}$/i.test(token))) throw new Error('analytics.cloudflareToken must be empty or a 32-character Web Analytics token.');
  return config;
}
