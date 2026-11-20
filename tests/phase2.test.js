// Ticket-02 new features: dash, pause, charms, drifters (Gió Lạc), Night 2/3 maps, jump pads, tiers, wind.
// Expected numbers are derived by hand from Ticket-02 (see comments).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, quiet, at, dist } from './helpers.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// ---------------- Dash
test('dash: 14 m/s for 12 ticks (2.8 m) in the move direction, then normal speed; emits dash {}', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, move: [0, 1], dash: true }] }, ticks: 60, every: 1 });
  assert.deepEqual(r.ev('dash').map((e) => [e.tick, e.data]), [[1, {}]]);
  close(at(r, 12).player.pos[2], 2.8);
  close(at(r, 60).player.pos[2], 2.8 + 48 * 0.1); // 7.6
  assert.equal(at(r, 1).player.dash_cd_s, 1.5);
});

test('dash cooldown 1.5 s counted from the start; standing still dashes toward facing (+Z at start)', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, dash: true }, { tick: 1, dash: false }, { tick: 50, dash: true }, { tick: 51, dash: false }, { tick: 90, dash: true }] }, ticks: 120, every: 1 });
  assert.deepEqual(r.ev('dash').map((e) => e.tick), [1, 91]);
  close(at(r, 12).player.pos[2], 2.8);
  close(at(r, 12).player.pos[0], 0);
});

test('air dash keeps altitude; dash is not invulnerable', () => {
  const r = run({ scenario: quiet(), inputs: { frames: [{ tick: 0, jump: true }, { tick: 10, move: [1, 0], dash: true }] }, ticks: 30, every: 1 });
  const y0 = at(r, 11).player.pos[1];
  for (let t = 11; t <= 22; t++) close(at(r, t).player.pos[1], y0);
  assert.ok(at(r, 24).player.pos[1] < y0);
  const r2 = run({ scenario: quiet({ shades: [{ pos: [2, 1, 0] }] }), inputs: { frames: [{ tick: 0, move: [1, 0], dash: true }] }, ticks: 10 });
  assert.equal(r2.ev('player_hit')[0].tick, 4); // gap closes (14 + 4)/60 = 0.3 m/tick: 2 m -> <= 1 m after 3.33 -> tick 4

});

// ---------------- Pause
test('pause: tick advances, sim_tick/time/cooldowns freeze, snapshots say "paused"; resume continues', () => {
  const r = run({
    scenario: quiet({ player: { pulse_cd_ticks: 100 } }),
    inputs: { frames: [{ tick: 0, move: [1, 0] }, { tick: 10, pause: true }, { tick: 11, pause: false }, { tick: 40, pause: true }] },
    ticks: 60, every: 1,
  });
  assert.deepEqual(r.ev('paused').map((e) => e.tick), [11]);
  assert.deepEqual(r.ev('resumed').map((e) => e.tick), [41]);
  const p20 = at(r, 20);
  assert.equal(p20.state, 'paused');
  assert.equal(p20.sim_tick, 10);
  assert.deepEqual(p20.player.pos, at(r, 11).player.pos);
  assert.equal(p20.time_left_s, at(r, 11).time_left_s);
  assert.equal(p20.player.pulse_cd_s, at(r, 11).player.pulse_cd_s);
  assert.equal(at(r, 41).state, 'playing');
  assert.equal(at(r, 60).sim_tick, 30);
  close(at(r, 60).player.pos[0], 3.0); // 30 sim ticks of movement
});

// ---------------- Charm (Bùa Gió)
test('charm: picked like a mote, 600 ticks, speed 7.2, dash without cooldown, respawns after 2700 ticks', () => {
  const r = run({
    night: 2,
    scenario: quiet({ player: { pos: [35, 0, 0.5] } }),
    inputs: { frames: [{ tick: 1, move: [1, 0] }, { tick: 61, move: [0, 0] }] },
    ticks: 2710, every: 1,
  });
  assert.deepEqual(r.ev('charm_picked')[0], { type: 'event', tick: 1, name: 'charm_picked', data: { charm_id: 'C1', charm_ticks: 600 } });
  assert.equal(at(r, 1).charms[0].available, false);
  assert.equal(at(r, 1).charms[0].respawn_s, 45);
  assert.equal(at(r, 1).player.charm_s, 10);
  close(at(r, 61).player.pos[0] - at(r, 1).player.pos[0], 7.2); // 60 ticks at 7.2 m/s
  assert.equal(at(r, 2700).charms[0].available, false);
  assert.equal(at(r, 2701).charms[0].available, true);
});

