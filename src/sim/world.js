// Pure game logic for "Đảo Đèn Lồng" (Test Contract v1.1, Ticket-02). No DOM, no wall clock.
// Shared by the browser game (src/web) and the headless runner. Units: meters, seconds, Y up, 60 ticks/s.
// step() follows the mandatory 12-stage tick order from Ticket-02 (see comments "// N.").
import { createRng } from './rng.js';
import { MAPS } from './maps.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];
export const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain'];
export const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];

// Standard numbers from Ticket-02 that are not part of the contract `tuning` block.
export const SPEC = {
  jump_speed: 7.0,
  gravity: 20,
  step_up: 0.35,            // max height the feet can climb in one tick (ramps); higher = vertical wall
  fall_y: -10,
  fall_wait_ticks: 60,
  pulse_center_y: 0.8,
  pulse_push_ticks: 15,
  shade_hover: 1.0,         // shade.pos = center, 1 m above the ground under it
  shade_spawning_ticks: 60, // assumption: fade-in time before a new shade acts
  shade_wander_speed: 1.5,  // assumption
  shade_detect: 12,
  shade_giveup: 18,
  shade_contact_dy: 1.5,
  shade_recoil_m: 2,
  shade_recoil_ticks: 60,
  shade_first_spawn_tick: 300,
  shade_spawn_min_dist: 15,
  evict_step: 0.2,          // m/tick -> any shade is out of a 6 m zone within 30 ticks
  mote_initial: 20,
  mote_cap: 30,
  mote_spawn_every: 240,
  pickup_dy: 1.5,
  drop_ring: [1.5, 2.5],
  drop_ttl_ticks: 480,
  drifter_speed: 7,
  drifter_idle_speed: 2,
  drifter_max: 2,
  drifter_every: 1200,
  drifter_chase_carry: 5,
  drifter_chase_dist: 15,
  drifter_contact: 1.2,
  drifter_steal_max: 3,
  drifter_flee_ticks: 240,
  drifter_drop_flee_ticks: 120,
  drifter_hover: 1.5,
  charm_ticks: 600,
  charm_respawn_ticks: 2700,
  charm_speed: 7.2,
  wind_every: 1800,
  wind_ticks: 300,
  wind_speed: 2,
  wind_warn_ticks: 120,
  // Ticket-03 (contract v1.2) numbers not in `tuning`
  capacity_per_light: 2,
  relight_score: 40,
  drain_stun_score: 15,
  dawn_lantern_bonus: 50,
  drain_reach: 2,          // XZ distance to the weak lantern that starts draining
  drain_break_dist: 6,     // Mây within 6 m -> drain -> chase
  fuel_drain_event_every: 60,
};

const EPS = 1e-9;
const sec2ticks = (s) => Math.round(s * TICK_RATE);
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const idNum = (id) => Number(String(id).replace(/^\D+/, '')) || 0;
export function r3(v) {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
}

// Fuel is stored as integer units of 1/60 fuel (Ticket-03 §1 "Độ chính xác").
export const fuelUnits = (fuel) => Math.round(fuel * TICK_RATE);
export const fuelOf = (l) => (l.lit ? Math.round((l.fuelU / TICK_RATE) * 10) / 10 : 0);
export const capacity = (w) => Math.min(w.tuning.capacity_max, w.tuning.carry_capacity + SPEC.capacity_per_light * w.player.successfulLights);
const isSafe = (w, l) => l.lit && l.fuelU >= fuelUnits(w.tuning.low_fuel_threshold);

export function nightDuration(tuning, night) {
  return tuning[MAPS[night].duration_key];
}

