// Zero-dependency static server for the browser build. `npm start` -> http://localhost:8765 (PORT=... to change)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8765;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const MOUNTS = [
  ['/three/', 'node_modules/three/'],
  ['/sim/', 'src/sim/'],
  ['/', 'src/web/'],
];

createServer(async (req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') url = '/index.html';
  let file = null;
  if (url === '/game.contract.json') file = join(ROOT, 'game.contract.json');
  else {
    for (const [prefix, dir] of MOUNTS) {
      if (url.startsWith(prefix)) {
        const base = join(ROOT, dir);
        const p = normalize(join(base, url.slice(prefix.length)));
        if (p.startsWith(base)) file = p;
        break;
      }
    }
  }
  try {
    if (!file) throw new Error('not found');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404 ' + url);
  }
}).on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy. Try: PORT=8766 npm start` : e.message);
  process.exit(1);
}).listen(PORT, () => console.log(`Đảo Đèn Lồng -> http://localhost:${PORT}  (Ctrl+C to stop)`));
