// Ticket-03 "Đèn cạn dầu" (contract v1.2): fuel, refuel, relight, drain, dawn win rule, capacity, new score.
// Expected numbers are derived by hand from Ticket-03 (fuel in units of 1/60; stage 2 burns fuel before stage 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, quiet, at, dist } from './helpers.js';

const L1 = [0, 0, 25];

// ---------------- §1 fuel
test('fuel burns 1/s; at 0 the lantern goes out: lantern_out, deposited 0, ever_lit stays true', () => {
  const r = run({ scenario: quiet({ lanterns: [{ id: 'L1', lit: true, fuel: 2 }] }), ticks: 130, every: 1 });
  assert.equal(at(r, 0).lanterns[0].fuel, 2);
  assert.equal(at(r, 60).lanterns[0].fuel, 1);
  assert.deepEqual(r.ev('lantern_out').map((e) => [e.tick, e.data]), [[120, { lantern_id: 'L1' }]]); // 2 * 60 units
  const l = at(r, 120).lanterns[0];
  assert.deepEqual([l.lit, l.fuel, l.deposited, l.ever_lit], [false, 0, 0, true]);
  assert.equal(at(r, 119).lanterns[0].lit, true);
});

test('lit: true without fuel defaults to 100; fuel is reported with 1 decimal', () => {
  const r = run({ scenario: quiet({ lanterns: [{ id: 'L1', lit: true }] }), ticks: 7, every: 1 });
  assert.equal(at(r, 0).lanterns[0].fuel, 100);
  assert.equal(at(r, 0).lanterns[0].ever_lit, true);
  assert.equal(at(r, 6).lanterns[0].fuel, 99.9); // 100 - 6/60
});

test('refuel: used = min(carried, ceil((100 - fuel)/10)), fuel = min(100, fuel + 10*used), +5 per mote', () => {
  // fuel 50 -> after stage 2 of tick 1: 50 - 1/60 -> ceil(50.017/10) = 6 motes -> fuel 100
  let r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 7 }, lanterns: [{ id: 'L1', lit: true, fuel: 50 }] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 1, every: 1 });
  assert.deepEqual(r.ev('refuel')[0].data, { lantern_id: 'L1', amount: 6, fuel: 100 });
  assert.equal(r.last.player.carried, 1);
  assert.equal(r.last.score, 30);
  // 3 motes only: 50 - 1/60 + 30 = 79.98 -> reported 80
  r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 50 }] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 1, every: 1 });
  assert.deepEqual(r.ev('refuel')[0].data, { lantern_id: 'L1', amount: 3, fuel: 80 });
  assert.equal(r.ev('deposit').length, 0);
});

test('relight: an ever-lit lantern needs only 5 motes (+5 each, +40, relight: true); a never-lit one still needs 10', () => {
  let r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', ever_lit: true }] }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 2, every: 1 });
  assert.deepEqual(r.ev('lantern_lit')[0].data, { lantern_id: 'L1', relight: true });
  assert.equal(at(r, 1).score, 25 + 40);
  assert.deepEqual([at(r, 1).lanterns[0].fuel, at(r, 1).lanterns[0].relit_count], [100, 1]);
  assert.equal(at(r, 1).player.capacity, 12);
  r = run({ scenario: quiet({ player: { pos: [0, 0, 24], carried: 5 } }), inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 2, every: 1 });
  assert.equal(r.ev('lantern_lit').length, 0);
  assert.equal(at(r, 1).lanterns[0].deposited, 5);
});

test('a lantern that went out keeps ever_lit and can be relit for 5', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', lit: true, fuel: 1 }] }),
    inputs: { frames: [{ tick: 61, interact: true }] }, ticks: 63, every: 1,
  });
  assert.equal(r.ev('lantern_out')[0].tick, 60);
  assert.deepEqual(r.ev('lantern_lit')[0], { type: 'event', tick: 62, name: 'lantern_lit', data: { lantern_id: 'L1', relight: true } });
});