// ---------------------------------------------------------------- setup
export function createWorld(tuning, seed = 0, scenario = null, night = 1) {
  const map = MAPS[night];
  const sc = scenario || {};
  const T = tuning;
  const w = {
    tuning, night, map,
    rng: createRng(seed),
    tick: 0, simTick: 0,
    state: 'playing', paused: false, result: null, reason: null,
    score: 0,
    timeStart: sc.time_left_s ?? nightDuration(T, night),
    k: {
      invuln: sec2ticks(T.invuln_s), stun: sec2ticks(T.pulse_stun_s), pulseCd: sec2ticks(T.pulse_cooldown_s),
      dash: sec2ticks(T.dash_duration_s), dashCd: sec2ticks(T.dash_cooldown_s),
    },
    player: {
      pos: { ...map.start }, vel: { x: 0, y: 0, z: 0 }, grounded: true, facing: { x: 0, z: 1 },
      flames: T.flames, carried: 0,
      invuln: 0, dashCd: 0, pulseCd: 0, charm: 0,
      dashTicks: 0, dashDir: null, dashAir: false, launch: null, fallWait: 0, successfulLights: 0,
    },
    lanterns: map.lanterns.map((l) => ({ id: l.id, pos: { ...l.pos }, lit: false, deposited: 0, justLit: false, fuelU: 0, everLit: false, relit: 0 })),
    shades: [], motes: [], drifters: [], charms: [],
    next: { S: 1, M: 1, D: 1 },
    randomMotes: sc.random_motes !== false,
    randomShades: sc.random_shades !== false,
    randomDrifters: map.drifters && sc.random_drifters !== false,
    windEnabled: sc.wind_enabled ?? map.wind,
    wind: { active: false, dirDeg: null, ticks: 0, x: 0, z: 0 },
    prevButtons: Object.fromEntries(BUTTONS.map((b) => [b, false])),
    bench: false, // Ticket-04 benchmark scene (set by the renderer only; never by headless/scenarios)
    fx: { lastPulseTick: -1000, lastHitTick: -1000, lastDashTick: -1000, lastJumpTick: -1000 },
  };
  const p = w.player;

  if (sc.player) {
    const sp = sc.player;
    if (sp.pos) p.pos = { ...sp.pos };
    if (sp.carried != null) p.carried = sp.carried;
    if (sp.flames != null) p.flames = sp.flames;
    if (sp.invuln_ticks != null) p.invuln = sp.invuln_ticks;
    if (sp.dash_cd_ticks != null) p.dashCd = sp.dash_cd_ticks;
    if (sp.pulse_cd_ticks != null) p.pulseCd = sp.pulse_cd_ticks;
    if (sp.charm_ticks != null) p.charm = sp.charm_ticks;
    if (sp.successful_lights != null) p.successfulLights = sp.successful_lights;
  }
  const g0 = ground(w, p.pos.x, p.pos.z);
  p.grounded = typeof g0 === 'number' && Math.abs(p.pos.y - g0) < 1e-6;

  for (const l of sc.lanterns || []) {
    const target = w.lanterns.find((x) => x.id === l.id);
    if (l.pos) target.pos = { ...l.pos };
    if (l.deposited != null) target.deposited = Math.min(l.deposited, T.lantern_cost);
    if (l.ever_lit != null) target.everLit = l.ever_lit;
    if (l.lit === true) {
      // Ticket-03: lit without fuel -> fuel 100; a lantern set lit is treated as having been lit before.
      target.lit = true; target.deposited = T.lantern_cost;
      target.fuelU = fuelUnits(Math.min(T.fuel_max, l.fuel ?? T.fuel_max));
      if (l.ever_lit == null) target.everLit = true;
      if (target.fuelU <= 0) { target.lit = false; target.fuelU = 0; target.deposited = 0; target.everLit = true; }
    }
    if (l.lit === false) { target.lit = false; target.fuelU = 0; }
  }

  if (sc.motes) {
    for (const m of sc.motes) addMote(w, m.pos, m.kind || 'random', m.ttl_ticks ?? null, m.id);
  } else if (w.randomMotes) {
    const pts = map.motePoints.map((pt, i) => i);
    for (let n = 0; n < SPEC.mote_initial && pts.length; n++) {
      const i = pts.splice(Math.floor(w.rng.next() * pts.length), 1)[0];
      addMote(w, map.motePoints[i], 'random', null);
    }
  }

  if (sc.shades) {
    const explicit = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) do { id = 'S' + w.next.S++; } while (explicit.has(id));
      const sh = addShade(w, s.pos, id, s.state || 'wander');
      if (s.target_lantern_id) sh.target = s.target_lantern_id;
      if (sh.state === 'drain' && !sh.target) sh.target = nearestLantern(w, sh.pos, (l) => l.lit)?.id ?? null;
      if (s.state_ticks_left != null) sh.stateTicks = s.state_ticks_left;
      else if (sh.state === 'stunned') sh.stateTicks = w.k.stun;
      else if (sh.state === 'recoil') sh.stateTicks = SPEC.shade_recoil_ticks;
      if (sh.state === 'recoil') sh.recoilDir = awayDir(p.pos, sh.pos);
    }
  }

  for (const d of sc.drifters || []) {
    const dr = addDrifter(w, d.pos, d.id, d.state || 'idle');
    if (d.stolen != null) dr.stolen = d.stolen;
    if (d.state_ticks_left != null) dr.fleeTicks = d.state_ticks_left;
    else if (dr.state === 'flee') dr.fleeTicks = SPEC.drifter_flee_ticks;
  }

  if (sc.charms) {
    for (const c of sc.charms) {
      const def = map.charms.find((x) => x.id === c.id);
      w.charms.push({
        id: c.id, pos: { ...(c.pos || def?.pos || p.pos) },
        available: c.available !== false, respawn: c.available === false ? (c.respawn_ticks ?? SPEC.charm_respawn_ticks) : 0,
      });
    }
  } else {
    w.charms = map.charms.map((c) => ({ id: c.id, pos: { ...c.pos }, available: true, respawn: 0 }));
  }
  return w;
}

function ground(w, x, z) { return w.map.ground(x, z); }

function addMote(w, pos, kind, ttl, id) {
  if (!id) id = 'M' + w.next.M++;
  else w.next.M = Math.max(w.next.M, idNum(id) + 1);
  const g = ground(w, pos.x, pos.z);
  const y = typeof g === 'number' ? g : (pos.y ?? 0);
  const m = { id, pos: { x: pos.x, y, z: pos.z }, kind, ttl: kind === 'dropped' ? (ttl ?? SPEC.drop_ttl_ticks) : null };
  w.motes.push(m);
  return m;
}

