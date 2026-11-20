// Test Contract v1.0: file shape, CLI, tick model, output format, exit codes, determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/sim/runner.js';
import { run, quiet, T } from './helpers.js';

const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'ddl-'));
const cli = (args) => spawnSync(process.execPath, [join(ROOT, 'src/headless.js'), ...args], { encoding: 'utf8' });
const file = (name, content) => {
  const p = join(tmp, name);
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
};

test('game.contract.json has every required field', () => {
  for (const k of ['contract_version', 'team', 'build_cmd', 'run_cmd', 'headless_cmd', 'tuning']) assert.ok(k in contract, k);
  assert.equal(contract.contract_version, '1.0');
  const keys = ['player_speed', 'carry_capacity', 'lantern_cost', 'lantern_count_night1', 'pickup_radius', 'interact_radius',
    'pulse_cost', 'pulse_radius', 'night1_duration_s', 'flames', 'invuln_s', 'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m',
    'pulse_cooldown_s', 'safe_radius', 'shade_speed', 'shade_hit_radius', 'fall_enabled', 'score'];
  for (const k of keys) assert.ok(k in contract.tuning, k);
  for (const k of ['per_mote', 'per_lantern', 'per_stun', 'per_second_left', 'per_flame_left']) assert.ok(k in contract.tuning.score, k);
  assert.equal(contract.tuning.lantern_count_night1, 5);
  assert.equal(typeof contract.tuning.fall_enabled, 'boolean');
});

test('CLI writes JSONL: snapshot 0 first, end last, exit 0', () => {
  const out = join(tmp, 'o1.jsonl');
  const r = cli(['--seed', '7', '--night', '1', '--ticks', '120', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const lines = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'snapshot');
  assert.equal(lines[0].tick, 0);
  assert.deepEqual(lines[0].player.pos, [0, 0, 0]);
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 120, state: 'playing', score: lines.at(-1).score });
  const snaps = lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
});

test('snapshot has all contract fields', () => {
  const s = run({ ticks: 1 }).snaps[0];
  for (const k of ['type', 'tick', 'sim_tick', 'state', 'time_left_s', 'score', 'player', 'lanterns', 'shades', 'motes_active']) assert.ok(k in s, k);
  assert.deepEqual(Object.keys(s.player).sort(), ['carried', 'flames', 'pos']);
  assert.equal(s.lanterns.length, 5);
  assert.deepEqual(s.lanterns.map((l) => l.id), ['L1', 'L2', 'L3', 'L4', 'L5']);
  for (const l of s.lanterns) assert.deepEqual(Object.keys(l).sort(), ['deposited', 'id', 'lit', 'pos']);
  for (const sh of s.shades) assert.deepEqual(Object.keys(sh).sort(), ['id', 'pos', 'state']);
  assert.equal(s.motes_active, s.motes.length);
});

test('--snapshot-every and time_left_s follow the tick model', () => {
  const r = run({ ticks: 90, every: 30 });
  assert.deepEqual(r.snaps.map((s) => s.tick), [0, 30, 60, 90]);
  assert.equal(r.snaps[2].time_left_s, T.night1_duration_s - 1);
  assert.equal(r.end.ticks, 90);
});

test('same seed/scenario/inputs -> byte-identical output; different seed differs', () => {
  const inputs = file('det-in.json', { frames: [{ tick: 0, move: [0.3, 1] }, { tick: 200, move: [-1, 0], pulse: true }, { tick: 260, pulse: false }] });
  const outs = ['d1', 'd2', 'd3'].map((n) => join(tmp, n + '.jsonl'));
  cli(['--seed', '99', '--night', '1', '--inputs', inputs, '--ticks', '3000', '--out', outs[0]]);
  cli(['--seed', '99', '--night', '1', '--inputs', inputs, '--ticks', '3000', '--out', outs[1]]);
  cli(['--seed', '100', '--night', '1', '--inputs', inputs, '--ticks', '3000', '--out', outs[2]]);
  const [a, b, c] = outs.map((o) => readFileSync(o, 'utf8'));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('coordinates are rounded to 3 decimals', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0.123, 0.777] }] }, ticks: 7, every: 1 });
  for (const s of r.snaps) for (const v of s.player.pos) assert.equal(v, Math.round(v * 1000) / 1000);
});

test('malformed inputs / scenario -> exit code 2 with stderr message', () => {
  const bad = [
    ['--inputs', file('bad1.json', '{not json')],
    ['--inputs', file('bad2.json', { frames: [{ tick: 5 }, { tick: 5 }] })],
    ['--inputs', file('bad3.json', { frames: [{ tick: 9 }, { tick: 3 }] })],
    ['--inputs', file('bad4.json', { frames: [{ tick: 0, move: [2, 0] }] })],
    ['--inputs', file('bad5.json', { frames: [{ tick: 0, jump: 'yes' }] })],
    ['--inputs', file('bad6.json', { nope: [] })],
    ['--scenario', file('bad7.json', { lanterns: [{ id: 'L9', lit: true }] })],
    ['--scenario', file('bad8.json', { shades: [{ pos: 'here' }] })],
    ['--scenario', file('bad9.json', '[1,2')],
    ['--inputs', join(tmp, 'missing.json')],
  ];
  for (const extra of bad) {
    const r = cli(['--seed', '1', '--night', '1', '--ticks', '10', '--out', join(tmp, 'x.jsonl'), ...extra]);
    assert.equal(r.status, 2, `expected exit 2 for ${extra.join(' ')}`);
    assert.match(r.stderr, /error/);
  }
});

test('missing --ticks / --out is an error (nonzero)', () => {
  assert.notEqual(cli(['--seed', '1', '--night', '1', '--out', join(tmp, 'y.jsonl')]).status, 0);
  assert.notEqual(cli(['--seed', '1', '--night', '1', '--ticks', '5']).status, 0);
});

test('scenario setup emits no events and no score (lit lantern gives no points)', () => {
  const r = run({ scenario: quiet({ lanterns: [{ id: 'L2', lit: true }], motes: [[0, 0, 0]] }), ticks: 0 });
  assert.equal(r.events.length, 0);
  assert.equal(r.snaps[0].score, 0);
  assert.equal(r.snaps[0].lanterns[1].lit, true);
  assert.equal(r.snaps[0].motes_active, 1);
});

test('generated ids are deterministic and continue after scenario ids', () => {
  const r = run({ scenario: quiet({ shades: [{ pos: [10, 1, 10], id: 'S1' }, { pos: [-10, 1, 10] }] }), ticks: 0 });
  assert.deepEqual(r.snaps[0].shades.map((s) => s.id), ['S1', 'S2']);
});

test('game stops when it ends; end line carries final state', () => {
  const r = run({ scenario: quiet({ time_left_s: 0.5 }), ticks: 1000 });
  assert.equal(r.end.ticks, 30);
  assert.equal(r.end.state, 'lost');
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(r.ev('game_over')[0].tick, 30);
});
