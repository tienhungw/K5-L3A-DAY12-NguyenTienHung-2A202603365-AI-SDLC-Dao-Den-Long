#!/usr/bin/env node
// Ticket-04 §1 benchmark: node scripts/bench.mjs --seed 42 --duration 30 --out bench.json [--headless]
// Starts the game server, opens a 1280x720 Chrome window (vsync + frame-rate limit disabled), loads the
// bench scene (/?bench), measures per-frame dt for `duration` s after a 3 s warm-up and writes bench.json.
// Needs Node >= 22 (built-in WebSocket) and Chrome/Chromium/Edge (set CHROME=/path to override).
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, cpus, platform, release, arch, totalmem, type } from 'node:os';
import { fileURLToPath } from 'node:url';
import { frameStats } from '../src/bench-stats.js';

const T0 = performance.timeOrigin; // "process start" for load_ms
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const seed = Number(arg('--seed', 42)), duration = Number(arg('--duration', 30)), out = arg('--out', 'bench.json');
const headless = process.argv.includes('--headless');
if (!Number.isInteger(seed) || !(duration > 0)) { console.error('error: --seed must be an integer and --duration > 0'); process.exit(2); }
if (typeof WebSocket === 'undefined') { console.error('error: bench needs Node >= 22 (global WebSocket)'); process.exit(1); }

const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) { console.error('error: Chrome/Chromium not found; set CHROME=/path/to/chrome'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. game server on a free-ish port
const port = 8800 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve(); });
  server.on('exit', (c) => reject(new Error('server exited ' + c)));
});

// 2. Chrome window 1280x720 (not fullscreen), vsync off
const dbg = 9300 + Math.floor(Math.random() * 600);
// a persistent profile avoids Chrome's first-run work on every bench (it was adding seconds to load_ms)
const profileDir = join(tmpdir(), 'ddl-bench-profile');
const chromeArgs = [`--remote-debugging-port=${dbg}`, `--user-data-dir=${profileDir}`,
  '--window-size=1280,720', '--window-position=40,40', '--no-first-run', '--no-default-browser-check',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio'];
if (headless) chromeArgs.push('--headless=new');
const browser = spawn(chrome, [...chromeArgs, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { browser.kill(); } catch { /* gone */ } try { server.kill(); } catch { /* gone */ } };
process.on('exit', cleanup);

async function targets() {
  for (let i = 0; i < 80; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json();
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return { browserWs: v.webSocketDebuggerUrl, pageWs: page.webSocketDebuggerUrl };
    } catch { /* starting */ }
    await sleep(150);
  }
  throw new Error('Chrome DevTools not reachable');
}
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
  const ready = new Promise((r) => ws.addEventListener('open', r, { once: true }));
  return { ready, ws, send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }) };
}
const { browserWs, pageWs } = await targets();
const B = cdp(browserWs), P = cdp(pageWs);
await Promise.all([B.ready, P.ready]);
const evaluate = async (expr) => (await P.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await P.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

// RSS of the whole Chrome process tree (browser + GPU + renderer); sampled once per second
async function chromeRssMb() {
  try {
    const info = await B.send('SystemInfo.getProcessInfo');
    const pids = (info.result?.processInfo || []).map((p) => p.id).filter(Boolean);
    if (!pids.length) return null;
    if (platform() === 'win32') {
      const ps = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum`], { encoding: 'utf8' });
      return Number(ps.trim()) / 2 ** 20;
    }
    const ps = execFileSync('ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' });
    return ps.split('\n').map(Number).filter((n) => n > 0).reduce((a, b) => a + b, 0) / 1024;
  } catch { return null; }
}

// 3. load the bench scene and wait for the measurement window to finish
await P.send('Page.navigate', { url: `http://127.0.0.1:${port}/?bench&seed=${seed}&duration=${duration}${process.env.BENCH_EXTRA || ""}` });
let peak = null;
const deadline = Date.now() + (duration + 60) * 1000;
for (;;) {
  await sleep(1000);
  const st = await evaluate('window.__bench ? { first: window.__bench.firstFrameEpoch, done: window.__bench.done, n: window.__bench.dts.length } : null');
  if (!process.env.BENCH_NO_MEM && st?.first && (Date.now() - st.first) > 3000) { const m = await chromeRssMb(); if (m != null) peak = Math.max(peak ?? 0, m); }
  if (st?.done) break;
  if (Date.now() > deadline) { console.error('error: bench did not finish in time'); process.exit(1); }
}
const res = await evaluate(`({ dts: window.__bench.dts, first: window.__bench.firstFrameEpoch,
  gpu: (() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })(),
  ua: navigator.userAgent })`);
const version = (await B.send('Browser.getVersion')).result?.product || 'Chrome';
const threeVer = JSON.parse(readFileSync(join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;

const stats = frameStats(res.dts);
const report = {
  contract_version: '1.3',
  ...stats,
  load_ms: Math.round(res.first - T0),
  peak_mem_mb: peak == null ? null : Math.round(peak),
  vsync_off: true,
  renderer: `three.js r${threeVer.split('.')[1]} WebGL2 in ${version} (${res.gpu})${headless ? ' [headless]' : ''}`,
  os: `${type()} ${release()} ${arch()} · ${cpus()[0]?.model?.trim()} x${cpus().length} · ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM`,
  seed, duration_s: duration,
  peak_mem_note: 'Sum of RSS (working set on Windows) of all Chrome processes (browser, GPU, renderer) sampled every 1 s during measurement.',
};
if (process.env.BENCH_DUMP) writeFileSync(process.env.BENCH_DUMP, JSON.stringify(res.dts)); // raw dt list (diagnostics)
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
B.ws.close(); P.ws.close(); cleanup();
process.exit(0);
