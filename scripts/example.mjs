import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, root, validateConfig, PLACEHOLDER_URL } from './config.mjs';
import { normalizeFeatures } from './features.mjs';
import { compileTheme } from './theme.mjs';
import { renderPage, renderMoreSoon } from './render.mjs';

export async function exampleHTML() {
  // Never consult the environment or local deployment config in this path.
  const config = normalizeFeatures(await readJSON(path.join(root, 'config/site.example.json'), 'Example configuration'));
  config.siteUrl = ''; config.placeholderLinks = true;
  config.analytics.cloudflareToken = ''; config.ageAcknowledgment.enabled = false;
  validateConfig(config);
  if (config.profile.image || config.seo.image || [config.primaryLink, ...config.secondaryLinks].some(link => link.url !== PLACEHOLDER_URL)) throw new Error('Standalone example requires no images and the built-in More soon destination.');
  const theme = await readJSON(path.join(root, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(theme, config.styles ?? {});
  const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
  const { html } = renderPage({ config, template, assetVersion: '', enhanced: false, placeholderHref: './more-soon.html' });
  return html.replace('<html lang="en">', '<!-- Generated neutral snapshot. Refresh with npm run example:refresh. -->\n<html lang="en">')
    .replace(/\s*<link rel="icon"[^>]+>/, '')
    .replace(/<link rel="stylesheet"[^>]+>/, () => `<style>\n${css}</style>`)
    .replace(/^[ \t]+$/gm, '');
}

export async function moreSoonHTML() {
  const config = await readJSON(path.join(root, 'config/site.example.json'), 'Example configuration');
  const theme = await readJSON(path.join(root, 'config/theme.json'), 'Theme configuration');
  const template = await readFile(path.join(root, 'src/more-soon.html'), 'utf8');
  return renderMoreSoon({ template, css: compileTheme(theme, config.styles ?? {}), standalone: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [example, moreSoon] = await Promise.all([exampleHTML(), moreSoonHTML()]);
    await Promise.all([writeFile(path.join(root, 'example.html'), example), writeFile(path.join(root, 'more-soon.html'), moreSoon)]);
    console.log('Updated standalone example and More soon page from neutral inputs.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
