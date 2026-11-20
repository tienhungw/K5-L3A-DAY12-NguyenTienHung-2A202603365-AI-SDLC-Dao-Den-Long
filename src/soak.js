#!/usr/bin/env node
// Soak test (Ticket-04 §2): N nights in one process (Night 1 -> 2 -> 3 rotating), night i uses seed + i,
// seeded random input. Usage: node --expose-gc --jitless --max-semi-space-size=1 src/soak.js --seed 7 --nights 10 --out soak.json
// The V8 flags keep RSS a measure of live data: without them RSS grows ~25 % from JIT code and a growing young
// generation even though heapUsed after GC stays flat (no leak). heap_used_*_mb are reported as extra evidence.
import { writeFileSync } from 'node:fs';
import { createWorld, step, TICK_RATE, nightDuration } from './sim/world.js';
import { createRng } from './sim/rng.js';
import { loadTuning } from './sim/runner.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const intArg = (k, d) => {
  const v = arg(k, d);
  if (!/^-?\d+$/.test(String(v))) { process.stderr.write(`error: ${k} must be an integer\n`); process.exit(2); }
  return Number(v);
};
const seed = intArg('--seed', 7), nights = intArg('--nights', 10), out = arg('--out', 'soak.json');
if (nights < 1) { process.stderr.write('error: --nights must be >= 1\n'); process.exit(2); }

const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
const rssMb = () => Math.round((process.memoryUsage().rss / 2 ** 20) * 10) / 10;
const heapMb = () => Math.round((process.memoryUsage().heapUsed / 2 ** 20) * 100) / 100;

/** Seeded random player: new move direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact. */
export function randomInput(rng) {
  let move = [0, 0], tick = 0;
  return () => {
    if (tick % 30 === 0) { const a = rng.next() * Math.PI * 2; move = [Math.cos(a), Math.sin(a)]; }
    tick++;
    return { move, cam_yaw_deg: 0, jump: rng.next() < 0.05, dash: rng.next() < 0.03, pulse: rng.next() < 0.02, interact: rng.next() < 0.1, pause: false };
  };
}

export function runNight(tuning, night, nightSeed) {
  const w = createWorld(tuning, nightSeed, null, night);
  const input = randomInput(createRng(nightSeed ^ 0x5eed));
  const maxTicks = Math.round(nightDuration(tuning, night) * TICK_RATE);
  for (let t = 0; t < maxTicks && w.state === 'playing'; t++) step(w, input());
  return w.state === 'playing' ? 'lost' : w.state; // time ran out without a verdict cannot happen (dawn decides)
}

const tuning = loadTuning();
const t0 = process.hrtime.bigint();
const results = [];
let crashes = 0, memStart = null, heapStart = null;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  try {
    if (i === 0) {
      // "RSS after the first night has loaded": build it once, measure, then play it for real.
      createWorld(tuning, seed, null, night);
      gc(); memStart = rssMb(); heapStart = heapMb();
    }
    results.push(runNight(tuning, night, seed + i));
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`night ${i + 1} crashed: ${e.stack || e}\n`);
  }
}
gc(); // "after the last night has been reset": its world is out of scope now
const report = {
  nights, crashes, results, mem_start_mb: memStart, mem_end_mb: rssMb(),
  duration_s: Math.round(Number(process.hrtime.bigint() - t0) / 1e8) / 10,
  heap_used_start_mb: heapStart, heap_used_end_mb: heapMb(),
};
report.mem_ratio = Math.round((report.mem_end_mb / report.mem_start_mb) * 1000) / 1000;
writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report));
process.exitCode = crashes ? 1 : 0;
