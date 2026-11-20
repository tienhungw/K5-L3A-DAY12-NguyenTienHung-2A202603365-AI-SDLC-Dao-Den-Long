// Core rules (PRD-0 + Ticket-02 Part 1 standard numbers) on Night 1.
// Phase 2 note: every expected value below is derived by hand from Ticket-02, not read back from the sim.
// Tests whose Phase-1 expectation changed carry a "Phase 2:" comment with the reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, quiet, at, T, dist } from './helpers.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('move [0,1] at yaw 0 walks +Z at 6.0 m/s (instant accel/stop)', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1] }, { tick: 60, move: [0, 0] }] }, ticks: 61, every: 1 });
  close(at(r, 60).player.pos[2], 6.0);
  close(at(r, 6).player.pos[2], 0.6); // full speed after 0.1 s
  close(at(r, 61).player.pos[2], 6.0); // stops within one tick
  assert.deepEqual(at(r, 30).player.vel, [0, 0, 6]);
});

test('camera yaw rotates the move vector (yaw 90: [0,1] -> +X, [1,0] -> -Z)', () => {
  let r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] }, ticks: 60 });
  close(r.last.player.pos[0], 6.0);
  r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0], cam_yaw_deg: 90 }] }, ticks: 60 });
  close(r.last.player.pos[2], -6.0);
});

test('move vectors longer than 1 are normalized', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 1] }] }, ticks: 60 });
  close(Math.hypot(r.last.player.pos[0], r.last.player.pos[2]), 6.0);
});

test('frame fields persist; snapshot 0 is before input', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 30, jump: false }, { tick: 60, move: [0, 0] }] }, ticks: 90, every: 30 });
  assert.deepEqual(r.snaps[0].player.pos, [0, 0, 0]);
  close(r.snaps[2].player.pos[0], 6.0);
  close(r.snaps[3].player.pos[0], 6.0);
});

test('jump: 7 m/s, gravity 20, apex ~1.225 m, only from the ground, lands grounded', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }, { tick: 1, jump: false }, { tick: 20, jump: true }] }, ticks: 60, every: 1 });
  const ys = r.snaps.map((s) => s.player.pos[1]);
  assert.ok(Math.max(...ys) > 1.15 && Math.max(...ys) <= 1.23, String(Math.max(...ys)));
  assert.equal(at(r, 1).player.grounded, false);
  // Airtime 2*7/20 = 0.7 s = 42 ticks; the re-press at tick 20 (mid-air) must not double-jump.
  const land = r.snaps.find((s) => s.tick > 1 && s.player.grounded).tick;
  assert.ok(land >= 42 && land <= 44, String(land));
  assert.equal(r.last.player.pos[1], 0);
});

// Phase 2: fall_enabled is now true (was false: Phase 1 clamped the player to the island edge).
test('falling off the island (Y < -10): -1 flame, lose all motes, wait 60 ticks, respawn at start with 90 ticks invuln', () => {
  const r = run({ scenario: quiet({ player: { pos: [39.5, 0, 0], carried: 4 } }), inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 200, every: 1 });
  const hits = r.ev('player_hit');
  assert.equal(hits.length, 1); // exactly once
  assert.deepEqual(hits[0].data, { by: 'fall', flames: 2, dropped: 0, lost: 4 });
  const ft = hits[0].tick;
  assert.ok(at(r, ft).player.pos[1] < -10);
  assert.equal(at(r, ft).player.carried, 0);
  assert.ok(at(r, ft + 59).player.pos[1] < -10); // still waiting
  const back = at(r, ft + 60).player;
  assert.equal(back.invuln, true);
  assert.equal(back.grounded, true);
  assert.equal(at(r, ft + 60).player.pos[1], 0);
  assert.deepEqual(back.vel.slice(1), [0, 0]);
});

test('falling with the last flame loses immediately (no respawn)', () => {
  const r = run({ scenario: quiet({ player: { pos: [39.9, 0, 0], flames: 1 } }), inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 400 });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.ev('game_over')[0].tick, r.ev('player_hit')[0].tick);
});

// Phase 2: per_mote is now scored on DEPOSIT, so picking up gives 0 points (was +10 on pickup).
test('mote within 1.0 m XZ is picked on tick 1 (no score until deposited)', () => {
  const r = run({ scenario: quiet({ motes: [[0, 0, 1.0]] }), ticks: 1, every: 1 });
  assert.deepEqual(r.ev('mote_picked').map((e) => [e.tick, e.data.carried]), [[1, 1]]);
  assert.equal(r.last.score, 0);
  assert.equal(r.last.motes_active, 0);
});

