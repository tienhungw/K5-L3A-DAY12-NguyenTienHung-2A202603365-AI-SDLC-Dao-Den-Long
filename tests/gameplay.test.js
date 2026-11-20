// Gameplay rules from PRD-0, checked against the numbers in game.contract.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, quiet, T, dist } from './helpers.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('move [0,1] at yaw 0 walks +Z at player_speed', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 60 });
  close(r.last.player.pos[2], T.player_speed);
  close(r.last.player.pos[0], 0);
});

test('camera yaw rotates the move vector (yaw 90: [0,1] -> +X, [1,0] -> -Z)', () => {
  let r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] }, ticks: 60 });
  close(r.last.player.pos[0], T.player_speed);
  r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 90 }] }, ticks: 60 });
  close(r.last.player.pos[2], -T.player_speed);
});

test('move vectors longer than 1 are normalized', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 1] }] }, ticks: 60 });
  close(Math.hypot(r.last.player.pos[0], r.last.player.pos[2]), T.player_speed);
});

test('frame fields persist; snapshot 0 is before input', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 30, jump: false }, { tick: 60, move: [0, 0] }] }, ticks: 90, every: 30 });
  assert.deepEqual(r.snaps[0].player.pos, [0, 0, 0]);
  close(r.snaps[2].player.pos[0], T.player_speed); // still moving between 30 and 60
  close(r.snaps[3].player.pos[0], T.player_speed); // stopped at 60
});

test('player cannot leave the island (fall_enabled = false)', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 60 * 10 });
  assert.equal(T.fall_enabled, false);
  assert.ok(r.last.player.pos[0] <= 30 + 1e-6);
  assert.equal(r.ev('player_hit').length, 0);
});

test('jump goes up and lands back on y = 0', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }] }, ticks: 60, every: 1 });
  const ys = r.snaps.map((s) => s.player.pos[1]);
  assert.ok(Math.max(...ys) > 0.5);
  assert.equal(ys.at(-1), 0);
});

test('mote inside pickup_radius is picked on tick 1 with score per_mote', () => {
  const r = run({ scenario: quiet({ motes: [[0, 0, T.pickup_radius]] }), ticks: 1, every: 1 });
  assert.deepEqual(r.ev('mote_picked').map((e) => [e.tick, e.data.carried]), [[1, 1]]);
  assert.equal(r.last.score, T.score.per_mote);
  assert.equal(r.last.motes_active, 0);
});

test('mote just outside pickup_radius is not picked', () => {
  const r = run({ scenario: quiet({ motes: [[0, 0, T.pickup_radius + 0.01]] }), ticks: 1 });
  assert.equal(r.ev('mote_picked').length, 0);
});

test('carry_capacity limits pickups', () => {
  const motes = Array.from({ length: T.carry_capacity + 2 }, () => [0.1, 0, 0.1]);
  const r = run({ scenario: quiet({ motes }), ticks: 5, every: 1 });
  assert.equal(r.last.player.carried, T.carry_capacity);
  assert.equal(r.last.motes_active, 2);
});

test('interact deposits into nearest unlit lantern within interact_radius', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 18 - T.interact_radius], carried: 3 } }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 5, every: 1,
  });
  assert.deepEqual(r.ev('deposit')[0].data, { lantern_id: 'L1', amount: 3, deposited: 3 });
  assert.equal(r.ev('lantern_lit').length, 0);
  assert.equal(r.last.player.carried, 0);
});

test('interact outside interact_radius does nothing', () => {
  const r = run({ scenario: quiet({ player: { pos: [0, 0, 18 - T.interact_radius - 0.05], carried: 3 } }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 5 });
  assert.equal(r.ev('deposit').length, 0);
});

test('holding interact only triggers once (false -> true edge)', () => {
  const r = run({ scenario: quiet({ player: { pos: [0, 0, 17], carried: 1 }, motes: [] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 30 });
  assert.equal(r.ev('deposit').length, 1);
});

test('reaching lantern_cost lights the lantern: deposit only takes what is needed', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 17], carried: 5 }, lanterns: [{ id: 'L1', deposited: T.lantern_cost - 2 }] }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 2, every: 1,
  });
  assert.deepEqual(r.ev('deposit')[0].data, { lantern_id: 'L1', amount: 2, deposited: T.lantern_cost });
  assert.deepEqual(r.ev('lantern_lit')[0].data, { lantern_id: 'L1' });
  assert.equal(r.last.player.carried, 3);
  assert.equal(r.last.score, T.score.per_lantern);
});

test('lighting the last lantern wins: all_lit + time and flame bonus', () => {
  const lanterns = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 17], carried: T.lantern_cost }, lanterns, time_left_s: 100 }),
    inputs: { frames: [{ tick: 10, interact: true }] }, ticks: 600,
  });
  const go = r.ev('game_over')[0];
  assert.deepEqual(go.data, { result: 'won', reason: 'all_lit' });
  assert.equal(go.tick, 11);
  assert.equal(r.end.state, 'won');
  assert.equal(r.end.ticks, 11);
  const timeLeft = 100 - 11 / 60;
  const expected = T.score.per_lantern + Math.floor(timeLeft) * T.score.per_second_left + T.flames * T.score.per_flame_left;
  assert.equal(r.end.score, expected);
  assert.equal(r.last.state, 'won');
});

