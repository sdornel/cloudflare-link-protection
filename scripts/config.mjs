import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFeatures } from './features.mjs';
import { isHTTPS } from '../src/client/browser-opening.js';
import { normalizeVerification } from './verification-config.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const PLACEHOLDER_URL = '/example/more-soon/';
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

export async function resolveConfig({ privateBuild = false, exampleBuild = false, env = process.env, projectRoot = root } = {}) {
  if (privateBuild && exampleBuild) throw new Error('Choose either --private or --example.');
  const example = async () => ({
    config: await readJSON(path.join(projectRoot, 'config/site.example.json'), 'Example configuration'),
    source: 'example',
  });
  if (exampleBuild) return example();

  const cloudflareBuild = env.WORKERS_CI === '1' || env.CF_PAGES === '1';
  const cloudflareBranch = env.WORKERS_CI === '1' ? env.WORKERS_CI_BRANCH : env.CF_PAGES_BRANCH;
  const checkBranch = () => {
    if (cloudflareBuild && cloudflareBranch !== (env.SITE_PRODUCTION_BRANCH || 'main')) {
      throw new Error('Customized builds are restricted to the configured production branch. Use --example for previews.');
    }
  };
  if (privateBuild) checkBranch();
  if (env.SITE_CONFIG_JSON !== undefined) {
    checkBranch();
    return { config: parseJSON(env.SITE_CONFIG_JSON, 'SITE_CONFIG_JSON'), source: 'environment' };
  }
  if (privateBuild && cloudflareBuild) throw new Error('Private build requires SITE_CONFIG_JSON in the production build environment.');

  let local;
  try {
    local = await readFile(path.join(projectRoot, 'config/site.json'), 'utf8');
  } catch (error) {
    if (!privateBuild && error.code === 'ENOENT') return example();
    throw new Error('Private configuration (config/site.json) could not be read.');
  }
  checkBranch();
  return { config: parseJSON(local, 'config/site.json'), source: 'local' };
}

export async function loadConfig(options) {
  return (await resolveConfig(options)).config;
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be nonempty text.`);
}

export function httpsURL(value, field) {
  requireText(value, field);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${field} must be a complete HTTPS URL.`); }
  if (!isHTTPS(value)) throw new Error(`${field} must use HTTPS without embedded credentials, whitespace, or backslashes.`);
  return url;
}

export function validateLanding(config, { partial = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('landing must be an object.');
  const fields = ['name', 'initials', 'eyebrow', 'headline', 'description', 'ctaLabel', 'footer'];
  for (const field of fields) {
    if (partial && config[field] === undefined) continue;
    requireText(config[field], `landing.${field}`);
    if (config[field].length > 500) throw new Error(`landing.${field} must be at most 500 characters.`);
  }
  if (Object.keys(config).some(key => ![...fields, 'appearance', 'styles'].includes(key))) throw new Error('landing contains an unsupported field.');
  if (!partial || config.appearance !== undefined) {
    const appearance = config.appearance;
    if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) throw new Error('landing.appearance must be an object.');
    for (const field of ['browserThemeColor', 'faviconBackground', 'faviconText']) {
      if (partial && appearance[field] === undefined) continue;
      if (typeof appearance[field] !== 'string' || appearance[field].length !== 7 || !/^#[a-f0-9]{6}$/i.test(appearance[field])) throw new Error(`landing.appearance.${field} must be a six-digit hex color.`);
    }
    if ((!partial || appearance.colorScheme !== undefined) && !['light', 'dark', 'light dark', 'dark light'].includes(appearance.colorScheme)) throw new Error('landing.appearance.colorScheme is unsupported.');
    if (Object.keys(appearance).some(key => !['browserThemeColor', 'faviconBackground', 'faviconText', 'colorScheme'].includes(key))) throw new Error('landing.appearance contains an unsupported field.');
  }
  if (config.styles !== undefined && (!config.styles || typeof config.styles !== 'object' || Array.isArray(config.styles))) throw new Error('landing.styles must be an object.');
  return config;
}

export function validateConfig(config, { production = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be an object.');
  for (const field of ['name', 'description']) requireText(config[field], field);
  if (typeof config.bio !== 'string') throw new Error('bio must be text; use an empty string to hide it.');
  requireText(config.profile?.initials, 'profile.initials');
  requireText(config.seo?.title, 'seo.title');
  if (config.robots !== undefined) {
    if (!config.robots || typeof config.robots !== 'object' || Array.isArray(config.robots)) throw new Error('robots must be an object.');
    if (Object.keys(config.robots).some(key => key !== 'allowCrawling')) throw new Error('robots contains an unsupported field.');
    if (config.robots.allowCrawling !== undefined && typeof config.robots.allowCrawling !== 'boolean') throw new Error('robots.allowCrawling must be true or false.');
  }
  if (typeof config.placeholderLinks !== 'boolean') throw new Error('placeholderLinks must be true or false.');
  if (typeof config.previewNote !== 'string') throw new Error('previewNote must be text.');
  if (!Array.isArray(config.secondaryLinks)) throw new Error('secondaryLinks must be an array.');
  for (const link of config.secondaryLinks) {
    if (typeof link?.enabled !== 'boolean') throw new Error('Each secondary link needs enabled: true or false.');
  }
  for (const [index, link] of [config.primaryLink, ...config.secondaryLinks.filter((link) => link.enabled)].entries()) {
    const field = index === 0 ? 'primaryLink' : `secondaryLinks[${index - 1}]`;
    requireText(link?.label, `${field}.label`);
    if (link.url !== PLACEHOLDER_URL || !config.placeholderLinks) httpsURL(link.url, `${field}.url`);
    if (!['none', 'arrow', 'heart'].includes(link.icon ?? 'none')) throw new Error(`${field}.icon must be none, arrow, or heart.`);
  }
  if (typeof config.siteUrl !== 'string') throw new Error('siteUrl must be text.');
  if (config.profilePath !== undefined && (typeof config.profilePath !== 'string' ||
    (config.profilePath !== '/' && (!/^\/[a-z0-9][a-z0-9-]{0,63}(?![\s\S])/.test(config.profilePath) || ['/example', '/assets', '/images'].includes(config.profilePath))))) {
    throw new Error('profilePath must be / or one lowercase slug (1–64 letters, digits, or hyphens); example, assets and images are reserved.');
  }
  if (config.landing !== undefined) validateLanding(config.landing, { partial: true });
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
  normalizeFeatures(config);
  const verification = normalizeVerification(config.verification);
  if (verification.enabled && !config.siteUrl) throw new Error('siteUrl is required when verification is enabled.');
  return config;
}