test('mote just outside 1.0 m is not picked', () => {
  const r = run({ scenario: quiet({ motes: [[0, 0, 1.01]] }), ticks: 1 });
  assert.equal(r.ev('mote_picked').length, 0);
});

test('carry capacity is 10', () => {
  const motes = Array.from({ length: 12 }, () => [0.1, 0, 0.1]);
  const r = run({ scenario: quiet({ motes }), ticks: 5, every: 1 });
  assert.equal(r.last.player.carried, 10);
  assert.equal(r.last.motes_active, 2);
});

test('deposit: +10 per mote deposited, lantern remembers progress across visits', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 23], carried: 4 } }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 2, every: 1,
  });
  assert.deepEqual(r.ev('deposit')[0].data, { lantern_id: 'L1', amount: 4, deposited: 4 });
  assert.equal(r.last.score, 40);
  assert.equal(r.last.lanterns[0].deposited, 4);
  assert.equal(r.ev('lantern_lit').length, 0);
});

test('interact outside 2.0 m does nothing; holding interact deposits only once', () => {
  let r = run({ scenario: quiet({ player: { pos: [0, 0, 22.95], carried: 3 } }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 5 });
  assert.equal(r.ev('deposit').length, 0);
  r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 1 } }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 30 });
  assert.equal(r.ev('deposit').length, 1);
});

test('lantern choice: nearest unlit; ties -> smaller id; lit lanterns are skipped', () => {
  // L2 moved to (0,0,21): L1 (0,0,25) and L2 are both exactly 2 m from (0,0,23).
  let r = run({ scenario: quiet({ player: { pos: [0, 0, 23], carried: 1 }, lanterns: [{ id: 'L2', pos: [0, 0, 21] }] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 1 });
  assert.equal(r.ev('deposit')[0].data.lantern_id, 'L1');
  r = run({ scenario: quiet({ player: { pos: [0, 0, 23], carried: 1 }, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', pos: [0, 0, 21] }] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 1 });
  assert.equal(r.ev('deposit')[0].data.lantern_id, 'L2');
});

test('min(carried, missing) is deposited; reaching 10 lights the lantern (+100)', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 24], carried: 8 }, lanterns: [{ id: 'L1', deposited: 7 }] }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 2, every: 1,
  });
  assert.deepEqual(r.ev('deposit')[0].data, { lantern_id: 'L1', amount: 3, deposited: 10 });
  assert.deepEqual(r.ev('lantern_lit')[0].data, { lantern_id: 'L1' });
  assert.equal(r.last.player.carried, 5);
  assert.equal(r.last.score, 30 + 100);
});

test('lighting the last lantern wins with bonus floor(time_left)*2 + 50*flames', () => {
  const lanterns = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 10 }, lanterns, time_left_s: 100 }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 600 });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'won', reason: 'all_lit' });
  assert.equal(r.end.ticks, 1);
  // 10 motes*10 + 100 + floor(100 - 1/60)=99 * 2 + 3*50
  assert.equal(r.end.score, 100 + 100 + 198 + 150);
});

test('win takes precedence over dawn on the very tick time runs out', () => {
  const lanterns = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 10 }, lanterns, time_left_s: 1 }), inputs: { frames: [{ tick: 59, interact: true }] }, ticks: 600 });
  assert.equal(r.end.ticks, 60);
  assert.equal(r.end.state, 'won');
  assert.equal(r.end.score, 100 + 100 + 0 + 150);
});

test('night timer: 300 s on Night 1 -> lost / dawn at tick 18000', () => {
  const r = run({ scenario: quiet(), ticks: 20000, every: 1000 });
  assert.equal(r.end.ticks, 18000);
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
});

// Phase 2: shade speed 4.0 and contact radius 1.0 (were 2.5 / 0.8); hitting shade recoils 2 m over 60 ticks.
test('shade chases at 4 m/s and hits within 1.0 m: -1 flame, drop floor(carried/2) onto a 1.5-2.5 m ring, recoil', () => {
  const r = run({ scenario: quiet({ player: { carried: 5 }, shades: [{ pos: [3, 1, 0] }] }), ticks: 100, every: 1 });
  const hit = r.ev('player_hit')[0];
  assert.equal(hit.tick, 30); // (3 - 1) m / (4/60 m per tick) = 30 ticks
  assert.deepEqual(hit.data, { by: 'shade', flames: 2, dropped: 2 });
  const s = at(r, 30);
  assert.equal(s.player.carried, 3);
  assert.equal(s.player.invuln, true);
  const drops = s.motes.filter((m) => m.kind === 'dropped');
  assert.equal(drops.length, 2);
  for (const m of drops) {
    const d = dist(m.pos, s.player.pos);
    assert.ok(d >= 1.5 - 1e-3 && d <= 2.5 + 1e-3, String(d));
    assert.equal(m.ttl_s, 8);
  }
  assert.equal(s.shades[0].state, 'recoil');
  close(at(r, 90).shades[0].pos[0] - at(r, 30).shades[0].pos[0], 2.0, 0.01);
  assert.notEqual(at(r, 91).shades[0].state, 'recoil');
});