function addShade(w, pos, id, state) {
  if (!id) id = 'S' + w.next.S++;
  else w.next.S = Math.max(w.next.S, idNum(id) + 1);
  const g = ground(w, pos.x, pos.z);
  const y = typeof g === 'number' ? g + SPEC.shade_hover : (pos.y ?? SPEC.shade_hover);
  const s = {
    id, pos: { x: pos.x, y, z: pos.z }, state,
    stateTicks: state === 'spawning' ? SPEC.shade_spawning_ticks : 0,
    pushTicks: 0, pushDir: null, recoilDir: null, evict: false, waypoint: null, wanderTicks: 0, target: null, drainTicks: 0,
  };
  w.shades.push(s);
  return s;
}

function addDrifter(w, pos, id, state) {
  if (!id) id = 'D' + w.next.D++;
  else w.next.D = Math.max(w.next.D, idNum(id) + 1);
  const g = ground(w, pos.x, pos.z);
  const d = {
    id, pos: { x: pos.x, y: typeof g === 'number' ? g + SPEC.drifter_hover : (pos.y ?? SPEC.drifter_hover), z: pos.z },
    state, stolen: 0, fleeTicks: 0, waypoint: null,
  };
  w.drifters.push(d);
  return d;
}

function awayDir(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  return d > EPS ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
}

export function timeLeft(w) {
  return Math.max(0, w.timeStart - w.simTick / TICK_RATE);
}

// Ticket-03: only lit lanterns with fuel >= 30 keep their 6 m safe zone.
const insideSafe = (w, pos) => w.lanterns.find((l) => isSafe(w, l) && distXZ(pos, l.pos) < w.tuning.safe_radius);
function nearestLantern(w, pos, pred) {
  let best = null, bestD = Infinity;
  for (const l of w.lanterns) {
    if (!pred(l)) continue;
    const d = distXZ(pos, l.pos);
    if (d < bestD - EPS || (Math.abs(d - bestD) <= EPS && idNum(l.id) < idNum(best.id))) { best = l; bestD = d; }
  }
  return best;
}

// Moves a shade horizontally by (dx,dz); returns true if it moved. Void and the tower always block.
// Safe zones: 'slide' puts the shade on the 6 m edge (chasing), 'stop' refuses the move (push-back/recoil obstacle).
function shadeMove(w, s, dx, dz, safeMode = 'slide') {
  const nx = s.pos.x + dx, nz = s.pos.z + dz;
  const g = ground(w, nx, nz);
  if (typeof g !== 'number') return false;
  const l = insideSafe(w, { x: nx, z: nz });
  if (l) {
    if (safeMode === 'stop') return false;
    {
      // Blocked at the 6 m edge: slide onto the circle instead of entering it.
      const R = w.tuning.safe_radius + 0.001;
      const u = awayDir(l.pos, { x: nx, z: nz });
      const ex = l.pos.x + u.x * R, ez = l.pos.z + u.z * R;
      const ge = ground(w, ex, ez);
      if (typeof ge !== 'number' || insideSafe(w, { x: ex, z: ez })) return false;
      s.pos.x = ex; s.pos.z = ez; s.pos.y = ge + SPEC.shade_hover;
      return true;
    }
  }
  s.pos.x = nx; s.pos.z = nz; s.pos.y = g + SPEC.shade_hover;
  return true;
}

