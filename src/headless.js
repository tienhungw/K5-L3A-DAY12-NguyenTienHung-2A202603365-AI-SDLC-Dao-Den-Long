#!/usr/bin/env node
// Headless runner (Test Contract v1.0).
// node src/headless.js --seed <int> --night 1 [--scenario f.json] [--inputs f.json]
//                      --ticks <int> --out <file.jsonl> [--snapshot-every <int>]
import { readFileSync, writeFileSync } from 'node:fs';
import { InputError, parseInputs, parseScenario } from './sim/files.js';
import { loadTuning, runHeadless } from './sim/runner.js';
import { MAPS } from './sim/maps.js';

function parseArgs(argv) {
  const known = new Set(['--seed', '--night', '--scenario', '--inputs', '--ticks', '--out', '--snapshot-every']);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!known.has(k)) throw new InputError(`unknown argument: ${k}`);
    const v = argv[++i];
    if (v === undefined) throw new InputError(`missing value for ${k}`);
    a[k.slice(2)] = v;
  }
  const int = (name, def, min) => {
    if (a[name] === undefined) {
      if (def === undefined) throw new InputError(`--${name} is required`);
      return def;
    }
    if (!/^-?\d+$/.test(a[name])) throw new InputError(`--${name} must be an integer`);
    const n = Number(a[name]);
    if (n < min) throw new InputError(`--${name} must be >= ${min}`);
    return n;
  };
  const opts = {
    seed: int('seed', 0, -2147483648),
    night: int('night', 1, 1),
    ticks: int('ticks', undefined, 0),
    every: int('snapshot-every', 10, 1),
    scenario: a.scenario,
    inputs: a.inputs,
    out: a.out,
  };
  if (!opts.out) throw new InputError('--out is required');
  if (![1, 2, 3].includes(opts.night)) throw new InputError(`--night must be 1, 2 or 3 (got ${opts.night})`);
  return opts;
}

function readJson(path, label) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { throw new InputError(`${label}: cannot read ${path}: ${e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new InputError(`${label}: invalid JSON: ${e.message}`); }
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const tuning = loadTuning();
    const scenario = opts.scenario ? parseScenario(readJson(opts.scenario, 'scenario'), tuning, MAPS[opts.night].lanterns.length) : null;
    const frames = opts.inputs ? parseInputs(readJson(opts.inputs, 'inputs')) : [];
    const lines = runHeadless({ tuning, seed: opts.seed, scenario, frames, ticks: opts.ticks, every: opts.every, night: opts.night });
    writeFileSync(opts.out, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    process.exitCode = 0;
  } catch (e) {
    if (e instanceof InputError) {
      process.stderr.write(`error: ${e.message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`internal error: ${e.stack || e}\n`);
      process.exitCode = 1;
    }
  }
}

main();
