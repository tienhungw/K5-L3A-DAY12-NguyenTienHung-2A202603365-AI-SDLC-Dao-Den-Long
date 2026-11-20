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

// Phase 2: contract v1.1 standard numbers. Phase 3: v1.2 — durations 240/270/300, fuel keys, new score table (Ticket-03 §5, §7).
// Phase 4: contract v1.3 only adds bench_cmd/soak_cmd (Ticket-04 §6); the tuning numbers stay exactly as v1.2.
test('game.contract.json is v1.3 with Ticket-02/03 standard numbers', () => {
  for (const k of ['contract_version', 'team', 'build_cmd', 'run_cmd', 'headless_cmd', 'tuning']) assert.ok(k in contract, k);
  assert.equal(contract.contract_version, '1.3');
  assert.deepEqual(contract.tuning, {
    player_speed: 6.0, carry_capacity: 10, lantern_cost: 10, lantern_count_night1: 5, pickup_radius: 1.0, interact_radius: 2.0,
    pulse_cost: 3, pulse_radius: 5.0, night1_duration_s: 240, night2_duration_s: 270, night3_duration_s: 300, flames: 3,
    invuln_s: 1.5, hit_drop_ratio: 0.5, pulse_stun_s: 2.0, pulse_push_m: 4.0, pulse_cooldown_s: 3.0, safe_radius: 6.0,
    shade_speed: 4.0, shade_hit_radius: 1.0, fall_enabled: true, dash_speed: 14.0, dash_duration_s: 0.2, dash_cooldown_s: 1.5,
    score: { per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 },
    fuel_max: 100, fuel_decay_per_s: 1.0, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20,
  });
});

test('CLI writes JSONL: snapshot 0 first, end last, exit 0', () => {
  const out = join(tmp, 'o1.jsonl');
  const r = cli(['--seed', '7', '--night', '1', '--ticks', '120', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const lines = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].type, 'snapshot');
  assert.equal(lines[0].tick, 0);
  assert.deepEqual(lines[0].player.pos, [0, 0, 0]);
  assert.deepEqual(lines[1], { type: 'event', tick: 0, name: 'night_start', data: { night: 1 } });
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 120, state: 'playing', score: lines.at(-1).score });
  const snaps = lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
});

// Phase 2: v1.1 snapshot fields. Phase 3: + lantern fuel/ever_lit/relit_count, player.capacity, durations 240/270/300.
test('snapshot has all v1.2 contract fields', () => {
  for (const night of [1, 2, 3]) {
    const s = run({ ticks: 1, night }).snaps[0];
    for (const k of ['type', 'tick', 'sim_tick', 'state', 'night', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms']) assert.ok(k in s, k);
    assert.equal(s.night, night);
    assert.deepEqual(Object.keys(s.wind).sort(), ['active', 'dir_deg']);
    assert.deepEqual(Object.keys(s.player).sort(), ['capacity', 'carried', 'charm_s', 'dash_cd_s', 'flames', 'grounded', 'invuln', 'pos', 'pulse_cd_s', 'vel']);
    assert.equal(s.player.capacity, 10);
    assert.equal(s.lanterns.length, [0, 5, 6, 7][night]);
    for (const l of s.lanterns) {
      assert.deepEqual(Object.keys(l).sort(), ['deposited', 'ever_lit', 'fuel', 'id', 'lit', 'pos', 'relit_count']);
      assert.deepEqual([l.fuel, l.ever_lit, l.relit_count], [0, false, 0]);
    }
    for (const m of s.motes) { assert.deepEqual(Object.keys(m).sort(), ['id', 'kind', 'pos', 'ttl_s']); assert.equal(m.kind, 'random'); assert.equal(m.ttl_s, null); }
    assert.equal(s.motes_active, 20);
    assert.equal(s.time_left_s, [0, 240, 270, 300][night]);
    for (const c of s.charms) for (const k of ['id', 'available', 'respawn_s']) assert.ok(k in c);
    assert.deepEqual(s.charms.map((c) => c.id), [[], [], ['C1'], ['C1', 'C2']][night]);
  }
});

test('--night accepts 1, 2, 3 and rejects others with exit 2', () => {
  for (const n of ['1', '2', '3']) assert.equal(cli(['--seed', '1', '--night', n, '--ticks', '5', '--out', join(tmp, 'n.jsonl')]).status, 0);
  for (const n of ['0', '4']) assert.equal(cli(['--seed', '1', '--night', n, '--ticks', '5', '--out', join(tmp, 'n.jsonl')]).status, 2);
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
    ['--scenario', file('bad10.json', { shades: [{ pos: [1, 1, 1], state: 'angry' }] })],
    ['--scenario', file('bad11.json', { drifters: [{ pos: [1, 1, 1], state: 'zoom' }] })],
    ['--scenario', file('bad12.json', { charms: [{ available: true }] })],
    ['--scenario', file('bad13.json', { player: { invuln_ticks: -1 } })],
    ['--inputs', file('bad14.json', { frames: [{ tick: 0, pause: 1 }] })],
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

// Phase 2: night_start {night} is now emitted at tick 0 (not a scenario-setup event); nothing else may appear.
test('scenario setup emits no events and no score (lit lantern gives no points)', () => {
  const r = run({ scenario: quiet({ lanterns: [{ id: 'L2', lit: true }], motes: [[0, 0, 0]] }), ticks: 0 });
  assert.deepEqual(r.events.map((e) => e.name), ['night_start']);
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
  assert.equal(r.last.tick, 30);
  assert.equal(r.end.ticks, 30);
  assert.equal(r.end.state, 'lost');
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(r.ev('game_over')[0].tick, 30);
});