// ---------------------------------------------------------------- tick
export function step(w, input) {
  if (w.state !== 'playing') return [];
  const T = w.tuning, p = w.player, map = w.map;
  const t = ++w.tick;
  const events = [];
  const emit = (name, data) => events.push({ type: 'event', tick: t, name, data });

  // 1. Read input; pause is handled first.
  const press = {};
  for (const b of BUTTONS) {
    const now = !!input[b];
    press[b] = now && !w.prevButtons[b];
    w.prevButtons[b] = now;
  }
  if (press.pause) {
    if (!w.paused) { w.paused = true; emit('paused', {}); return events; }
    w.paused = false;
    emit('resumed', {});
  } else if (w.paused) {
    return events;
  }

  // 2. Counters: time, cooldowns, invulnerability, stun, charm, dropped-mote TTL, charm respawn.
  w.simTick++;
  const st = w.simTick;
  if (p.invuln > 0) p.invuln--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.pulseCd > 0) p.pulseCd--;
  if (p.charm > 0) p.charm--;
  for (const s of w.shades) if ((s.state === 'stunned' || s.state === 'spawning') && s.stateTicks > 0) s.stateTicks--;
  for (const m of w.motes) if (m.kind === 'dropped') m.ttl--;
  w.motes = w.motes.filter((m) => m.kind !== 'dropped' || m.ttl > 0);
  for (const c of w.charms) if (!c.available && --c.respawn <= 0) { c.available = true; c.respawn = 0; }
  for (const d of w.drifters) if (d.state === 'flee' && --d.fleeTicks <= 0) d.state = 'removed';
  if (w.wind.active && --w.wind.ticks <= 0) { w.wind.active = false; w.wind.dirDeg = null; }
  if (w.windEnabled && st % SPEC.wind_every === 0) {
    const deg = Math.floor(w.rng.next() * 360);
    const a = (deg * Math.PI) / 180;
    w.wind = { active: true, dirDeg: deg, ticks: SPEC.wind_ticks, x: Math.cos(a), z: Math.sin(a) };
  }
  if (p.fallWait > 0 && --p.fallWait === 0 && p.flames > 0) {
    p.pos = { ...map.start }; p.vel = { x: 0, y: 0, z: 0 }; p.grounded = true; p.launch = null;
    p.dashTicks = 0; p.invuln = w.k.invuln; p.facing = { x: 0, z: 1 };
  }
  // 2b. Fuel (Ticket-03): lit lanterns lose 1/60 per tick, plus 5/60 per draining shade; fuel <= 0 -> out.
  for (const l of w.lanterns) {
    if (!l.lit || w.bench) continue; // Ticket-04 bench scene: no fuel burn
    l.fuelU -= Math.round(T.fuel_decay_per_s);
    for (const s of w.shades) {
      if (s.state !== 'drain' || s.target !== l.id) continue;
      l.fuelU -= Math.round(T.drain_per_s);
      if (++s.drainTicks % SPEC.fuel_drain_event_every === 0) {
        emit('fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: Math.max(0, Math.round((l.fuelU / TICK_RATE) * 10) / 10) });
      }
    }
    if (l.fuelU <= 0) {
      l.fuelU = 0; l.lit = false; l.deposited = 0; l.everLit = true;
      emit('lantern_out', { lantern_id: l.id });
    }
  }
  const active = p.fallWait === 0 && p.flames > 0;

  // 3. Move Mây (jump, dash, jump pads, wind), then check falling off the island.
  if (active) movePlayer(w, input, press, emit);

  // 4. Pick up motes and charms (disabled in the Ticket-04 bench scene).
  if (active && !w.bench) {
    const keep = [];
    for (const m of w.motes) {
      if (p.carried < capacity(w) && distXZ(p.pos, m.pos) <= T.pickup_radius + EPS && Math.abs(p.pos.y - m.pos.y) <= SPEC.pickup_dy + EPS) {
        p.carried++;
        emit('mote_picked', { carried: p.carried });
      } else keep.push(m);
    }
    w.motes = keep;
    for (const c of w.charms) {
      if (c.available && distXZ(p.pos, c.pos) <= T.pickup_radius + EPS && Math.abs(p.pos.y - c.pos.y) <= SPEC.pickup_dy + EPS) {
        c.available = false; c.respawn = SPEC.charm_respawn_ticks; p.charm = SPEC.charm_ticks;
        emit('charm_picked', { charm_id: c.id, charm_ticks: SPEC.charm_ticks });
      }
    }
  }

  // 5. Interact (Ticket-03): candidates = unlit lanterns or lit ones not full of fuel; nearest, tie -> smaller id.
  if (active && press.interact && p.carried > 0) {
    const fullU = fuelUnits(T.fuel_max), perMoteU = fuelUnits(T.fuel_per_mote);
    const best = nearestLantern(w, p.pos, (l) => (!l.lit || l.fuelU < fullU) && distXZ(p.pos, l.pos) <= T.interact_radius + EPS);
    if (best && !best.lit) {
      const cost = best.everLit ? T.relight_cost : T.lantern_cost;
      const amount = Math.max(0, Math.min(p.carried, cost - best.deposited));
      p.carried -= amount;
      best.deposited += amount;
      w.score += amount * T.score.per_mote;
      emit('deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= cost) {
        const relight = best.everLit;
        best.lit = true; best.justLit = true; best.everLit = true; best.fuelU = fullU;
        if (relight) { best.relit++; w.score += SPEC.relight_score; } else w.score += T.score.per_lantern;
        p.successfulLights++;
        emit('lantern_lit', { lantern_id: best.id, relight });
      }
    } else if (best) {
      const used = Math.min(p.carried, Math.ceil((fullU - best.fuelU) / perMoteU));
      best.fuelU = Math.min(fullU, best.fuelU + perMoteU * used);
      p.carried -= used;
      w.score += used * T.score.per_mote;
      emit('refuel', { lantern_id: best.id, amount: used, fuel: fuelOf(best) });
      if (isSafe(w, best)) best.justLit = true; // refuelled to >= 30: shades inside are pushed out like on lighting
    }
  }

  // 6. Safe zones: shades caught inside a newly lit zone are evicted to the edge (<= 30 ticks, harmless meanwhile).
  for (const l of w.lanterns) {
    if (!l.justLit) continue;
    l.justLit = false;
    for (const s of w.shades) if (distXZ(s.pos, l.pos) < T.safe_radius) { s.evict = true; if (s.state === 'drain') s.state = 'wander'; }
  }
  for (const s of w.shades) {
    if (!s.evict) continue;
    const l = insideSafe(w, s.pos);
    if (!l) { s.evict = false; continue; }
    const u = awayDir(l.pos, s.pos);
    const d = distXZ(s.pos, l.pos);
    const stepLen = Math.min(SPEC.evict_step, T.safe_radius + 0.001 - d);
    s.pos.x += u.x * stepLen; s.pos.z += u.z * stepLen;
    const g = ground(w, s.pos.x, s.pos.z);
    if (typeof g === 'number') s.pos.y = g + SPEC.shade_hover;
    if (!insideSafe(w, s.pos)) s.evict = false;
  }

  // 7. Tỏa Sáng (pulse): targets locked this tick, 3D distance from feet + 0.8 m.
  if (active && press.pulse && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCd = w.k.pulseCd;
    const c = { x: p.pos.x, y: p.pos.y + SPEC.pulse_center_y, z: p.pos.z };
    const stunned = [], hitDrifters = [], drops = [];
    for (const s of w.shades) {
      if (dist3(c, s.pos) <= T.pulse_radius + EPS) {
        w.score += s.state === 'drain' ? SPEC.drain_stun_score : T.score.per_stun;
        s.state = 'stunned'; s.stateTicks = w.k.stun;
        s.pushTicks = SPEC.pulse_push_ticks; s.pushDir = awayDir(p.pos, s.pos);
        stunned.push(s.id);
      }
    }
    for (const d of w.drifters) {
      if (d.state === 'removed' || dist3(c, d.pos) > T.pulse_radius + EPS) continue;
      if (d.state === 'chase') { d.state = 'flee'; d.fleeTicks = SPEC.drifter_flee_ticks; hitDrifters.push(d.id); }
      else if (d.state === 'flee' && d.stolen > 0) {
        for (let i = 0; i < d.stolen; i++) addMote(w, { x: d.pos.x, y: 0, z: d.pos.z }, 'dropped', SPEC.drop_ttl_ticks);
        drops.push({ drifter_id: d.id, amount: d.stolen });
        d.stolen = 0; d.fleeTicks = SPEC.drifter_drop_flee_ticks;
        hitDrifters.push(d.id);
      }
    }
    w.fx.lastPulseTick = t;
    emit('pulse', { stunned_ids: stunned, drifter_ids: hitDrifters });
    for (const d of drops) emit('drifter_drop', d);
  }

  // 8. Move shades and drifters.
  const targetable = active && !w.bench; // bench: Mây is ignored, shades keep wandering
  const speed = w.night === 3 ? map.shadeSpeed : T.shade_speed; // Night 3: 4.5 m/s
  for (const s of w.shades) {
    if (s.evict) continue;
    const d = distXZ(s.pos, p.pos);
    const reacquire = () => (targetable && d <= SPEC.shade_detect ? 'chase' : 'wander');
    if (s.state === 'spawning') {
      if (s.stateTicks <= 0) s.state = 'wander';
      continue;
    }
    if (s.state === 'stunned') {
      if (s.pushTicks > 0) {
        const len = T.pulse_push_m / SPEC.pulse_push_ticks;
        if (!shadeMove(w, s, s.pushDir.x * len, s.pushDir.z * len, 'stop')) s.pushTicks = 0;
        else s.pushTicks--;
      }
      if (s.stateTicks > 0) continue;
      s.state = 'wander'; // Ticket-03: stun always ends in wander (this tick ends there; detection resumes next tick)
      s.pushTicks = 0;
      continue;
    }
    if (s.state === 'recoil') {
      const len = SPEC.shade_recoil_m / SPEC.shade_recoil_ticks;
      shadeMove(w, s, s.recoilDir.x * len, s.recoilDir.z * len, 'stop');
      if (--s.stateTicks <= 0) s.state = reacquire();
      continue;
    }
    if (s.state === 'drain') {
      const l = w.lanterns.find((x) => x.id === s.target);
      if (targetable && d <= SPEC.drain_break_dist + EPS) s.state = 'chase';
      else if (!l || !l.lit || isSafe(w, l) || distXZ(s.pos, l.pos) > SPEC.drain_reach + EPS) s.state = 'wander';
      else continue; // stays still and drains (stage 2)
    }
    if (s.state === 'wander' && targetable && d <= SPEC.shade_detect) s.state = 'chase';
    else if (s.state === 'chase' && (!targetable || d > SPEC.shade_giveup)) s.state = 'wander';
    if (s.state === 'chase') {
      const stepLen = Math.min(d, speed * DT);
      if (d > EPS) {
        const ux = (p.pos.x - s.pos.x) / d, uz = (p.pos.z - s.pos.z) / d;
        if (!shadeMove(w, s, ux * stepLen, uz * stepLen)) {
          shadeMove(w, s, ux * stepLen, 0) || shadeMove(w, s, 0, uz * stepLen);
        }
      }
    } else {
      // wander (Ticket-03): head for the nearest weak lit lantern (fuel < 30), else the nearest unlit one.
      const weak = nearestLantern(w, s.pos, (l) => l.lit && !isSafe(w, l));
      const goal = weak || nearestLantern(w, s.pos, (l) => !l.lit);
      if (goal) {
        s.target = goal.id;
        const gd = distXZ(s.pos, goal.pos);
        if (weak && gd <= SPEC.drain_reach + EPS) { s.state = 'drain'; s.drainTicks = 0; continue; }
        if (gd > SPEC.drain_reach) {
          const stepLen = Math.min(gd - SPEC.drain_reach * 0.9, SPEC.shade_wander_speed * DT);
          const ux = (goal.pos.x - s.pos.x) / gd, uz = (goal.pos.z - s.pos.z) / gd;
          if (!shadeMove(w, s, ux * stepLen, uz * stepLen)) shadeMove(w, s, ux * stepLen, 0) || shadeMove(w, s, 0, uz * stepLen);
          if (weak && distXZ(s.pos, goal.pos) <= SPEC.drain_reach + EPS) { s.state = 'drain'; s.drainTicks = 0; }
        }
        if (insideSafe(w, s.pos)) shadeMove(w, s, 0, 0);
        continue;
      }
      s.target = null;
      if (!s.waypoint || s.wanderTicks <= 0 || distXZ(s.pos, s.waypoint) < 0.3) {
        const a = w.rng.next() * Math.PI * 2, r = 3 + w.rng.next() * 7;
        s.waypoint = { x: s.pos.x + Math.cos(a) * r, z: s.pos.z + Math.sin(a) * r };
        s.wanderTicks = 240;
      }
      s.wanderTicks--;
      const wd = distXZ(s.pos, s.waypoint);
      if (wd > EPS) {
        const stepLen = Math.min(wd, SPEC.shade_wander_speed * DT);
        if (!shadeMove(w, s, ((s.waypoint.x - s.pos.x) / wd) * stepLen, ((s.waypoint.z - s.pos.z) / wd) * stepLen)) s.waypoint = null;
      }
    }
    if (insideSafe(w, s.pos)) shadeMove(w, s, 0, 0); // blocked at the 6 m edge
  }

  for (const dr of w.drifters) {
    if (dr.state === 'removed') continue;
    const want = targetable && p.carried >= SPEC.drifter_chase_carry && distXZ(dr.pos, p.pos) <= SPEC.drifter_chase_dist + EPS;
    if (dr.state === 'idle' && want) dr.state = 'chase';
    else if (dr.state === 'chase' && !want) dr.state = 'idle';
    let vx = 0, vz = 0, sp = 0;
    if (dr.state === 'chase') {
      const u = awayDir(dr.pos, p.pos); vx = u.x; vz = u.z; sp = SPEC.drifter_speed;
      const d = distXZ(dr.pos, p.pos);
      sp = Math.min(sp, d / DT);
    } else if (dr.state === 'flee') {
      const u = awayDir(p.pos, dr.pos); vx = u.x; vz = u.z; sp = SPEC.drifter_speed;
    } else {
      if (!dr.waypoint || distXZ(dr.pos, dr.waypoint) < 0.3) {
        dr.waypoint = map.shadePoints[Math.floor(w.rng.next() * map.shadePoints.length)];
      }
      const u = awayDir(dr.pos, dr.waypoint); vx = u.x; vz = u.z;
      sp = Math.min(SPEC.drifter_idle_speed, distXZ(dr.pos, dr.waypoint) / DT);
    }
    dr.pos.x += vx * sp * DT; dr.pos.z += vz * sp * DT;
    const g = ground(w, dr.pos.x, dr.pos.z);
    if (typeof g === 'number') dr.pos.y = g + SPEC.drifter_hover;
  }

  // 9. Contact: drifters steal first, then shades hit (ascending id). No damage in the bench scene.
  if (active && !w.bench) {
    for (const dr of [...w.drifters].sort((a, b) => idNum(a.id) - idNum(b.id))) {
      if (dr.state !== 'chase' || p.carried <= 0) continue;
      if (distXZ(dr.pos, p.pos) <= SPEC.drifter_contact + EPS) {
        const amount = Math.min(SPEC.drifter_steal_max, p.carried);
        p.carried -= amount;
        dr.stolen = amount; dr.state = 'flee'; dr.fleeTicks = SPEC.drifter_flee_ticks;
        emit('drifter_steal', { drifter_id: dr.id, amount, carried: p.carried });
      }
    }
    if (p.invuln === 0) {
      for (const s of [...w.shades].sort((a, b) => idNum(a.id) - idNum(b.id))) {
        if ((s.state !== 'chase' && s.state !== 'wander') || s.evict) continue;
        if (distXZ(s.pos, p.pos) > T.shade_hit_radius + EPS) continue;
        if (Math.abs(s.pos.y - SPEC.shade_hover - p.pos.y) > SPEC.shade_contact_dy + EPS) continue;
        p.flames = Math.max(0, p.flames - 1);
        const dropped = Math.floor(p.carried * T.hit_drop_ratio + EPS);
        p.carried -= dropped;
        for (let i = 0; i < dropped; i++) {
          let pos = null;
          for (let tries = 0; tries < 8 && !pos; tries++) {
            const a = w.rng.next() * Math.PI * 2;
            const r = SPEC.drop_ring[0] + w.rng.next() * (SPEC.drop_ring[1] - SPEC.drop_ring[0]);
            const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
            if (typeof ground(w, x, z) === 'number') pos = { x, z };
          }
          addMote(w, pos || { x: p.pos.x, y: p.pos.y, z: p.pos.z }, 'dropped', SPEC.drop_ttl_ticks);
        }
        p.invuln = w.k.invuln;
        s.state = 'recoil'; s.stateTicks = SPEC.shade_recoil_ticks; s.recoilDir = awayDir(p.pos, s.pos);
        w.fx.lastHitTick = t;
        emit('player_hit', { by: 'shade', flames: p.flames, dropped });
        break;
      }
    }
  }

  // 10. Scheduled spawns (new entities interact from the next tick).
  if (w.randomMotes && st % SPEC.mote_spawn_every === 0) {
    const randomCount = w.motes.filter((m) => m.kind === 'random').length;
    if (randomCount < SPEC.mote_cap) {
      const free = map.motePoints.filter((pt) => !w.motes.some((m) => m.kind === 'random' && Math.abs(m.pos.x - pt.x) < 1e-6 && Math.abs(m.pos.z - pt.z) < 1e-6));
      if (free.length) addMote(w, free[Math.floor(w.rng.next() * free.length)], 'random', null);
    }
  }
  if (w.randomShades && st >= SPEC.shade_first_spawn_tick && (st - SPEC.shade_first_spawn_tick) % map.shadeInterval === 0) {
    const n = st === SPEC.shade_first_spawn_tick ? 2 : 1;
    const used = [];
    for (let i = 0; i < n; i++) {
      if (w.shades.length >= map.shadeMax) break;
      const valid = map.shadePoints.filter((pt) => !used.includes(pt) && distXZ(pt, p.pos) >= SPEC.shade_spawn_min_dist && !insideSafe(w, pt));
      if (!valid.length) break;
      const pt = valid[Math.floor(w.rng.next() * valid.length)];
      used.push(pt);
      const s = addShade(w, pt, null, 'spawning');
      emit('shade_spawned', { id: s.id });
    }
  }
  if (w.randomDrifters && st % SPEC.drifter_every === 0) {
    const alive = w.drifters.filter((d) => d.state !== 'removed').length;
    if (alive < SPEC.drifter_max) addDrifter(w, map.shadePoints[Math.floor(w.rng.next() * map.shadePoints.length)], null, 'idle');
  }

  // 11. Win / lose (Ticket-03): no early win; at dawn Mây must be alive with >= ceil(0.6 n) lanterns lit.
  if (w.bench) { /* Ticket-04 bench scene: the night never ends */ }
  else if (p.flames <= 0) endGame(w, 'lost', 'no_flames', emit);
  else if (w.timeStart - st / TICK_RATE <= EPS) {
    const lit = w.lanterns.filter((l) => l.lit).length;
    const need = Math.ceil(T.win_ratio * w.lanterns.length - 1e-9);
    if (lit >= need) endGame(w, 'won', 'dawn_survived', emit);
    else endGame(w, 'lost', 'dawn', emit);
  }
  return events;
}