test('shade chases at shade_speed and hits within shade_hit_radius', () => {
  const r = run({ scenario: quiet({ player: { carried: 4 }, shades: [{ pos: [3, 1, 0] }] }), ticks: 120 });
  const hit = r.ev('player_hit')[0];
  const expectTick = Math.ceil(((3 - T.shade_hit_radius) / T.shade_speed) * 60 - 1e-9);
  assert.equal(hit.tick, expectTick);
  assert.deepEqual(hit.data, { by: 'shade', flames: T.flames - 1, dropped: Math.floor(4 * T.hit_drop_ratio) });
});

test('invuln_s prevents a second hit until it expires', () => {
  const r = run({ scenario: quiet({ shades: [{ pos: [0.5, 1, 0] }] }), ticks: 300 });
  const ticks = r.ev('player_hit').map((e) => e.tick);
  assert.equal(ticks[0], 1);
  assert.equal(ticks[1] - ticks[0], Math.round(T.invuln_s * 60));
});

test('losing the last flame -> lost / no_flames', () => {
  const r = run({ scenario: quiet({ player: { flames: 1 }, shades: [{ pos: [0.5, 1, 0] }] }), ticks: 100 });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.end.state, 'lost');
  assert.equal(r.end.ticks, 1);
});

test('night timer runs out -> lost / dawn', () => {
  const r = run({ scenario: quiet({ time_left_s: 2 }), ticks: 1000 });
  assert.equal(r.end.ticks, 120);
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
});

test('pulse costs pulse_cost light, stuns and pushes shades in pulse_radius, scores per_stun', () => {
  const r = run({
    scenario: quiet({ player: { carried: 2 }, shades: [{ pos: [T.pulse_radius, 1, 0] }, { pos: [-(T.pulse_radius + 1), 1, 0] }] }),
    inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 1, every: 1,
  });
  assert.deepEqual(r.ev('pulse')[0].data, { stunned_ids: ['S1'] });
  assert.equal(r.last.player.carried, 2 - T.pulse_cost);
  assert.equal(r.last.score, T.score.per_stun);
  assert.equal(r.last.shades[0].state, 'stunned');
  assert.equal(r.last.shades[0].pos[0], T.pulse_radius + T.pulse_push_m);
  assert.notEqual(r.last.shades[1].state, 'stunned');
});

test('stunned shade stays still for pulse_stun_s then chases again', () => {
  const stun = Math.round(T.pulse_stun_s * 60);
  const r = run({ scenario: quiet({ player: { carried: 2 }, shades: [{ pos: [2, 1, 0] }] }), inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: stun + 5, every: 1 });
  const at = (t) => r.snaps.find((s) => s.tick === t).shades[0];
  assert.equal(at(stun).state, 'stunned');
  assert.deepEqual(at(stun).pos, at(1).pos);
  assert.notEqual(at(stun + 1).state, 'stunned');
  assert.ok(at(stun + 2).pos[0] < at(stun).pos[0]);
});

test('pulse without enough light does nothing; cooldown blocks rapid pulses', () => {
  let r = run({ scenario: quiet({ shades: [{ pos: [2, 1, 0] }] }), inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 5 });
  assert.equal(r.ev('pulse').length, 0);
  const cd = Math.round(T.pulse_cooldown_s * 60);
  r = run({
    scenario: quiet({ player: { carried: 5 } }),
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 5, pulse: true }, { tick: 6, pulse: false }, { tick: cd + 2, pulse: true }] },
    ticks: cd + 10,
  });
  assert.deepEqual(r.ev('pulse').map((e) => e.tick), [1, cd + 3]);
});

test('shades never enter safe_radius of a lit lantern (player hiding at the lamp is safe)', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 18] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 1, 10] }, { pos: [5, 1, 18] }, { pos: [0, 1, 19] }] }),
    ticks: 1200, every: 1,
  });
  for (const s of r.snaps.slice(1)) for (const sh of s.shades) assert.ok(dist(sh.pos, [0, 0, 18]) > T.safe_radius, `tick ${s.tick} ${sh.id}`);
  assert.equal(r.ev('player_hit').length, 0);
});

test('unlit lanterns give no protection', () => {
  const r = run({ scenario: quiet({ player: { pos: [0, 0, 18] }, shades: [{ pos: [0, 1, 14] }] }), ticks: 200 });
  assert.ok(r.ev('player_hit').length >= 1);
});

test('random spawns: default world has motes and shades; shade_spawned events use fresh ids', () => {
  // Player hides at a lit lantern so the run survives past the first periodic spawn.
  const r = run({ seed: 3, scenario: { player: { pos: [0, 0, 18] }, lanterns: [{ id: 'L1', lit: true }] }, ticks: 60 * 45 });
  assert.equal(r.end.state, 'playing');
  assert.ok(r.snaps[0].motes_active >= 20);
  assert.equal(r.snaps[0].shades.length, 2);
  const spawned = r.ev('shade_spawned');
  assert.deepEqual(spawned.map((e) => e.data.id), ['S3']);
});
