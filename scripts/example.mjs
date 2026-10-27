import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, root, validateConfig } from './config.mjs';
import { normalizeFeatures } from './features.mjs';
import { compileTheme } from './theme.mjs';
import { renderPage } from './render.mjs';

export async function exampleHTML() {
  // Never consult the environment or local deployment config in this path.
  const config = normalizeFeatures(await readJSON(path.join(root, 'config/site.example.json'), 'Example configuration'));
  config.siteUrl = ''; config.placeholderLinks = true;
  config.analytics.cloudflareToken = ''; config.ageAcknowledgment.enabled = false;
  validateConfig(config);
  if (config.profile.image || config.seo.image || [config.primaryLink, ...config.secondaryLinks].some(link => new URL(link.url).hostname !== 'example.com')) throw new Error('Standalone example requires no images and example.com destinations.');
  const theme = await readJSON(path.join(root, 'config/theme.json'), 'Theme configuration');
  const css = compileTheme(theme, config.styles ?? {});
  const template = await readFile(path.join(root, 'src/index.html'), 'utf8');
  const { html } = renderPage({ config, template, assetVersion: '', enhanced: false, showSetupGuide: true });
  return html.replace('<html lang="en">', '<!-- Generated neutral snapshot. Refresh with npm run example:refresh. -->\n<html lang="en">')
    .replace(/\s*<link rel="icon"[^>]+>/, '')
    .replace(/<link rel="stylesheet"[^>]+>/, () => `<style>\n${css}</style>`)
    .replace(/^[ \t]+$/gm, '');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await writeFile(path.join(root, 'example.html'), await exampleHTML());
    console.log('Updated standalone example from neutral sample and shared renderer.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