// ---------------- §4 capacity
test('capacity = 10 + 2 x successful_lights, max 20; scenario-lit lanterns do not count', () => {
  let r = run({ scenario: quiet({ player: { successful_lights: 3 }, motes: Array.from({ length: 18 }, () => [0.1, 0, 0.1]) }), ticks: 1, every: 1 });
  assert.equal(r.last.player.capacity, 16);
  assert.equal(r.last.player.carried, 16);
  r = run({ scenario: quiet({ player: { successful_lights: 6 } }), ticks: 0 });
  assert.equal(r.snaps[0].player.capacity, 20);
  r = run({ scenario: quiet({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }] }), ticks: 0 });
  assert.equal(r.snaps[0].player.capacity, 10);
});

// ---------------- §2 safe zone threshold + drain
test('safe zone exists at fuel >= 30 and disappears below 30', () => {
  // fuel 30.5 -> exactly 30.0 at tick 30 (still safe), 29.98 at tick 31 (unsafe). Shade starts 8 m away, 4 m/s.
  const r = run({ scenario: quiet({ player: { pos: L1 }, lanterns: [{ id: 'L1', lit: true, fuel: 30.5 }], shades: [{ pos: [0, 1, 17] }] }), ticks: 33, every: 1 });
  assert.ok(dist(at(r, 30).shades[0].pos, L1) >= 6, JSON.stringify(at(r, 30).shades[0]));
  assert.ok(dist(at(r, 31).shades[0].pos, L1) < 6, JSON.stringify(at(r, 31).shades[0]));
});

test('drain: a wandering shade walks to the nearest weak lantern, drains 5/s (+1/s decay), fuel_drain every 60 ticks, then the lantern goes out', () => {
  // L1 fuel 20 = 1200 units. Shade 5 m away at 1.5 m/s reaches 2 m after 3 / 0.025 = 120 ticks -> drain from tick 120.
  const r = run({ scenario: quiet({ player: { pos: [0, 0, -15] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ pos: [0, 1, 30] }] }), ticks: 320, every: 1 });
  const start = r.snaps.find((s) => s.shades[0].state === 'drain').tick;
  assert.equal(start, 120);
  // stage 2 of ticks 121..180 drains 60 x 5 units; decay 180 x 1 unit -> 1200 - 300 - 180 = 720 units = 12.0
  assert.deepEqual(r.ev('fuel_drain')[0], { type: 'event', tick: 180, name: 'fuel_drain', data: { lantern_id: 'L1', shade_id: 'S1', fuel: 12 } });
  // tick 300 is the 180th drain tick too (multiple of 60) -> a last fuel_drain with fuel 0, then lantern_out
  assert.deepEqual(r.ev('fuel_drain').map((e) => [e.tick, e.data.fuel]), [[180, 12], [240, 6], [300, 0]]);
  // 720 units / 6 per tick = 120 more ticks -> out at tick 300
  assert.equal(r.ev('lantern_out')[0].tick, 300);
  assert.equal(at(r, 300).shades[0].state, 'wander');
});

test('two draining shades add up (5 + 5 + 1 units per tick)', () => {
  const r = run({ scenario: quiet({ player: { pos: [0, 0, -15] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ pos: [0, 1, 26.5], state: 'drain', target_lantern_id: 'L1' }, { pos: [1.5, 1, 25], state: 'drain', target_lantern_id: 'L1' }] }), ticks: 60, every: 1 });
  assert.equal(at(r, 60).lanterns[0].fuel, (1200 - 660) / 60); // 9.0
  assert.equal(r.ev('fuel_drain').length, 2);
});

