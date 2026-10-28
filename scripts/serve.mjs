import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './build.mjs';

const types = { '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

export function createPreviewHandler(directory) {
  const dir = path.resolve(directory);
  return async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      let file = path.resolve(dir, relative);
      if (!file.startsWith(`${dir}${path.sep}`) || relative.split(/[\\/]/).some((part) => part.startsWith('.') || part.startsWith('_'))) {
        res.writeHead(404).end();
        return;
      }
      const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      let body;
      try {
        if ((await stat(file)).isDirectory()) {
          file = path.join(file, 'index.html');
          // Only a real directory index is a page; asset directories stay 404.
          body = await readFile(file);
          if (!pathname.endsWith('/')) {
            res.writeHead(307, { Location: `${url.pathname}/${url.search}`, 'Cache-Control': 'no-store' }).end();
            return;
          }
          headers['Content-Type'] = types['.html'];
        }
        body ??= await readFile(file);
      } catch {
        res.statusCode = 404;
        headers['Content-Type'] = types['.html'];
        body = await readFile(path.join(dir, '404.html'));
      }
      res.writeHead(res.statusCode, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(400).end('Invalid request, or missing build. Build the selected profile first.');
    }
  };
}

export function createPreviewServer(directory) {
  return http.createServer(createPreviewHandler(directory));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const server = createPreviewServer(path.join(root, process.argv.includes('--private') ? 'dist-private' : 'dist'));
  server.listen(port, '127.0.0.1', () => console.log(`Local preview: http://localhost:${port}\nRebuild the selected profile after edits; refresh the browser. Cloudflare edge headers and challenges are tested after deployment.`));
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
}
