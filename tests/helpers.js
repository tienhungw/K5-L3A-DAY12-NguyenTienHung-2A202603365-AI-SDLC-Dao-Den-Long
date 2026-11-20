import { loadTuning, runHeadless } from '../src/sim/runner.js';
import { parseScenario, parseInputs } from '../src/sim/files.js';
import { MAPS } from '../src/sim/maps.js';

export const T = loadTuning();

// Run a scenario (raw JSON objects, as they would appear in files).
export function run({ scenario = null, inputs = null, ticks = 60, seed = 1, every = 10, night = 1 } = {}) {
  const sc = scenario ? parseScenario(scenario, T, MAPS[night].lanterns.length) : null;
  const frames = inputs ? parseInputs(inputs) : [];
  const lines = runHeadless({ tuning: T, seed, scenario: sc, frames, ticks, every, night });
  return {
    lines,
    events: lines.filter((l) => l.type === 'event'),
    snaps: lines.filter((l) => l.type === 'snapshot'),
    end: lines[lines.length - 1],
    last: lines.filter((l) => l.type === 'snapshot').at(-1),
    ev: (name) => lines.filter((l) => l.type === 'event' && l.name === name),
  };
}

// A quiet world: no random spawns, player at the night's start.
export const quiet = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, ...extra });
export const at = (r, tick) => r.snaps.find((s) => s.tick === tick);

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
