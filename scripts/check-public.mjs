import { spawnSync } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON, root } from './config.mjs';
import { verificationCopy } from './verification-config.mjs';

// Explicit source roots also make the pre-Git review possible without including local artifacts.
export const sourceRoots = ['.gitignore', 'README.md', 'SPEC.md', 'example.html', 'more-soon.html', 'package.json', 'package-lock.json', 'LICENSE', 'CONTRIBUTING.md', 'playwright.config.mjs', 'wrangler.jsonc', '.github', 'config', 'docs', 'public', 'scripts', 'src', 'tests'];
const forbidden = /(?:^|\/)(?:\.private|dist(?:-private)?|node_modules|\.aws|\.agents|\.codex|\.wrangler|\.env(?:\..*)?|\.dev\.vars(?:\..*)?|site(?:\.config)?\.json(?:\.[^/]*)?)(?:\/|$)|(?:^|\/)(?:test-results|playwright-report|browser-output|playwright\/\.auth)(?:\/|$)|\.(?:zip|log|pem|key|p12|pfx)$/i;

export async function publicFiles(projectRoot = root) {
  const files = [];
  async function visit(relative) {
    // This local-only file intentionally lives beside the tracked sample.
    if (/^config\/site(?:\.config)?\.json(?:\.[^/]*)?$/.test(relative)) return;
    if (forbidden.test(relative)) throw new Error('Private or generated file found inside public source roots.');
    const file = path.join(projectRoot, relative);
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error('Public source must not contain symbolic links.');
    if (info.isDirectory()) {
      for (const entry of (await readdir(file)).sort()) await visit(`${relative}/${entry}`);
    } else if (info.isFile()) files.push(relative);
  }
  for (const entry of sourceRoots) await visit(entry);
  return files.sort();
}

export async function auditPublic(projectRoot = root) {
  const files = await publicFiles(projectRoot);
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, encoding: 'utf8' });
  let gitChecked = false;
  // Git resolves filesystem aliases (including macOS /var -> /private/var).
  // Canonicalize both sides on every OS; do not hard-code a platform prefix.
  if (!top.error && top.status === 0 && await realpath(top.stdout.trim()) === await realpath(projectRoot)) {
    const tracked = spawnSync('git', ['ls-files', '--cached', '-z'], { cwd: projectRoot, encoding: 'utf8' });
    if (tracked.error || tracked.status !== 0) throw new Error('Could not inspect the Git index.');
    const unexpected = tracked.stdout.split('\0').filter(Boolean).filter((file) => forbidden.test(file) || !files.includes(file));
    if (unexpected.length) throw new Error(`${unexpected.length} tracked file(s) require review outside the allowed public source list. Remove private/generated data from the index before publication.`);
    gitChecked = true;
  }
  let privateChecked = false;
  const markers = [];
  const privatePath = path.join(projectRoot, 'config/site.json');
  let exists = true;
  try { await lstat(privatePath); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
  if (exists) {
    const privateConfig = await readJSON(privatePath, 'Local private configuration');
    const publicConfig = await readJSON(path.join(projectRoot, 'config/site.example.json'), 'Public configuration');
    const displayStrings = (config) => [
      config.name, config.bio, config.description, config.siteUrl, config.profilePath, config.profilePath?.slice(1), config.seo?.title,
      config.profile?.image, config.seo?.image, config.analytics?.cloudflareToken, config.analytics?.ga4MeasurementId,
      ...Object.values(config.landing ?? {}).filter(value => typeof value === 'string'),
      ...Object.values(config.verification?.copy ?? {}).filter(value => typeof value === 'string'),
      ...[config.primaryLink, ...(config.secondaryLinks ?? [])].flatMap((link) => [link?.label?.toLowerCase() === 'instagram' ? undefined : link?.label, link?.url]),
    ].filter((value) => typeof value === 'string' && value.length >= 8);
    const landingDefaults = await readJSON(path.join(projectRoot, 'config/landing.example.json'), 'Public landing defaults');
    const shared = new Set([...displayStrings({ ...publicConfig, landing: landingDefaults }), ...Object.values(verificationCopy)]);
    markers.push(...displayStrings(privateConfig).filter((value) => !shared.has(value)));
    privateChecked = true;
  }
  const termsPath = path.join(projectRoot, '.private/audit-terms.json');
  let termsExist = true;
  try { await lstat(termsPath); } catch (error) { if (error.code === 'ENOENT') termsExist = false; else throw error; }
  if (termsExist) {
    const terms = await readJSON(termsPath, 'Private audit terms');
    if (!Array.isArray(terms) || terms.some((term) => typeof term !== 'string' || term.trim().length < 3)) throw new Error('Private audit terms must be an array of strings at least three characters long.');
    markers.push(...terms.map((term) => term.trim()));
  }
  for (const file of files) {
    const text = await readFile(path.join(projectRoot, file), 'utf8');
    if (markers.some((value) => text.toLowerCase().includes(value.toLowerCase()))) {
      throw new Error(`Private display data or audit term appears in public source: ${file}. Values are omitted from this report.`);
    }
  }
  return { files, gitChecked, privateChecked, termsChecked: termsExist };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await auditPublic();
    if (process.env.CI && !result.gitChecked) throw new Error('CI requires Git index inspection; run from the repository root with Git available.');
    console.log(`Public source audit passed: ${result.files.length} files. ${result.gitChecked ? 'Git index inspected.' : 'Git index unavailable; checked known source roots only.'} ${result.privateChecked ? 'Compared local private display fields without printing them.' : 'No local private config available for comparison.'} ${result.termsChecked ? 'Private audit terms checked.' : ''}`);
  } catch (error) {
    console.error(`Publication check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