test('charm: dash has no cooldown but needs a new press; presses during a dash are ignored', () => {
  const frames = [
    { tick: 0, move: [0, 1], dash: true }, { tick: 5, dash: false }, { tick: 6, dash: true }, // tick 6 press is mid-dash -> ignored
    { tick: 7, dash: false }, { tick: 14, dash: true },
  ];
  const r = run({ scenario: quiet({ player: { charm_ticks: 600 } }), inputs: { frames }, ticks: 40, every: 1 });
  assert.deepEqual(r.ev('dash').map((e) => e.tick), [1, 15]);
  assert.equal(at(r, 1).player.dash_cd_s, 0);
});

// ---------------- Drifters (Gió Lạc)
test('drifter: idle -> chase when carrying >= 5 within 15 m; steals min(3, carried); flees 240 ticks then removed', () => {
  const r = run({ night: 2, scenario: quiet({ player: { carried: 5, invuln_ticks: 600 }, drifters: [{ pos: [10, 1.5, 0] }] }), ticks: 400, every: 1 });
  assert.equal(at(r, 1).drifters[0].state, 'chase');
  const st = r.ev('drifter_steal')[0];
  // Gap 10 m closes at 7 m/s: (10 - 1.2) / (7/60) = 75.4 -> contact at tick 76. Invulnerability does not prevent stealing.
  assert.equal(st.tick, 76);
  assert.deepEqual(st.data, { drifter_id: 'D1', amount: 3, carried: 2 });
  assert.equal(at(r, 76).drifters[0].state, 'flee');
  assert.equal(at(r, 76).drifters[0].stolen, 3);
  assert.equal(at(r, 76 + 239).drifters[0].state, 'flee');
  assert.equal(at(r, 76 + 240).drifters[0].state, 'removed');
  assert.equal(r.ev('player_hit').length, 0); // never costs a flame
});

test('drifter stays idle if carrying < 5 or > 15 m away, and returns to idle when the condition is lost', () => {
  let r = run({ night: 2, scenario: quiet({ player: { carried: 4 }, drifters: [{ pos: [5, 1.5, 0] }] }), ticks: 30, every: 1 });
  assert.equal(r.last.drifters[0].state, 'idle');
  r = run({ night: 2, scenario: quiet({ player: { carried: 5, pos: [-5, 0, 0] }, drifters: [{ pos: [10.5, 1.5, 0] }] }), ticks: 1, every: 1 });
  assert.equal(r.last.drifters[0].state, 'idle');
  // deposit motes while it chases -> carried < 5 -> back to idle
  r = run({ night: 2, scenario: quiet({ player: { carried: 6, pos: [0, 0, 19] }, drifters: [{ pos: [10, 1.5, 19] }] }), inputs: { frames: [{ tick: 3, interact: true }] }, ticks: 6, every: 1 });
  assert.equal(at(r, 2).drifters[0].state, 'chase');
  assert.equal(at(r, 5).drifters[0].state, 'idle');
});

test('Tỏa Sáng on a chasing drifter -> flee without stealing; on a fleeing drifter with loot -> drops it (dropped motes) and vanishes after 120 ticks', () => {
  let r = run({ night: 2, scenario: quiet({ player: { carried: 8 }, drifters: [{ pos: [4, 1.5, 0], state: 'chase' }] }), inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 300, every: 1 });
  // Pulse (stage 7) runs before drifter AI (stage 8), so the drifter must already be chasing at tick 1.
  assert.deepEqual(r.ev('pulse')[0].data.drifter_ids, ['D1']);
  assert.equal(at(r, 1).drifters[0].state, 'flee');
  assert.equal(r.ev('drifter_steal').length, 0);
  r = run({ night: 2, scenario: quiet({ player: { carried: 3 }, drifters: [{ pos: [3, 1.5, 0], state: 'flee', stolen: 3 }] }), inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 200, every: 1 });
  assert.deepEqual(r.ev('drifter_drop')[0].data, { drifter_id: 'D1', amount: 3 });
  const s1 = at(r, 1);
  assert.equal(s1.drifters[0].stolen, 0);
  assert.equal(s1.motes.filter((m) => m.kind === 'dropped').length, 3);
  assert.equal(at(r, 120).drifters[0].state, 'flee');
  assert.equal(at(r, 121).drifters[0].state, 'removed');
});

