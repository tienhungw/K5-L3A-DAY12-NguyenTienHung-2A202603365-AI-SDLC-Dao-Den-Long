// Pure game logic for "Đảo Đèn Lồng". No DOM, no rendering, no wall clock.
// Shared by the browser game (src/web) and the headless runner (src/headless.js).
// Units: meters, Y up, ground at y = 0, fixed 60 ticks/s.
import { createRng } from './rng.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const BUTTONS = ['jump', 'interact', 'pulse', 'dash'];

// Internal constants that are not part of the contract `tuning` block.
export const WORLD = {
  island_radius: 30,       // player and shades are clamped inside this circle (fall_enabled = false)
  lantern_ring_radius: 18, // default lanterns sit on this ring, L1 at +Z
  jump_speed: 6.5,         // m/s
  gravity: 20,             // m/s^2
  shade_hover_y: 1.0,      // shade.pos is its center
  initial_motes: 30,
  min_motes: 20,           // random respawn tops the field up to this many
  mote_respawn_s: 4,
  initial_shades: 2,
  max_shades: 5,
  shade_spawn_s: 40,
  shade_min_spawn_dist: 12,
};

const EPS = 1e-9;
const SAFE_EDGE_PAD = 0.01; // shades are kept strictly outside safe_radius

export function defaultLanterns(count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const a = (k * 2 * Math.PI) / count;
    out.push({
      id: 'L' + (k + 1),
      pos: { x: r3(WORLD.lantern_ring_radius * Math.sin(a)), y: 0, z: r3(WORLD.lantern_ring_radius * Math.cos(a)) },
      lit: false,
      deposited: 0,
    });
  }
  return out;
}

export function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function r3(v) {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}

const sec2ticks = (s) => Math.round(s * TICK_RATE);

/**
 * Build the initial world. `scenario` is an already-validated object (see scenario.js) or null.
 * Scenario setup emits no events and awards no score.
 */
export function createWorld(tuning, seed = 0, scenario = null) {
  const sc = scenario || {};
  const rng = createRng(seed);
  const w = {
    tuning,
    rng,
    tick: 0,
    state: 'playing',
    result: null,
    reason: null,
    score: 0,
    timeStart: sc.time_left_s ?? tuning.night1_duration_s,
    player: {
      pos: { x: 0, y: 0, z: 0 },
      vy: 0,
      flames: tuning.flames,
      carried: 0,
      invulnUntil: 0,
      pulseReadyTick: 0,
    },
    lanterns: defaultLanterns(tuning.lantern_count_night1),
    shades: [],
    motes: [],
    nextShadeNum: 1,
    nextMoteNum: 1,
    randomMotes: sc.random_motes !== false,
    randomShades: sc.random_shades !== false,
    prevButtons: { jump: false, interact: false, pulse: false, dash: false },
    // Visual-only hooks for the renderer (never read by the simulation itself).
    fx: { lastPulseTick: -1000, lastHitTick: -1000 },
  };

  if (sc.player) {
    if (sc.player.pos) w.player.pos = { ...sc.player.pos };
    if (sc.player.carried != null) w.player.carried = sc.player.carried;
    if (sc.player.flames != null) w.player.flames = sc.player.flames;
  }

  if (sc.lanterns) {
    for (const l of sc.lanterns) {
      const target = w.lanterns.find((x) => x.id === l.id);
      if (l.pos) target.pos = { ...l.pos, y: 0 };
      if (l.deposited != null) target.deposited = l.deposited;
      if (l.lit === true) { target.lit = true; target.deposited = Math.max(target.deposited, tuning.lantern_cost); }
      if (l.lit === false) target.lit = false;
    }
  }

  // Motes: explicit list replaces defaults; otherwise random field unless random_motes === false.
  if (sc.motes) {
    for (const m of sc.motes) addMote(w, m.pos, m.id);
  } else if (w.randomMotes) {
    for (let i = 0; i < WORLD.initial_motes; i++) addMote(w, randomMotePos(w));
  }

  if (sc.shades) {
    const explicit = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) {
        do { id = 'S' + w.nextShadeNum++; } while (explicit.has(id));
      }
      addShade(w, s.pos, id);
    }
  } else if (w.randomShades) {
    for (let i = 0; i < WORLD.initial_shades; i++) addShade(w, randomShadePos(w));
  }
  return w;
}

function bumpCounter(w, id, prefix, key) {
  const m = new RegExp('^' + prefix + '(\\d+)$').exec(id);
  if (m) w[key] = Math.max(w[key], Number(m[1]) + 1);
}