function endGame(w, result, reason, emit) {
  if (result === 'won') {
    const s = w.tuning.score;
    for (const l of w.lanterns) if (l.lit) w.score += SPEC.dawn_lantern_bonus + Math.floor(l.fuelU / TICK_RATE);
    w.score += w.player.flames * s.per_flame_left;
  }
  w.state = result; w.result = result; w.reason = reason;
  emit('game_over', { result, reason });
}

function movePlayer(w, input, press, emit) {
  const T = w.tuning, p = w.player, map = w.map;
  // Camera-relative move input -> world direction (contract C).
  let [mx, mz] = input.move || [0, 0];
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const th = ((input.cam_yaw_deg || 0) * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const mag = Math.hypot(wx, wz);
  if (mag > 1e-6 && !p.launch) p.facing = { x: wx / mag, z: wz / mag };

  // Dash: 14 m/s for 12 ticks; cooldown counted from the start; charm removes the cooldown.
  if (press.dash && p.dashTicks === 0 && (p.dashCd === 0 || p.charm > 0)) {
    p.dashDir = mag > 1e-6 ? { x: wx / mag, z: wz / mag } : { ...p.facing };
    p.facing = { ...p.dashDir };
    p.dashTicks = w.k.dash;
    p.dashAir = !p.grounded;
    p.dashCd = p.charm > 0 ? 0 : w.k.dashCd;
    if (p.dashAir) p.vel.y = 0;
    w.fx.lastDashTick = w.tick;
    emit('dash', {});
  }
  // Jump only when grounded.
  if (press.jump && p.grounded) { p.vel.y = SPEC.jump_speed; p.grounded = false; w.fx.lastJumpTick = w.tick; }

  let hx, hz;
  if (p.dashTicks > 0) { hx = p.dashDir.x * T.dash_speed; hz = p.dashDir.z * T.dash_speed; }
  else if (p.launch) { hx = p.launch.x; hz = p.launch.z; }
  else { const sp = p.charm > 0 ? SPEC.charm_speed : T.player_speed; hx = wx * sp; hz = wz * sp; }
  if (w.wind.active) { hx += w.wind.x * SPEC.wind_speed; hz += w.wind.z * SPEC.wind_speed; }

  // Horizontal move with walls (higher tier edges, bell tower); slide along axes when blocked.
  const passable = (x, z) => {
    const g = map.ground(x, z);
    if (g === 'tower') return false;
    return g === null || g <= p.pos.y + SPEC.step_up;
  };
  const ox = p.pos.x, oz = p.pos.z;
  const nx = ox + hx * DT, nz = oz + hz * DT;
  if (passable(nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
  else if (passable(nx, oz)) p.pos.x = nx;
  else if (passable(ox, nz)) p.pos.z = nz;
  p.vel.x = (p.pos.x - ox) / DT; p.vel.z = (p.pos.z - oz) / DT;

  // Vertical.
  const g = map.ground(p.pos.x, p.pos.z);
  const prevY = p.pos.y;
  if (p.grounded) {
    if (typeof g !== 'number' || p.pos.y - g > SPEC.step_up) { p.grounded = false; p.vel.y = 0; }
    else { p.pos.y = g; p.vel.y = 0; }
  }
  if (!p.grounded) {
    if (p.dashTicks > 0 && p.dashAir) p.vel.y = 0;
    else { p.vel.y -= SPEC.gravity * DT; p.pos.y += p.vel.y * DT; }
    if (typeof g === 'number' && p.vel.y <= 0 && p.pos.y <= g && g <= prevY + SPEC.step_up) {
      p.pos.y = g; p.vel.y = 0; p.grounded = true; p.launch = null;
    }
  }
  if (p.dashTicks > 0) p.dashTicks--;

  // Jump pads: feet on the pad -> launched; launch velocity is kept until landing.
  if (p.grounded && !p.launch) {
    for (const pad of map.pads) {
      if (distXZ(p.pos, pad.pos) <= 1 + EPS && Math.abs(p.pos.y - pad.pos.y) < 0.05) {
        const dir = pad.dir || awayDir(pad.pos, pad.toward);
        p.launch = { x: dir.x * pad.speed, z: dir.z * pad.speed };
        p.vel.y = pad.vy; p.grounded = false;
        break;
      }
    }
  }

  // Fell off the island: exactly once, ignores invulnerability.
  if (p.pos.y < SPEC.fall_y) {
    const lost = p.carried;
    p.flames = Math.max(0, p.flames - 1);
    p.carried = 0;
    p.fallWait = SPEC.fall_wait_ticks;
    p.vel = { x: 0, y: 0, z: 0 }; p.dashTicks = 0; p.launch = null;
    w.fx.lastHitTick = w.tick;
    emit('player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
  }
}

// ---------------------------------------------------------------- output
const v3 = (p) => [r3(p.x), r3(p.y), r3(p.z)];

export function snapshot(w) {
  const p = w.player;
  return {
    type: 'snapshot',
    tick: w.tick,
    sim_tick: w.simTick,
    state: w.paused && w.state === 'playing' ? 'paused' : w.state,
    night: w.night,
    time_left_s: r3(timeLeft(w)),
    score: w.score,
    wind: { active: w.wind.active, dir_deg: w.wind.active ? w.wind.dirDeg : null },
    player: {
      pos: v3(p.pos), vel: v3(p.vel), grounded: p.grounded, invuln: p.invuln > 0,
      dash_cd_s: r3(p.dashCd / TICK_RATE), pulse_cd_s: r3(p.pulseCd / TICK_RATE), charm_s: r3(p.charm / TICK_RATE),
      flames: p.flames, carried: p.carried, capacity: capacity(w),
    },
    lanterns: w.lanterns.map((l) => ({ id: l.id, pos: v3(l.pos), lit: l.lit, deposited: l.deposited, fuel: fuelOf(l), ever_lit: l.everLit, relit_count: l.relit })),
    shades: w.shades.map((s) => ({ id: s.id, pos: v3(s.pos), state: s.state })),
    motes_active: w.motes.length,
    motes: w.motes.map((m) => ({ id: m.id, pos: v3(m.pos), kind: m.kind, ttl_s: m.kind === 'dropped' ? r3(m.ttl / TICK_RATE) : null })),
    drifters: w.drifters.map((d) => ({ id: d.id, pos: v3(d.pos), state: d.state, stolen: d.stolen })),
    charms: w.charms.map((c) => ({ id: c.id, pos: v3(c.pos), available: c.available, respawn_s: r3(c.respawn / TICK_RATE) })),
  };
}