test('drifters ignore lantern safe zones; Night 2 spawns them at tick 1200 (max 2 alive)', () => {
  const r = run({ night: 2, scenario: quiet({ player: { carried: 5, pos: [0, 0, 20] }, lanterns: [{ id: 'L1', lit: true }], drifters: [{ pos: [0, 1.5, 28] }] }), ticks: 200 });
  assert.equal(r.ev('drifter_steal').length, 1);
  const r2 = run({ night: 2, seed: 4, scenario: { random_shades: false, random_motes: false, player: { pos: [0, 0, 20] }, lanterns: [{ id: 'L1', lit: true }] }, ticks: 3700, every: 100 });
  assert.equal(at(r2, 1100).drifters.length, 0);
  assert.equal(at(r2, 1200).drifters.length, 1);
  assert.equal(at(r2, 1200).drifters[0].id, 'D1');
  assert.equal(at(r2, 2400).drifters.length, 2);
  assert.equal(at(r2, 3600).drifters.filter((d) => d.state !== 'removed').length, 2); // max 2 alive
  const r1 = run({ night: 1, seed: 4, scenario: { random_shades: false }, ticks: 1300, every: 100 });
  assert.equal(at(r1, 1200).drifters.length, 0); // Night 1 has no drifters
});

// ---------------- Night 2 map
// Phase 3: Night 2 lasts 270 s (was 330 s).
test('Night 2: 6 lanterns, 270 s, bridge holds, stepping off the bridge falls', () => {
  let r = run({ night: 2, scenario: quiet({ player: { pos: [20, 0, 0] } }), inputs: { frames: [{ tick: 0, move: [1, 0] }] }, ticks: 360, every: 60 });
  assert.equal(r.snaps[0].time_left_s, 270);
  assert.deepEqual(r.snaps[0].lanterns.map((l) => l.pos), [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]);
  assert.equal(r.ev('player_hit').length, 0);
  assert.ok(r.last.player.pos[0] > 50 && r.last.player.grounded); // walked across into island B
  r = run({ night: 2, scenario: quiet({ player: { pos: [35, 0, 0] } }), inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 200 });
  assert.equal(r.ev('player_hit')[0].data.by, 'fall');
});

test('Night 2 jump pad: launched (vy 14, 24 m/s toward the other island), lands on island B after ~1.4 s', () => {
  const r = run({ night: 2, scenario: quiet({ player: { pos: [20, 0, 18] } }), ticks: 120, every: 1 });
  const s2 = at(r, 2).player;
  close(Math.hypot(s2.vel[0], s2.vel[2]), 24);
  const landed = r.snaps.find((s) => s.tick > 2 && s.player.grounded);
  assert.ok(landed.tick >= 80 && landed.tick <= 90, String(landed.tick)); // 2*14/20 = 1.4 s = 84 ticks
  assert.ok(dist(landed.player.pos, [70, 0, 0]) < 28, JSON.stringify(landed.player.pos));
  assert.equal(r.ev('player_hit').length, 0);
});

test('jump-pad launch velocity ignores move input (still allows dash)', () => {
  const r = run({ night: 2, scenario: quiet({ player: { pos: [20, 0, 18] } }), inputs: { frames: [{ tick: 5, move: [-1, 0] }] }, ticks: 30, every: 1 });
  close(Math.hypot(at(r, 20).player.vel[0], at(r, 20).player.vel[2]), 24);
});

// ---------------- Night 3 map
// Phase 3: Night 3 lasts 300 s (was 360 s).
test('Night 3: 7 lanterns at their tier heights, 300 s, shade speed 4.5 m/s', () => {
  const r = run({ night: 3, scenario: quiet({ player: { pos: [30, 0, -30] }, shades: [{ pos: [33, 1, -30] }] }), ticks: 60, every: 1 });
  assert.equal(r.snaps[0].time_left_s, 300);
  assert.deepEqual(r.snaps[0].lanterns.map((l) => l.pos[1]), [6, 3, 3, 0, 0, 0, 0]);
  // (3 - 1) / (4.5/60) = 26.7 -> hit at tick 27
  assert.equal(r.ev('player_hit')[0].tick, 27);
});

