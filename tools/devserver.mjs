// Tiny static dev server with caching disabled, so edits always show up on reload.
// Usage: node tools/devserver.mjs [port] [root]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2]) || 5173;
const root = path.resolve(process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  // Dev helper: POST /__shot?name=foo.png saves an in-game screenshot to store/screenshots/.
  if (req.method === 'POST' && req.url.startsWith('/__shot')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || '').replace(/[^A-Za-z0-9_.-]/g, '');
    if (!/\.(png|jpg)$/.test(name)) {
      res.writeHead(400).end('bad name');
      return;
    }
    const dir = path.join(root, 'store', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
      res.writeHead(200).end('saved');
    });
    return;
  }
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Dev server: http://localhost:${port}  (root ${root})`));