function addMote(w, pos, id) {
  if (!id) id = 'M' + w.nextMoteNum++;
  else bumpCounter(w, id, 'M', 'nextMoteNum');
  w.motes.push({ id, pos: { x: pos.x, y: 0, z: pos.z } });
}

function addShade(w, pos, id) {
  if (!id) id = 'S' + w.nextShadeNum++;
  else bumpCounter(w, id, 'S', 'nextShadeNum');
  const y = pos.y == null ? WORLD.shade_hover_y : pos.y;
  w.shades.push({ id, pos: { x: pos.x, y, z: pos.z }, state: 'chase', stunUntil: 0 });
  return id;
}

function randomMotePos(w) {
  // Uniform in an annulus 3..27 m.
  const a = w.rng.range(0, 2 * Math.PI);
  const r = Math.sqrt(w.rng.range(9, 27 * 27));
  return { x: r * Math.sin(a), y: 0, z: r * Math.cos(a) };
}

function randomShadePos(w) {
  let pos = null;
  for (let tries = 0; tries < 12; tries++) {
    const a = w.rng.range(0, 2 * Math.PI);
    const r = w.rng.range(22, 28);
    pos = { x: r * Math.sin(a), y: WORLD.shade_hover_y, z: r * Math.cos(a) };
    if (distXZ(pos, w.player.pos) >= WORLD.shade_min_spawn_dist && !insideSafe(w, pos)) break;
  }
  pushOutOfSafe(w, pos);
  return pos;
}

function insideSafe(w, pos) {
  return w.lanterns.some((l) => l.lit && distXZ(pos, l.pos) <= w.tuning.safe_radius);
}

