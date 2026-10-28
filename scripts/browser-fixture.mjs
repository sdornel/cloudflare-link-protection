import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from './build.mjs';
import { createPreviewServer } from './serve.mjs';

// Browser evidence always uses the neutral sample in an isolated directory.
export async function neutralPreview() {
  const directory = await mkdtemp(path.join(tmpdir(), 'profile-evidence-'));
  let server;
  const close = async () => {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await build({ exampleBuild: true, outDir: directory });
    server = createPreviewServer(directory);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return { directory, url: `http://127.0.0.1:${server.address().port}/example/`, close };
  } catch (error) { await close(); throw error; }
}
