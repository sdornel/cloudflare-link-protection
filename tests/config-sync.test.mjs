import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publicFiles } from '../scripts/check-public.mjs';
import { root } from '../scripts/config.mjs';
import { connectionSettings, prepareLocalConfig, selectProductionTrigger, syncCloudflareConfig, syncOptions } from '../scripts/sync-cloudflare-config.mjs';

const account = 'a'.repeat(32), tag = 'b'.repeat(32), trigger = '11111111-2222-3333-4444-555555555555';
const buildID = '99999999-2222-3333-4444-555555555555';
const token = 'local-token-must-not-appear-in-output';
const env = { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_WORKER_NAME: 'sample-worker' };
const productionTrigger = () => ({ trigger_uuid: trigger, external_script_id: tag, branch_includes: ['main'], branch_excludes: [], repo_connection: { provider_type: 'github' } });
const ok = result => Response.json({ success: true, errors: [], result });

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'config-sync-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of (await publicFiles()).filter(file => /^(config|public|src)\//.test(file))) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await cp(path.join(root, file), path.join(directory, file));
  }
  const config = JSON.parse(await readFile(path.join(directory, 'config/site.example.json'), 'utf8'));
  config.name = 'Private fixture canary'; config.siteUrl = 'https://profile.example'; config.profilePath = '/sample-creator';
  config.primaryLink.url = 'https://destination.example/private-fixture';
  const save = () => writeFile(path.join(directory, 'config/site.json'), JSON.stringify(config, null, 2));
  await save();
  await mkdir(path.join(directory, 'dist'));
  await writeFile(path.join(directory, 'dist/sentinel'), 'unchanged');
  const calls = [], messages = [];
  let respond = () => undefined;
  const fetchImpl = async (url, options) => {
    const call = { url, ...options, parsedBody: options.body && JSON.parse(options.body) }; calls.push(call);
    assert.ok(url.startsWith(`https://api.cloudflare.com/client/v4/accounts/${account}/`));
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.ok(options.signal instanceof AbortSignal);
    const override = respond(call); if (override !== undefined) return override;
    if (url.endsWith('/workers/scripts')) return ok([{ id: 'sample-worker', tag }]);
    if (url.endsWith('/triggers')) return ok([productionTrigger()]);
    if (url.endsWith('/environment_variables') && options.method === 'PATCH') return ok({});
    if (url.endsWith('/environment_variables')) return ok({ SITE_CONFIG_JSON: { is_secret: true, value: null } });
    if (url.endsWith('/builds')) return ok({ build_uuid: buildID, status: 'queued' });
    assert.fail('Unexpected API request.');
  };
  return { directory, config, save, calls, messages, respond: handler => { respond = handler; },
    run: options => syncCloudflareConfig({ projectRoot: directory, env, fetchImpl, log: text => messages.push(text), ...options }) };
}

test('dry run builds the explicit local config without credentials, network, or changing output', async t => {
  const f = await fixture(t);
  const before = (await readdir(tmpdir())).filter(name => name.startsWith('profile-config-sync-')).sort();
  assert.deepEqual(await f.run({ dryRun: true, env: { SITE_CONFIG_JSON: 'not the local config' } }), { synced: false, buildRequested: false });
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(await prepareLocalConfig(f.directory)).name, f.config.name);
  assert.equal(await readFile(path.join(f.directory, 'dist/sentinel'), 'utf8'), 'unchanged');
  assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith('profile-config-sync-')).sort(), before);
});

test('sync patches only the production build secret and verifies its secret flag', async t => {
  const f = await fixture(t);
  const preview = { ...productionTrigger(), trigger_uuid: buildID, branch_includes: ['*'], branch_excludes: ['main'] };
  f.respond(call => call.url.endsWith('/triggers') ? ok([preview, productionTrigger()]) : undefined);
  assert.deepEqual(await f.run(), { synced: true, buildRequested: false });
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'GET', 'PATCH', 'GET']);
  const update = f.calls[3];
  assert.ok(update.url.endsWith(`/triggers/${trigger}/environment_variables`));
  assert.deepEqual(update.parsedBody, { SITE_CONFIG_JSON: { value: JSON.stringify(f.config), is_secret: true } });
  assert.ok(!f.messages.join('\n').includes(f.config.name)); assert.ok(!f.messages.join('\n').includes(token));
  assert.ok(!f.calls.some(call => call.url.includes('/secrets') || call.url.endsWith('/builds')));
});