test('Night 3 tiers: walls block walking up, ramps lead up to tier 1, the bell tower is solid', () => {
  // tier 0 -> tier 1 wall at r = 12 (z > 0): blocked
  let r = run({ night: 3, scenario: quiet({ player: { pos: [0, 0, 10] } }), inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 60 });
  assert.ok(r.last.player.pos[2] <= 12 && r.last.player.pos[1] === 0); // stops just before the r = 12 wall (rounded to 12.0)
  // ramp at 30 deg: start at r = 32 on the ramp axis, walk inward -> reach Y = 3 at r <= 24
  const a = Math.PI / 6;
  r = run({ night: 3, scenario: quiet({ player: { pos: [32 * Math.cos(a), 0, 32 * Math.sin(a)] } }), inputs: { frames: [{ tick: 0, move: [-Math.cos(a), -Math.sin(a)] }] }, ticks: 120, every: 10 });
  const top = r.snaps.find((s) => Math.hypot(s.player.pos[0], s.player.pos[2]) < 23.5);
  assert.ok(top, 'reached tier 1');
  assert.equal(top.player.pos[1], 3);
  assert.equal(r.ev('player_hit').length, 0);
  // tower: from tier 2 walking into the center stops at r >= 2
  r = run({ night: 3, scenario: quiet({ player: { pos: [5, 6, 0] } }), inputs: { frames: [{ tick: 0, move: [-1, 0] }] }, ticks: 120 });
  assert.ok(Math.hypot(r.last.player.pos[0], r.last.player.pos[2]) >= 2 - 1e-6);
  assert.equal(r.last.player.pos[1], 6);
});

test('Night 3 stepping off tier 1 drops to tier 0 (no fall event)', () => {
  const r = run({ night: 3, scenario: quiet({ player: { pos: [0, 3, 13] .map((v, i) => (i === 2 ? 23 : v)) } }), inputs: { frames: [{ tick: 0, move: [0, 1] }] }, ticks: 60, every: 1 });
  assert.equal(r.last.player.pos[1], 0);
  assert.equal(r.last.player.grounded, true);
  assert.equal(r.ev('player_hit').length, 0);
});

test('Night 3 jump pad (0,3,13): vy 12 + 8 m/s toward -Z, lands on tier 2 (Y = 6)', () => {
  const r = run({ night: 3, scenario: quiet({ player: { pos: [0, 3, 13] } }), ticks: 90, every: 1 });
  const landed = r.snaps.find((s) => s.tick > 2 && s.player.grounded);
  assert.equal(landed.player.pos[1], 6);
  assert.ok(Math.hypot(landed.player.pos[0], landed.player.pos[2]) < 8);
});

test('Night 3 wind: every 30 s a 5 s gust pushes the player 2 m/s in a random direction', () => {
  const r = run({ night: 3, seed: 11, scenario: { random_shades: false, random_motes: false, random_drifters: false }, ticks: 2200, every: 50 });
  assert.equal(at(r, 1750).wind.active, false);
  const w = at(r, 1800).wind;
  assert.equal(w.active, true);
  assert.ok(Number.isInteger(w.dir_deg) && w.dir_deg >= 0 && w.dir_deg < 360);
  assert.equal(at(r, 2100).wind.active, false);
  const p0 = at(r, 1750).player.pos, p1 = at(r, 2150).player.pos;
  close(dist(p0, p1), 10, 0.05); // 2 m/s * 5 s
  const a = (w.dir_deg * Math.PI) / 180;
  close((p1[0] - p0[0]) / 10, Math.cos(a), 0.01);
  close((p1[2] - p0[2]) / 10, Math.sin(a), 0.01);
});

test('headless full night (21 600 ticks) completes quickly on every night', () => {
  for (const night of [1, 2, 3]) {
    const t0 = Date.now();
    run({ night, seed: 9, scenario: { time_left_s: 360 }, ticks: 21600, every: 600 });
    assert.ok(Date.now() - t0 < 30000);
  }
});
