import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { build } from './build.mjs';
import { readJSON, root, validateConfig } from './config.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const ID = /^[a-f0-9]{32}$/i;
const SETTINGS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_WORKER_NAME', 'SITE_PRODUCTION_BRANCH', 'CLOUDFLARE_BUILD_TRIGGER_ID'];
class SyncError extends Error {}
const fail = message => { throw new SyncError(message); };

export function syncOptions(args) {
  if (args.some(arg => !['--dry-run', '--deploy', '--help'].includes(arg))) fail('Use --dry-run, --deploy, or --help.');
  if (args.includes('--dry-run') && args.includes('--deploy')) fail('Choose either --dry-run or --deploy.');
  return { dryRun: args.includes('--dry-run'), deploy: args.includes('--deploy'), help: args.includes('--help') };
}

export async function connectionSettings(projectRoot, env) {
  let saved = {};
  try { saved = parseEnv(await readFile(path.join(projectRoot, '.env.cloudflare'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') fail('Could not read .env.cloudflare. Check its permissions and environment-file syntax.'); }
  const values = Object.fromEntries(SETTINGS.map(key => [key, env[key] ?? saved[key]]));
  const account = values.CLOUDFLARE_ACCOUNT_ID, token = values.CLOUDFLARE_API_TOKEN, worker = values.CLOUDFLARE_WORKER_NAME;
  const branch = values.SITE_PRODUCTION_BRANCH ?? 'main', trigger = values.CLOUDFLARE_BUILD_TRIGGER_ID;
  if (!ID.test(account ?? '')) fail('Set CLOUDFLARE_ACCOUNT_ID in .env.cloudflare to your 32-character account ID.');
  if (typeof token !== 'string' || !token || /\s/.test(token)) fail('Set CLOUDFLARE_API_TOKEN in .env.cloudflare. See docs/cloudflare.md for the required permissions.');
  if (typeof worker !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(worker)) fail('Set CLOUDFLARE_WORKER_NAME in .env.cloudflare to the existing Worker name.');
  if (typeof branch !== 'string' || !branch || /[\s*?\[\]\\]/.test(branch)) fail('SITE_PRODUCTION_BRANCH must be an exact branch name, without wildcard patterns.');
  if (trigger !== undefined && !UUID.test(trigger)) fail('CLOUDFLARE_BUILD_TRIGGER_ID must be a build-trigger UUID, or omitted.');
  return { account, token, worker, branch, trigger };
}

export async function prepareLocalConfig(projectRoot = root) {
  let config;
  try {
    config = await readJSON(path.join(projectRoot, 'config/site.json'), 'config/site.json');
    validateConfig(config);
  } catch { fail('A valid local config/site.json is required. Run npm run build to check its fields; no configuration was uploaded.'); }
  if ([config.profile.image, config.seo.image].some(value => value.startsWith('/images/'))) {
    fail('GitHub builds cannot read ignored local images. Use HTTPS image URLs or initials before syncing.');
  }
  const value = JSON.stringify(config);
  if (value.length > 5000) fail('Compact config/site.json exceeds the 5,000-character build-variable limit. No configuration was uploaded.');
  const directory = await mkdtemp(path.join(tmpdir(), 'profile-config-sync-'));
  try { await build({ config, projectRoot, outDir: directory }); }
  catch { fail('Local configuration failed build validation. Run npm run build for details; no configuration was uploaded.'); }
  finally { await rm(directory, { recursive: true, force: true }); }
  return value;
}

export function selectProductionTrigger(triggers, { branch, trigger, tag }) {
  if (!Array.isArray(triggers)) fail('Cloudflare returned an unsupported trigger list. No build settings were changed.');
  const matches = triggers.filter(item => item && !item.deleted_on && UUID.test(item.trigger_uuid ?? '')
    && item.external_script_id === tag && item.repo_connection?.provider_type === 'github'
    && !item.repo_connection.deleted_on
    && Array.isArray(item.branch_includes) && item.branch_includes.length === 1 && item.branch_includes[0] === branch
    && Array.isArray(item.branch_excludes) && item.branch_excludes.length === 0
    && (!trigger || item.trigger_uuid === trigger));
  if (matches.length !== 1) fail('Could not select exactly one production-only GitHub build trigger. Check the Worker, branch filters, and optional CLOUDFLARE_BUILD_TRIGGER_ID. No configuration was uploaded.');
  return matches[0].trigger_uuid;
}

// Never expose provider responses: errors and build metadata may contain secrets.
async function requestAPI(endpoint, token, fetchImpl, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetchImpl(API + endpoint, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { fail('Cloudflare request could not complete (network, timeout, or redirect). Check dashboard state before retrying; a write may already have applied.'); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) fail('Cloudflare denied the request. Check the user API token, account scope, Workers CI Write and Workers Scripts Read permissions.');
    if (response.status === 429) fail('Cloudflare rate-limited the request. No automatic retry was made.');
    fail(`Cloudflare returned HTTP ${response.status}. Response details are withheld; check dashboard state before retrying.`);
  }
  let data;
  try { data = await response.json(); } catch { fail('Cloudflare returned an unreadable response. Check dashboard state before retrying.'); }
  if (data?.success !== true || data.errors?.length) fail('Cloudflare did not confirm the request. Response details are withheld; check dashboard state before retrying.');
  return data;
}

export async function syncCloudflareConfig({ projectRoot = root, env = process.env, fetchImpl = fetch, dryRun = false, deploy = false, log = console.log } = {}) {
  if (env.CI || env.WORKERS_CI === '1' || env.CF_PAGES === '1') fail('Config sync is a local operator command; do not run it inside CI or Cloudflare build/deploy commands.');
  if (dryRun && deploy) fail('Choose either --dry-run or --deploy.');
  const value = await prepareLocalConfig(projectRoot);
  log('Local config/site.json passed build validation.');
  if (dryRun) { log('Dry run complete. No network requests or Cloudflare changes.'); return { synced: false, buildRequested: false }; }
  const settings = await connectionSettings(projectRoot, env);
  const base = `/accounts/${settings.account}`;
  const request = (endpoint, options) => requestAPI(base + endpoint, settings.token, fetchImpl, options);
  const workers = await request('/workers/scripts');
  if (!Array.isArray(workers.result) || (workers.result_info?.total_pages ?? 1) > 1) fail('Cloudflare returned an unsupported or paginated Worker list. No build settings were changed.');
  const matches = workers.result.filter(item => item.id === settings.worker && ID.test(item.tag ?? ''));
  if (matches.length !== 1) fail('The configured Worker could not be identified in this account. No build settings were changed.');
  const tag = matches[0].tag;
  const triggers = await request(`/builds/workers/${tag}/triggers`);
  if ((triggers.result_info?.total_pages ?? 1) > 1) fail('Cloudflare returned a paginated trigger list. No build settings were changed.');
  const trigger = selectProductionTrigger(triggers.result, { ...settings, tag });
  const variables = `/builds/triggers/${trigger}/environment_variables`;
  const existing = await request(variables);
  if (!existing.result || typeof existing.result !== 'object' || Array.isArray(existing.result)) {
    fail('Cloudflare returned an unreadable build-variable list. No configuration was uploaded.');
  }
  const branchVariable = existing.result?.SITE_PRODUCTION_BRANCH;
  if ((branchVariable === undefined ? 'main' : branchVariable.value) !== settings.branch) {
    fail('The remote SITE_PRODUCTION_BRANCH build variable does not match the selected branch, or is unreadable. Set it to the same branch before syncing; no configuration was uploaded.');
  }
  log('Selected the production-only GitHub trigger. Updating SITE_CONFIG_JSON as a build secret.');
  await request(variables, { method: 'PATCH', body: { SITE_CONFIG_JSON: { value, is_secret: true } } });
  let stored;
  try { stored = await request(variables); }
  catch { fail('The build-secret update was accepted, but its secret flag could not be verified. Check Cloudflare before building.'); }
  if (stored.result?.SITE_CONFIG_JSON?.is_secret !== true) fail('Cloudflare accepted the update but did not confirm SITE_CONFIG_JSON is secret. Check the build variables before publishing.');
  log('SITE_CONFIG_JSON synced as a secret. Other variables and runtime keys were not changed.');
  if (!deploy) {
    log('The live site has not been rebuilt. Push reviewed code to the production branch, or use --deploy for a configuration-only rebuild.');
    return { synced: true, buildRequested: false };
  }
  let requested;
  try { requested = await request(`/builds/triggers/${trigger}/builds`, { method: 'POST', body: { branch: settings.branch } }); }
  catch { fail('The config was synced, but the build request could not be confirmed. Check Builds before retrying to avoid duplicate deployments.'); }
  if (!UUID.test(requested.result?.build_uuid ?? '')) fail('The config was synced, but Cloudflare returned no valid build ID. Check Builds before retrying.');
  log('Cloudflare accepted the build request for the GitHub production branch. Check Builds for the final result; deployment is not yet confirmed.');
  return { synced: true, buildRequested: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = syncOptions(process.argv.slice(2));
    if (options.help) console.log('Usage: npm run config:sync -- [--dry-run | --deploy]\nUploads local config/site.json as a production build secret. --deploy requests a GitHub rebuild.\nSet up .env.cloudflare once; see docs/cloudflare.md#sync-private-configuration-without-dashboard-copying.');
    else await syncCloudflareConfig(options);
  } catch (error) {
    console.error(`Config sync failed: ${error instanceof SyncError ? error.message : 'Unexpected local error. No private error details are printed; check local files and Cloudflare state.'}`);
    process.exitCode = 1;
  }
}