test('deploy requests a GitHub branch build only after syncing and verification', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.run({ deploy: true }), { synced: true, buildRequested: true });
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'GET', 'PATCH', 'GET', 'POST']);
  assert.deepEqual(f.calls[5].parsedBody, { branch: 'main' });
  assert.match(f.messages.at(-1), /deployment is not yet confirmed/);
});

test('missing, malformed, oversized, local-image, and invalid-style config fail before network', async t => {
  const f = await fixture(t);
  const file = path.join(f.directory, 'config/site.json');
  await rm(file);
  await assert.rejects(f.run(), /valid local config\/site.json/);
  await writeFile(file, '{"private-canary":');
  await assert.rejects(f.run(), error => !error.message.includes('private-canary') && /valid local/.test(error.message));
  f.config.bio = 'x'.repeat(5001); await f.save();
  await assert.rejects(f.run(), /5,000-character/);
  f.config.bio = 'A neutral bio'; f.config.profile.image = '/images/private.png'; f.config.profile.alt = 'Portrait'; await f.save();
  await assert.rejects(f.run(), /ignored local images/);
  f.config.profile.image = ''; f.config.styles = { rules: { body: { background: 'url(https://private.example)' } } }; await f.save();
  await assert.rejects(f.run(), /failed build validation/);
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(path.join(f.directory, 'dist/sentinel'), 'utf8'), 'unchanged');
});

test('only an unambiguous active GitHub trigger restricted to the exact branch can receive config', () => {
  const settings = { branch: 'main', tag };
  assert.equal(selectProductionTrigger([productionTrigger()], settings), trigger);
  for (const override of [
    { branch_includes: ['*'] }, { branch_includes: ['main', 'preview'] }, { branch_includes: ['preview'] },
    { branch_excludes: ['main'] }, { branch_excludes: undefined }, { deleted_on: '2026-01-01' },
    { repo_connection: { provider_type: 'gitlab' } }, { repo_connection: { provider_type: 'github', deleted_on: '2026-01-01' } },
    { external_script_id: 'c'.repeat(32) }, { trigger_uuid: '../another/path' },
  ]) assert.throws(() => selectProductionTrigger([{ ...productionTrigger(), ...override }], settings), /production-only/);
  const second = { ...productionTrigger(), trigger_uuid: buildID };
  assert.throws(() => selectProductionTrigger([productionTrigger(), second], settings), /exactly one/);
  assert.equal(selectProductionTrigger([productionTrigger(), second], { ...settings, trigger }), trigger);
  assert.throws(() => selectProductionTrigger([productionTrigger()], { ...settings, trigger: buildID }), /exactly one/);
  assert.throws(() => selectProductionTrigger({}, settings), /unsupported/);
});

test('unrecognized worker or trigger results abort without modifying Cloudflare', async t => {
  const f = await fixture(t);
  for (const response of [ok([]), ok({}), Response.json({ success: true, result: [{ id: 'sample-worker', tag }], result_info: { total_pages: 2 } })]) {
    f.respond(call => call.url.endsWith('/workers/scripts') ? response : undefined);
    await assert.rejects(f.run());
  }
  f.respond(call => call.url.endsWith('/triggers') ? ok([{ ...productionTrigger(), branch_includes: ['*'] }]) : undefined);
  await assert.rejects(f.run(), /production-only/);
  assert.ok(f.calls.every(call => call.method === 'GET'));
});

test('connection file uses only supported settings and process environment wins', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.directory, '.env.cloudflare'), `CLOUDFLARE_ACCOUNT_ID=${account}\nCLOUDFLARE_API_TOKEN="${token}"\nCLOUDFLARE_WORKER_NAME=other-worker\nSITE_PRODUCTION_BRANCH=release\nSITE_CONFIG_JSON=unused\n`);
  const settings = await connectionSettings(f.directory, { CLOUDFLARE_WORKER_NAME: 'sample-worker' });
  assert.deepEqual(settings, { account, token, worker: 'sample-worker', branch: 'release', trigger: undefined });
  for (const override of [{ CLOUDFLARE_ACCOUNT_ID: '../path' }, { CLOUDFLARE_API_TOKEN: 'two lines\n' }, { CLOUDFLARE_WORKER_NAME: '../worker' }, { SITE_PRODUCTION_BRANCH: '*' }, { CLOUDFLARE_BUILD_TRIGGER_ID: 'invalid' }]) {
    await assert.rejects(connectionSettings(f.directory, override));
  }
});

