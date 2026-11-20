// Zero-dependency static server + local leaderboard API for the browser build.
//   node server.js                                   -> http://localhost:8765 (PORT=... to change)
//   node server.js --export-leaderboard out.json     -> writes {"entries": [...]} (top 10, ranked) and exits
// Leaderboard file: data/leaderboard.json (override with LEADERBOARD_FILE=...).
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as board from './src/leaderboard.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8765;
const LB_FILE = resolve(process.env.LEADERBOARD_FILE || join(ROOT, 'data', 'leaderboard.json'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const MOUNTS = [
  ['/three/', 'node_modules/three/'],
  ['/sim/', 'src/sim/'],
  ['/', 'src/web/'],
];

const exportIdx = process.argv.indexOf('--export-leaderboard');
if (exportIdx > 0) {
  const out = process.argv[exportIdx + 1];
  if (!out) { console.error('error: --export-leaderboard needs an output path'); process.exit(2); }
  await writeFile(out, JSON.stringify({ entries: board.load(LB_FILE) }, null, 2) + '\n');
  console.log(`leaderboard exported -> ${out}`);
  process.exit(0);
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

async function api(req, res) {
  if (req.method === 'GET') return json(res, 200, { entries: board.load(LB_FILE) });
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 4096) return json(res, 413, { error: 'too large' }); }
    try {
      const entries = board.addEntry(board.load(LB_FILE), JSON.parse(body));
      board.save(LB_FILE, entries);
      return json(res, 200, { entries });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  return json(res, 405, { error: 'method not allowed' });
}

createServer(async (req, res) => {
  let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/api/leaderboard') return api(req, res);
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
