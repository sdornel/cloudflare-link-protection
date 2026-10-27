import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditPublic, publicFiles } from '../scripts/check-public.mjs';
import { root } from '../scripts/config.mjs';

async function copyPublicSource(dir) {
  for (const file of await publicFiles(root)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await cp(path.join(root, file), path.join(dir, file));
  }
}

test('publication audit detects private keywords without printing the matched value', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-audit-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await copyPublicSource(dir);
  await mkdir(path.join(dir, '.private'));
  const marker = randomUUID();
  await writeFile(path.join(dir, '.private/audit-terms.json'), JSON.stringify([marker]));
  assert.equal((await auditPublic(dir)).termsChecked, true);
  await appendFile(path.join(dir, 'README.md'), `\n${marker}\n`);
  await assert.rejects(() => auditPublic(dir), (error) => error.message.includes('README.md') && !error.message.includes(marker));
});

test('real site.json stays out of public exports while its values are checked for leaks', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-config-export-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await copyPublicSource(dir);
  const marker = randomUUID();
  await writeFile(path.join(dir, 'config/site.json'), JSON.stringify({ name: marker }));
  const result = await auditPublic(dir);
  assert.equal(result.privateChecked, true);
  assert.ok(!result.files.includes('config/site.json'));
  assert.ok(result.files.includes('config/site.example.json'));
  await appendFile(path.join(dir, 'README.md'), `\n${marker}\n`);
  await assert.rejects(() => auditPublic(dir), (error) => error.message.includes('README.md') && !error.message.includes(marker));
});

test('Git ignores private config, assets, outputs and archives, and forced tracking is detected', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-index-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await copyPublicSource(dir);
  const ignored = ['config/site.json', 'config/site.json.old', 'config/site.config.json.bak', '.private/assets/portrait.png', 'dist/index.html', 'dist-private/index.html', '.env', '.dev.vars', 'preview.zip', 'credentials.pem', 'credentials.key', 'credentials.p12', 'credentials.pfx', 'playwright/.auth/session.json'];
  for (const file of ignored) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), file.endsWith('.json') ? '{}' : 'local-only');
  }
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
  } catch (error) {
    if (!process.env.CI && ['EPERM', 'EACCES', 'ENOENT'].includes(error.code)) {
      t.skip('Git subprocess unavailable in this environment. Run this test on a host with Git process access.');
      return;
    }
    throw error;
  }
  const matched = execFileSync('git', ['check-ignore', '--stdin'], { cwd: dir, input: ignored.join('\n') + '\n', encoding: 'utf8' });
  assert.deepEqual(matched.trim().split('\n'), ignored);
  execFileSync('git', ['add', '.'], { cwd: dir });
  assert.equal((await auditPublic(dir)).gitChecked, true);
  execFileSync('git', ['add', '-f', 'config/site.json'], { cwd: dir });
  await assert.rejects(() => auditPublic(dir), /tracked file/);
  assert.ok((await readFile(path.join(dir, '.gitignore'), 'utf8')).includes('.private/'));
});

test('publication audit inspects the Git index through a directory alias on macOS and Linux', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'profile-alias-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const dir = path.join(parent, 'checkout'), alias = path.join(parent, 'alias');
  await mkdir(dir);
  await copyPublicSource(dir);
  await symlink(dir, alias, 'dir');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '.'], { cwd: dir });
  assert.equal((await auditPublic(dir)).gitChecked, true);
  assert.equal((await auditPublic(alias)).gitChecked, true);
  await writeFile(path.join(dir, 'config/site.json.old'), '{}');
  execFileSync('git', ['add', '-f', 'config/site.json.old'], { cwd: dir });
  await assert.rejects(() => auditPublic(alias), /tracked file/);
});

test('technical platform labels do not exempt creator identities or full destination URLs', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'profile-technical-term-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await copyPublicSource(dir);
  const config = { name: randomUUID(), secondaryLinks: [{ label: 'Instagram', url: `https://example.com/${randomUUID()}` }] };
  await writeFile(path.join(dir, 'config/site.json'), JSON.stringify(config));
  await appendFile(path.join(dir, 'README.md'), '\nInstagram browser compatibility.\n');
  await auditPublic(dir);
  await appendFile(path.join(dir, 'README.md'), config.secondaryLinks[0].url);
  await assert.rejects(() => auditPublic(dir), /README.md/);
});