test('drain -> chase when Mây comes within 6 m; Tỏa Sáng on a draining shade scores 15; stun ends in wander', () => {
  // Shade drains L1 from (0,1,26.5); Mây at (0,0,21) is 5.5 m away -> chase on tick 1.
  let r = run({ scenario: quiet({ player: { pos: [0, 0, 21] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ pos: [0, 1, 26.5], state: 'drain', target_lantern_id: 'L1' }] }), ticks: 1, every: 1 });
  assert.equal(r.last.shades[0].state, 'chase');
  // Pulse (stage 7) hits it while still draining: +15; 3D distance from (0,0.8,22.5) to (0,1,26.5) = 4.005 <= 5
  r = run({
    scenario: quiet({ player: { pos: [0, 0, 22.5], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ pos: [0, 1, 26.5], state: 'drain', target_lantern_id: 'L1' }] }),
    inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 125, every: 1,
  });
  assert.equal(at(r, 1).score, 15);
  assert.equal(at(r, 1).shades[0].state, 'stunned');
  assert.equal(at(r, 120).shades[0].state, 'stunned');
  assert.equal(at(r, 121).shades[0].state, 'wander');
});

test('refuelling to >= 30 pushes shades out of the 6 m zone within 30 ticks without damage', () => {
  const r = run({
    scenario: quiet({ player: { pos: [0, 0, 24], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ pos: [0, 1, 26.5], state: 'drain', target_lantern_id: 'L1' }] }),
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 90, every: 1,
  });
  assert.equal(r.ev('refuel')[0].data.fuel, 49.9); // 1200 units - 1 (decay) - 5 (the shade drains in stage 2 of tick 1) + 1800 = 2994 -> 49.9
  assert.ok(dist(at(r, 31).shades[0].pos, L1) >= 6, JSON.stringify(at(r, 31).shades[0]));
  assert.equal(r.ev('player_hit').length, 0);
});

// ---------------- §3 dawn win rule + §5 score
test('dawn: alive with >= ceil(0.6 n) lanterns lit -> won / dawn_survived; bonus 50 + floor(fuel) per lit lantern + 50 per flame', () => {
  const lit3 = ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true }));
  const r = run({ scenario: quiet({ lanterns: lit3, time_left_s: 50 }), ticks: 4000 });
  assert.equal(r.end.ticks, 3000);
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'won', reason: 'dawn_survived' });
  assert.equal(r.end.score, 3 * (50 + 50) + 3 * 50); // fuel 100 - 50 = 50 each
});

test('dawn with fewer than 3/5 lit -> lost / dawn (no bonus); a lantern going out on the dawn tick does not count', () => {
  let r = run({ scenario: quiet({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }], time_left_s: 10 }), ticks: 1000 });
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
  assert.equal(r.end.score, 0);
  r = run({ scenario: quiet({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true, fuel: 10 }], time_left_s: 10 }), ticks: 1000 });
  assert.equal(r.ev('lantern_out')[0].tick, 600);
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'dawn' });
});

test('no_flames beats dawn on the last tick', () => {
  const lit3 = ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true }));
  const r = run({ scenario: quiet({ player: { flames: 1 }, lanterns: lit3, shades: [{ pos: [0.5, 1, 0] }], time_left_s: 1 / 60 }), ticks: 10 });
  assert.equal(r.end.ticks, 1);
  assert.deepEqual(r.ev('game_over')[0].data, { result: 'lost', reason: 'no_flames' });
});

test('thresholds: Night 2 needs 4/6, Night 3 needs 5/7', () => {
  const lit = (ids) => ids.map((id) => ({ id, lit: true }));
  const end = (night, ids) => run({ night, scenario: quiet({ player: { pos: night === 3 ? [0, 0, -30] : [0, 0, 0] }, lanterns: lit(ids), time_left_s: 1 }), ticks: 100 }).ev('game_over')[0].data.result;
  assert.equal(end(2, ['L1', 'L2', 'L3', 'L4']), 'won');
  assert.equal(end(2, ['L1', 'L2', 'L3']), 'lost');
  assert.equal(end(3, ['L1', 'L2', 'L3', 'L4', 'L5']), 'won');
  assert.equal(end(3, ['L1', 'L2', 'L3', 'L4']), 'lost');
});
