// Node-side helpers shared by the headless CLI and the tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWorld, step, snapshot } from './world.js';
import { inputCursor } from './files.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Single source of truth: the simulation reads its numbers from game.contract.json.
export function loadTuning() {
  return JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8')).tuning;
}

/** Runs a full headless simulation and returns the JSONL records (as objects). */
export function runHeadless({ tuning, seed = 0, scenario = null, frames = [], ticks, every = 10, night = 1 }) {
  const w = createWorld(tuning, seed, scenario, night);
  const inputAt = inputCursor(frames);
  const out = [snapshot(w), { type: 'event', tick: 0, name: 'night_start', data: { night } }];
  for (let k = 0; k < ticks; k++) {
    for (const e of step(w, inputAt(k))) out.push(e);
    const ended = w.state !== 'playing';
    if (w.tick % every === 0 || ended) out.push(snapshot(w));
    if (ended) break;
  }
  out.push({ type: 'end', ticks: w.tick, state: w.state, score: w.score });
  return out;
}