test('dropped motes expire after 480 ticks and can be picked up again from the next tick', () => {
  // flames 9 so the run survives repeated hits; track the motes dropped by the FIRST hit by id.
  const r = run({ scenario: quiet({ player: { carried: 6, flames: 9 }, shades: [{ pos: [1.5, 1, 0] }] }), ticks: 600, every: 1 });
  const ht = r.ev('player_hit')[0].tick;
  const ids = at(r, ht).motes.filter((m) => m.kind === 'dropped').map((m) => m.id);
  assert.equal(ids.length, 3);
  const alive = (tick) => at(r, tick).motes.filter((m) => ids.includes(m.id)).length;
  assert.equal(alive(ht + 479), 3);
  assert.equal(alive(ht + 480), 0);
  // pick-up of a dropped mote: put the player next to one dropped by a scenario mote of kind 'dropped'
  const r2 = run({ scenario: quiet({ motes: [{ pos: [0.5, 0, 0], kind: 'dropped', ttl_s: 2 }] }), ticks: 1, every: 1 });
  assert.equal(r2.ev('mote_picked').length, 1);
});

test('invulnerability (90 ticks) and at most one flame lost per tick', () => {
  const r = run({ scenario: quiet({ shades: [{ pos: [0.5, 1, 0] }, { pos: [-0.5, 1, 0] }] }), ticks: 300 });
  const ticks = r.ev('player_hit').map((e) => e.tick);
  assert.equal(ticks[0], 1);
  assert.equal(ticks.filter((t) => t === 1).length, 1);
  assert.ok(ticks[1] - ticks[0] >= 90, JSON.stringify(ticks));
});

test('losing the last flame -> lost / no_flames', () => {
  const r = run({ scenario: quiet({ player: { flames: 1 }, shades: [{ pos: [0.5, 1, 0] }] }), ticks: 100 });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
  assert.equal(r.end.ticks, 1);
});

test('shade detection 12 m / give-up 18 m (wander <-> chase)', () => {
  let r = run({ scenario: quiet({ shades: [{ pos: [12.5, 1, 0] }] }), ticks: 1, every: 1 });
  assert.equal(r.last.shades[0].state, 'wander');
  r = run({ scenario: quiet({ shades: [{ pos: [11.9, 1, 0] }] }), ticks: 1, every: 1 });
  assert.equal(r.last.shades[0].state, 'chase');
  // Player runs away at 6 m/s, shade follows at 4 m/s: gap grows 2 m/s -> from 11.9 m it exceeds 18 m after ~3.05 s.
  r = run({ scenario: quiet({ shades: [{ pos: [-11.9, 1, 0] }] }), inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 240, every: 1 });
  assert.equal(at(r, 150).shades[0].state, 'chase');
  assert.equal(at(r, 200).shades[0].state, 'wander');
});

// Phase 2: pulse = Tỏa Sáng, cost 3, 3D radius 5 m from feet+0.8, push 4 m over 15 ticks, stun 120, +5 (was cost 1, instant 3 m push, +20).
test('Tỏa Sáng: cost 3, 3D radius 5 from feet+0.8, stun 120 ticks, push 4 m over 15 ticks, +5 per shade', () => {
  const r = run({
    scenario: quiet({ player: { carried: 4 }, shades: [{ id: 'S1', pos: [4.9, 1, 0] }, { id: 'S2', pos: [-5, 1, 0] }] }),
    inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 200, every: 1,
  });
  // S1: sqrt(4.9^2 + 0.2^2) = 4.904 <= 5 -> hit. S2: sqrt(25 + 0.04) > 5 -> miss.
  assert.deepEqual(r.ev('pulse')[0].data.stunned_ids, ['S1']);
  assert.equal(at(r, 1).player.carried, 1);
  assert.equal(at(r, 1).score, 5);
  assert.equal(at(r, 1).player.pulse_cd_s, 3);
  close(at(r, 15).shades[0].pos[0], 8.9);
  close(at(r, 30).shades[0].pos[0], 8.9);
  assert.equal(at(r, 120).shades[0].state, 'stunned');
  assert.notEqual(at(r, 121).shades[0].state, 'stunned');
});