// Shades fear lit lanterns: keep them strictly outside safe_radius of every lit lantern.
function pushOutOfSafe(w, pos) {
  const R = w.tuning.safe_radius + SAFE_EDGE_PAD;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const l of w.lanterns) {
      if (!l.lit) continue;
      const dx = pos.x - l.pos.x, dz = pos.z - l.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < R) {
        const ux = d > EPS ? dx / d : 1, uz = d > EPS ? dz / d : 0;
        pos.x = l.pos.x + ux * R;
        pos.z = l.pos.z + uz * R;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function clampIsland(pos) {
  const d = Math.hypot(pos.x, pos.z);
  const R = WORLD.island_radius;
  if (d > R) { pos.x *= R / d; pos.z *= R / d; }
}

function endGame(w, result, reason, emit) {
  if (result === 'won') {
    const s = w.tuning.score;
    w.score += Math.floor(timeLeft(w) + EPS) * s.per_second_left + w.player.flames * s.per_flame_left;
  }
  w.state = result;
  w.result = result;
  w.reason = reason;
  emit('game_over', { result, reason });
}

export function timeLeft(w) {
  return Math.max(0, w.timeStart - w.tick / TICK_RATE);
}

/**
 * Advance one fixed step. `input` = { move:[x,z], cam_yaw_deg, jump, interact, pulse, dash }.
 * Returns the events produced in this step (tick = new tick number).
 */
export function step(w, input) {
  if (w.state !== 'playing') return [];
  const T = w.tuning;
  const t = w.tick + 1;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });
  const p = w.player;

  // Buttons fire on false -> true transitions.
  const press = {};
  for (const b of BUTTONS) {
    const now = !!input[b];
    press[b] = now && !w.prevButtons[b];
    w.prevButtons[b] = now;
  }

  // 1. Movement (camera-relative), clamped to the island (no falling in Night 1).
  let [mx, mz] = input.move || [0, 0];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg || 0) * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  p.pos.x += wx * T.player_speed * DT;
  p.pos.z += wz * T.player_speed * DT;
  clampIsland(p.pos);

  // 2. Jump (vertical only; all contract distances are XZ).
  if (press.jump && p.pos.y <= EPS && p.vy === 0) p.vy = WORLD.jump_speed;
  if (p.pos.y > EPS || p.vy !== 0) {
    p.vy -= WORLD.gravity * DT;
    p.pos.y += p.vy * DT;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; }
  }

  // 3. Interact: deposit carried motes into the nearest unlit lantern in range.
  if (press.interact && p.carried > 0) {
    let best = null, bestD = Infinity;
    for (const l of w.lanterns) {
      if (l.lit) continue;
      const d = distXZ(p.pos, l.pos);
      if (d <= T.interact_radius + EPS && d < bestD) { best = l; bestD = d; }
    }
    if (best) {
      const amount = Math.min(p.carried, T.lantern_cost - best.deposited);
      if (amount > 0) {
        p.carried -= amount;
        best.deposited += amount;
        emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
        if (best.deposited >= T.lantern_cost) {
          best.lit = true;
          w.score += T.score.per_lantern;
          emit('lantern_lit', { lantern_id: best.id });
          for (const s of w.shades) pushOutOfSafe(w, s.pos);
          if (w.lanterns.every((l) => l.lit)) {
            w.tick = t;
            endGame(w, 'won', 'all_lit', emit);
            return events;
          }
        }
      }
    }
  }

  // 4. Pulse: spend light (carried motes) to stun and push nearby shades.
  if (press.pulse && t >= p.pulseReadyTick && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseReadyTick = t + sec2ticks(T.pulse_cooldown_s);
    const stunned = [];
    for (const s of w.shades) {
      const d = distXZ(p.pos, s.pos);
      if (d <= T.pulse_radius + EPS) {
        s.state = 'stunned';
        s.stunUntil = t + sec2ticks(T.pulse_stun_s);
        const ux = d > EPS ? (s.pos.x - p.pos.x) / d : 1;
        const uz = d > EPS ? (s.pos.z - p.pos.z) / d : 0;
        s.pos.x += ux * T.pulse_push_m;
        s.pos.z += uz * T.pulse_push_m;
        clampIsland(s.pos);
        pushOutOfSafe(w, s.pos);
        stunned.push(s.id);
      }
    }
    w.score += stunned.length * T.score.per_stun;
    w.fx.lastPulseTick = t;
    emit('pulse', { stunned_ids: stunned });
  }

  // 5. Auto-pickup of motes within pickup_radius while below carry_capacity.
  if (p.carried < T.carry_capacity) {
    const keep = [];
    for (const m of w.motes) {
      if (p.carried < T.carry_capacity && distXZ(p.pos, m.pos) <= T.pickup_radius + EPS) {
        p.carried += 1;
        w.score += T.score.per_mote;
        emit('mote_picked', { carried: p.carried });
      } else keep.push(m);
    }
    w.motes = keep;
  }

  // 6. Shades: recover from stun, then chase the player; never enter a lit lantern's safe zone.
  for (const s of w.shades) {
    if (s.state === 'stunned' && t >= s.stunUntil) s.state = 'chase';
    if (s.state === 'stunned') continue;
    const dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
    const d = Math.hypot(dx, dz);
    const stepLen = Math.min(d, T.shade_speed * DT);
    if (d > EPS) { s.pos.x += (dx / d) * stepLen; s.pos.z += (dz / d) * stepLen; }
    pushOutOfSafe(w, s.pos);
    clampIsland(s.pos);
  }

  // 7. Shade contact costs one flame (with invulnerability window) and drops carried motes.
  if (t >= p.invulnUntil) {
    for (const s of w.shades) {
      if (s.state === 'stunned') continue;
      if (distXZ(p.pos, s.pos) <= T.shade_hit_radius + EPS) {
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * T.hit_drop_ratio + EPS);
        p.carried -= dropped;
        p.invulnUntil = t + sec2ticks(T.invuln_s);
        w.fx.lastHitTick = t;
        emit('player_hit', { by: 'shade', flames: p.flames, dropped });
        break;
      }
    }
  }

  // 8. Random spawns (disabled by scenario random_motes/random_shades = false).
  if (w.randomMotes && t % sec2ticks(WORLD.mote_respawn_s) === 0 && w.motes.length < WORLD.min_motes) {
    addMote(w, randomMotePos(w));
  }
  if (w.randomShades && t % sec2ticks(WORLD.shade_spawn_s) === 0 && w.shades.length < WORLD.max_shades) {
    const id = addShade(w, randomShadePos(w));
    emit('shade_spawned', { id });
  }

  w.tick = t;

  // 9. Lose conditions.
  if (p.flames <= 0) endGame(w, 'lost', 'no_flames', emit);
  else if (w.timeStart - t / TICK_RATE <= EPS) endGame(w, 'lost', 'dawn', emit);
  return events;
}

const v3 = (p) => [r3(p.x), r3(p.y), r3(p.z)];

export function snapshot(w) {
  return {
    type: 'snapshot',
    tick: w.tick,
    sim_tick: w.tick,
    state: w.state,
    time_left_s: r3(timeLeft(w)),
    score: w.score,
    player: { pos: v3(w.player.pos), flames: w.player.flames, carried: w.player.carried },
    lanterns: w.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: w.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: w.motes.length,
    motes: w.motes.map((m) => ({ id: m.id, pos: v3(m.pos) })),
  };
}
