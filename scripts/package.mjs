// Builds the runnable release folder dist/dao-den-long-v<version>/ (no npm install needed: three.js is vendored)
// and zips it. Usage: node scripts/package.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const name = `dao-den-long-v${pkg.version}`;
const out = join(ROOT, 'dist', name);
if (!existsSync(join(ROOT, 'node_modules/three/build/three.module.js'))) { console.error('run npm install first'); process.exit(1); }
rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (rel) => cpSync(join(ROOT, rel), join(out, rel), { recursive: true });
for (const rel of ['server.js', 'game.contract.json', 'src', 'scripts/bench.mjs', 'LICENSE', 'CREDITS.md', 'CHANGELOG.md', 'README.md']) copy(rel);
for (const rel of ['node_modules/three/package.json', 'node_modules/three/LICENSE', 'node_modules/three/build/three.module.js',
  'node_modules/three/examples/jsm/postprocessing', 'node_modules/three/examples/jsm/shaders']) copy(rel);
writeFileSync(join(out, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', private: true, license: pkg.license,
  scripts: { start: 'node server.js', headless: 'node src/headless.js', soak: pkg.scripts.soak, bench: pkg.scripts.bench } }, null, 2) + '\n');
writeFileSync(join(out, 'START-HERE.txt'), [
  `Đảo Đèn Lồng ${pkg.version} — bản chạy được (web tĩnh + server Node, không cần npm install)`,
  '',
  'Yêu cầu: Node.js >= 18 (bench cần Node >= 22 + Chrome/Chromium/Edge), trình duyệt có WebGL2.',
  '1) Giải nén, mở terminal trong thư mục này',
  '2) node server.js            (cổng bận? PORT=8766 node server.js)',
  '3) Mở http://localhost:8765',
  '',
  'Headless:  node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl',
  'Soak:      node --expose-gc --jitless --max-semi-space-size=1 src/soak.js --seed 7 --nights 10 --out soak.json',
  'Bench:     node scripts/bench.mjs --seed 42 --duration 30 --out bench.json',
  'Xuất bảng xếp hạng: node server.js --export-leaderboard out.json',
  '',
].join('\n'));

// zip (bsdtar ships with Windows 10+/macOS; Linux falls back to `zip`)
const zip = join(ROOT, 'dist', `${name}.zip`);
let r = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', join(ROOT, 'dist'), name], { stdio: 'inherit' });
if (r.status !== 0) r = spawnSync('zip', ['-qr', zip, name], { cwd: join(ROOT, 'dist'), stdio: 'inherit' });
console.log(r.status === 0 ? `release -> ${zip}` : `folder ready at ${out} (zip tool not found)`);