test('Tỏa Sáng needs 3 motes and respects the 3 s cooldown; re-pulse refreshes stun and scores stunned shades again', () => {
  let r = run({ scenario: quiet({ player: { carried: 2 }, shades: [{ pos: [2, 1, 0] }] }), inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 5 });
  assert.equal(r.ev('pulse').length, 0);
  r = run({
    scenario: quiet({ player: { carried: 9 }, shades: [{ pos: [1.5, 1, 0], state: 'stunned', state_ticks_left: 500 }] }),
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 100, pulse: true }, { tick: 101, pulse: false }, { tick: 180, pulse: true }] },
    ticks: 200, every: 1,
  });
  // Pulses at ticks 1 and 181 (cooldown 180 ticks); the one at tick 101 is ignored.
  assert.deepEqual(r.ev('pulse').map((e) => e.tick), [1, 181]);
  // Pulse 1 hits the already-stunned shade (+5) and REFRESHES its stun to 120 ticks (scenario had 500 left).
  assert.equal(at(r, 120).shades[0].state, 'stunned');
  assert.notEqual(at(r, 121).shades[0].state, 'stunned');
  // It then chases back into range, so pulse 2 at tick 181 hits it again: total 2 x 5.
  assert.deepEqual(r.ev('pulse')[1].data.stunned_ids, ['S1']);
  assert.equal(r.end.score, 10);
});

// Phase 2: safe radius 6 m (was 3 m).
test('shades are blocked at the 6 m edge of a lit lantern (player hiding at the lamp is safe)', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ pos: [0, 1, 15] }, { pos: [8, 1, 25] }, { pos: [-2, 1, 32] }] }),
    ticks: 1200, every: 3,
  });
  for (const s of r.snaps.slice(1)) for (const sh of s.shades) assert.ok(dist(sh.pos, [0, 0, 25]) >= 6, `tick ${s.tick} ${sh.id}`);
  assert.equal(r.ev('player_hit').length, 0);
});

test('shade inside a lantern when it lights is pushed out within 30 ticks and does no damage meanwhile', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 23], carried: 10 }, shades: [{ pos: [0, 1, 23.5] }] }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 120, every: 1,
  });
  assert.equal(r.ev('lantern_lit')[0].tick, 1);
  assert.equal(r.ev('player_hit').length, 0);
  assert.ok(dist(at(r, 31).shades[0].pos, [0, 0, 25]) >= 6, JSON.stringify(at(r, 31).shades[0]));
});

// Phase 2: no shades at tick 0 any more; schedule = 2 at tick 300, then 1 every 480 ticks (Night 1), max 6, >= 15 m away.
test('Night 1 shade schedule: 2 at tick 300, then every 480 ticks, max 6, spawn points >= 15 m from the player', () => {
  const r = run({ seed: 3, scenario: { player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit: true }] }, ticks: 5000, every: 60 });
  assert.equal(r.snaps[0].shades.length, 0);
  const sp = r.ev('shade_spawned');
  assert.deepEqual(sp.map((e) => e.tick), [300, 300, 780, 1260, 1740, 2220]);
  assert.deepEqual(sp.map((e) => e.data.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  const s300 = r.lines.find((l) => l.type === 'snapshot' && l.tick === 300);
  for (const sh of s300.shades) {
    assert.equal(sh.state, 'spawning');
    assert.ok(dist(sh.pos, [0, 0, 25]) >= 15);
    close(Math.hypot(sh.pos[0], sh.pos[2]), 37);
  }
});

test('Night 1 motes: 20 distinct spawn points at start, +1 every 240 ticks up to 30', () => {
  const r = run({ seed: 5, scenario: { random_shades: false }, ticks: 2400, every: 240 });
  const s0 = r.snaps[0];
  assert.equal(s0.motes_active, 20);
  assert.equal(new Set(s0.motes.map((m) => m.pos.join())).size, 20);
  for (const m of s0.motes) assert.ok([12, 33].some((R) => Math.abs(Math.hypot(m.pos[0], m.pos[2]) - R) < 1e-2));
  assert.equal(at(r, 240).motes_active, 21);
  assert.equal(at(r, 480).motes_active, 22);
  assert.equal(at(r, 960).motes_active, 24); // all 24 Night-1 points used
  assert.equal(at(r, 1200).motes_active, 24); // no free point -> skip
});
