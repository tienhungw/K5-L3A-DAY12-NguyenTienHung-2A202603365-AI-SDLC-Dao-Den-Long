// Drives a real Chrome via the DevTools protocol (Node >= 22, no npm deps):
// screenshots, console errors and average FPS at 1280x720.
// Usage: node scripts/browser-check.mjs <outDir> [--headed] [--fps-seconds 20] [--base http://localhost:8765]
//        CHROME=/path/to/chrome overrides the browser path.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, cpus, platform, release } from 'node:os';

const outDir = process.argv[2] || 'browser-check';
const headed = process.argv.includes('--headed');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('--base', 'http://localhost:8765');
const fpsSeconds = Number(arg('--fps-seconds', 20));
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) { console.error('Chrome not found; set CHROME=...'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 500);
const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ddl-chrome-'))}`, '--window-size=1280,720',
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
if (!headed) args.push('--headless=new', '--enable-gpu', '--use-angle=default', '--ignore-gpu-blocklist');
const proc = spawn(chrome, [...args, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools not reachable');
}
const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map(), errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

async function shot(name, url, waitMs, before) {
  await send('Page.navigate', { url: base + url });
  await sleep(waitMs);
  if (before) { await evaluate(before); await sleep(700); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res.result?.data) { writeFileSync(join(outDir, name + '.png'), Buffer.from(res.result.data, 'base64')); console.log('shot', name); return; }
    console.log(`shot ${name} attempt ${attempt} failed: ${JSON.stringify(res.error)}`);
    await sleep(1500);
  }
  errors.push(`screenshot ${name} failed`);
}

const report = [];
await shot('01-menu', '/', 2500);
await shot('02-night1-hud', '/?autoplay&seed=5&night=1&skip=25', 3000);
await shot('03-night1-progress', '/?autoplay&seed=4&night=1&skip=120', 3000);
await shot('04-night2-bridge', '/?autoplay&seed=5&night=2&skip=40', 3000);
await shot('05-night3-tiers', '/?autoplay&seed=5&night=3&skip=60', 5000);
await shot('06-pause-menu', '/?autoplay&seed=5&night=1&skip=10', 2500, "document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}))");
await shot('07-intro', '/', 2000, "document.getElementById('btnStart').click()");
await shot('08-low-time', '/?autoplay&seed=5&night=1&skip=1', 2000, 'window.__game.world.timeStart = 25.4 + window.__game.world.simTick / 60');
// Phase 3: low-fuel lanterns (1 Hz blink, red fuel bar, no safe ring), colour-blind palette, dawn result
await shot('09-low-fuel', '/?seed=4&night=1', 2500, "document.getElementById('btnPlay').click(); const w = window.__game.world, l = w.lanterns[0]; l.lit = true; l.everLit = true; l.fuelU = 25 * 60; w.player.pos = { x: l.pos.x, y: 0, z: l.pos.z - 6 }; w.lanterns[1].lit = true; w.lanterns[1].everLit = true; w.lanterns[1].fuelU = 80 * 60;");
await shot('10-colorblind', '/?autoplay&seed=4&night=1&skip=100', 3000, "localStorage.setItem('ddl-settings', JSON.stringify({ volume: 0.7, sens: 0.6, colorblind: true })); location.reload()");
await send('Runtime.evaluate', { expression: "localStorage.removeItem('ddl-settings')" });
await shot('11-dawn-result', '/?autoplay&seed=5&night=1&skip=240', 2200);

// FPS: let the bot play Night 1 at 1280x720 and average per-second samples (first 3 s discarded as warm-up)
await send('Page.navigate', { url: base + '/?autoplay&seed=4&night=1&fps' });
await sleep((fpsSeconds + 3) * 1000);
const samples = (await evaluate('window.__game.fps.samples')) || [];
const gpu = await evaluate("(()=>{const c=document.createElement('canvas').getContext('webgl2');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'})()");
const used = samples.slice(3);
const avg = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
report.push({ mode: headed ? 'headed' : 'headless', resolution: '1280x720', seconds: used.length, avg_fps: Math.round(avg * 10) / 10, min_fps: Math.min(...used), samples: used, gpu,
  machine: `${platform()} ${release()} · ${cpus()[0]?.model?.trim()} x${cpus().length}` });
writeFileSync(join(outDir, 'fps.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(outDir, 'console-errors.json'), JSON.stringify(errors, null, 2) + '\n');
console.log(JSON.stringify(report[0]));
console.log('console errors:', errors.length);
ws.close(); proc.kill();
process.exit(errors.length ? 1 : 0);