test('CI and invalid CLI combinations cannot sync or deploy', async t => {
  const f = await fixture(t);
  for (const runtime of [{ CI: 'true' }, { WORKERS_CI: '1' }, { CF_PAGES: '1' }]) await assert.rejects(f.run({ env: { ...env, ...runtime } }), /local operator/);
  assert.equal(f.calls.length, 0);
  assert.throws(() => syncOptions(['--deploy', '--dry-run']), /either/);
  assert.throws(() => syncOptions(['--token', token]), error => !error.message.includes(token));
  assert.deepEqual(syncOptions(['--dry-run']), { dryRun: true, deploy: false, help: false });
});

test('provider errors and transport errors are redacted and never retried', async t => {
  const f = await fixture(t);
  for (const makeResponse of [
    () => Response.json({ secret: token }, { status: 403 }),
    () => Response.json({ secret: token }, { status: 429 }),
    () => Response.json({ secret: token }, { status: 500 }),
    () => Response.json({ success: false, errors: [{ message: token }] }),
    () => new Response(token),
    () => { throw new Error('network details ' + token); },
  ]) {
    const count = f.calls.length;
    f.respond(() => makeResponse());
    await assert.rejects(f.run(), error => !error.message.includes(token));
    assert.equal(f.calls.length, count + 1);
  }
});

test('unsuccessful secret writes prevent both verification and build requests', async t => {
  const f = await fixture(t);
  f.respond(call => call.method === 'PATCH' ? Response.json({ success: false, errors: [{ message: token }] }) : undefined);
  await assert.rejects(f.run({ deploy: true }), error => !error.message.includes(token));
  assert.deepEqual(f.calls.map(call => call.method), ['GET', 'GET', 'GET', 'PATCH']);
});

test('secret verification failure prevents a build and acknowledges the accepted update', async t => {
  const f = await fixture(t);
  f.respond(call => call.method === 'GET' && call.url.endsWith('/environment_variables') ? ok({ SITE_CONFIG_JSON: { is_secret: false, value: token } }) : undefined);
  await assert.rejects(f.run({ deploy: true }), error => /accepted the update/.test(error.message) && !error.message.includes(token));
  assert.ok(!f.calls.some(call => call.method === 'POST'));
});

test('build request failure is distinguished from successful config synchronization', async t => {
  const f = await fixture(t);
  f.respond(call => call.method === 'POST' ? new Response(token, { status: 500 }) : undefined);
  await assert.rejects(f.run({ deploy: true }), error => /config was synced/.test(error.message) && !error.message.includes(token));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('custom production branches must agree with the existing remote build variable', async t => {
  const f = await fixture(t);
  f.respond(call => call.url.endsWith('/triggers') ? ok([{ ...productionTrigger(), branch_includes: ['release'] }]) : undefined);
  await assert.rejects(f.run({ env: { ...env, SITE_PRODUCTION_BRANCH: 'release' } }), /remote SITE_PRODUCTION_BRANCH/);
  assert.ok(f.calls.every(call => call.method === 'GET'));
  f.respond(call => {
    if (call.url.endsWith('/triggers')) return ok([{ ...productionTrigger(), branch_includes: ['release'] }]);
    if (call.url.endsWith('/environment_variables') && call.method === 'GET') return ok({ SITE_PRODUCTION_BRANCH: { value: 'release', is_secret: false }, SITE_CONFIG_JSON: { value: null, is_secret: true } });
  });
  assert.deepEqual(await f.run({ env: { ...env, SITE_PRODUCTION_BRANCH: 'release' }, deploy: true }), { synced: true, buildRequested: true });
  assert.deepEqual(f.calls.at(-1).parsedBody, { branch: 'release' });
});
