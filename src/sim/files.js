// Validation of contract input files (inputs.json, scenario.json).
// Any violation throws InputError -> headless exits with code 2.
export class InputError extends Error {}

const fail = (msg) => { throw new InputError(msg); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

// Accepts [x, y, z], [x, z] or {x, y?, z}.
export function parseVec(v, where) {
  if (Array.isArray(v)) {
    if (v.length === 3 && v.every(isNum)) return { x: v[0], y: v[1], z: v[2] };
    if (v.length === 2 && v.every(isNum)) return { x: v[0], y: 0, z: v[1] };
  } else if (isObj(v) && isNum(v.x) && isNum(v.z) && (v.y === undefined || isNum(v.y))) {
    return { x: v.x, y: v.y ?? 0, z: v.z };
  }
  return fail(`${where}: expected position [x, y, z]`);
}

const BUTTONS = ['jump', 'interact', 'pulse', 'dash', 'pause'];
const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];
const DRIFTER_STATES = ['idle', 'chase', 'flee', 'removed'];

export function parseInputs(raw) {
  if (!isObj(raw) || !Array.isArray(raw.frames)) fail('inputs: expected {"frames": [...]}');
  let last = -1;
  const frames = raw.frames.map((f, i) => {
    const where = `inputs.frames[${i}]`;
    if (!isObj(f)) fail(`${where}: expected object`);
    if (!isNonNegInt(f.tick)) fail(`${where}.tick: expected non-negative integer`);
    if (f.tick <= last) fail(`${where}.tick: ticks must be strictly increasing (got ${f.tick} after ${last})`);
    last = f.tick;
    const out = { tick: f.tick };
    if (f.move !== undefined) {
      if (!Array.isArray(f.move) || f.move.length !== 2 || !f.move.every(isNum) || f.move.some((c) => c < -1 || c > 1)) {
        fail(`${where}.move: expected [x, z] with components in [-1, 1]`);
      }
      out.move = [f.move[0], f.move[1]];
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) fail(`${where}.cam_yaw_deg: expected number`);
      out.cam_yaw_deg = f.cam_yaw_deg;
    }
    for (const b of BUTTONS) {
      if (f[b] !== undefined) {
        if (typeof f[b] !== 'boolean') fail(`${where}.${b}: expected boolean`);
        out[b] = f[b];
      }
    }
    return out;
  });
  return frames;
}

// Returns a function inputAt(k) that must be called with k = 0, 1, 2, ... in order.
// Each frame only changes the fields it contains; others persist.
export function inputCursor(frames) {
  const cur = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let i = 0;
  return (k) => {
    while (i < frames.length && frames[i].tick <= k) {
      Object.assign(cur, frames[i]);
      i++;
    }
    return cur;
  };
}

export function parseScenario(raw, tuning, lanternCount = tuning.lantern_count_night1) {
  if (!isObj(raw)) fail('scenario: expected JSON object');
  const sc = {};
  if (raw.player !== undefined) {
    if (!isObj(raw.player)) fail('scenario.player: expected object');
    sc.player = {};
    if (raw.player.pos !== undefined) sc.player.pos = parseVec(raw.player.pos, 'scenario.player.pos');
    if (raw.player.carried !== undefined) {
      if (!isNonNegInt(raw.player.carried)) fail('scenario.player.carried: expected non-negative integer');
      sc.player.carried = raw.player.carried;
    }
    if (raw.player.flames !== undefined) {
      if (!isNonNegInt(raw.player.flames)) fail('scenario.player.flames: expected non-negative integer');
      sc.player.flames = raw.player.flames;
    }
    for (const k of ['invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']) {
      if (raw.player[k] !== undefined) {
        if (!isNonNegInt(raw.player[k])) fail(`scenario.player.${k}: expected non-negative integer`);
        sc.player[k] = raw.player[k];
      }
    }
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== 'boolean') fail(`scenario.${k}: expected boolean`);
      sc[k] = raw[k];
    }
  }
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) fail('scenario.motes: expected array');
    sc.motes = raw.motes.map((m, i) => {
      const where = `scenario.motes[${i}]`;
      if (isObj(m) && m.pos !== undefined) {
        if (m.id !== undefined && typeof m.id !== 'string') fail(`${where}.id: expected string`);
        if (m.kind !== undefined && m.kind !== 'random' && m.kind !== 'dropped') fail(`${where}.kind: expected random|dropped`);
        if (m.ttl_s !== undefined && (!isNum(m.ttl_s) || m.ttl_s <= 0)) fail(`${where}.ttl_s: expected positive number`);
        return { id: m.id, pos: parseVec(m.pos, where + '.pos'), kind: m.kind, ttl_ticks: m.ttl_s !== undefined ? Math.round(m.ttl_s * 60) : undefined };
      }
      return { pos: parseVec(m, where) };
    });
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) fail('scenario.shades: expected array');
    const seen = new Set();
    sc.shades = raw.shades.map((s, i) => {
      const where = `scenario.shades[${i}]`;
      if (!isObj(s)) fail(`${where}: expected object with pos`);
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || !s.id) fail(`${where}.id: expected string`);
        if (seen.has(s.id)) fail(`${where}.id: duplicate id ${s.id}`);
        seen.add(s.id);
      }
      const out = { id: s.id, pos: parseVec(s.pos, where + '.pos') };
      if (s.state !== undefined) {
        if (!SHADE_STATES.includes(s.state)) fail(`${where}.state: expected one of ${SHADE_STATES.join(', ')}`);
        out.state = s.state;
      }
      if (s.state_ticks_left !== undefined) {
        if (!isNonNegInt(s.state_ticks_left)) fail(`${where}.state_ticks_left: expected non-negative integer`);
        out.state_ticks_left = s.state_ticks_left;
      }
      return out;
    });
  }
  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) fail('scenario.drifters: expected array');
    sc.drifters = raw.drifters.map((d, i) => {
      const where = `scenario.drifters[${i}]`;
      if (!isObj(d)) fail(`${where}: expected object with pos`);
      if (d.id !== undefined && (typeof d.id !== 'string' || !d.id)) fail(`${where}.id: expected string`);
      const out = { id: d.id, pos: parseVec(d.pos, where + '.pos') };
      if (d.state !== undefined) {
        if (!DRIFTER_STATES.includes(d.state)) fail(`${where}.state: expected one of ${DRIFTER_STATES.join(', ')}`);
        out.state = d.state;
      }
      if (d.stolen !== undefined) {
        if (!isNonNegInt(d.stolen)) fail(`${where}.stolen: expected non-negative integer`);
        out.stolen = d.stolen;
      }
      if (d.state_ticks_left !== undefined) {
        if (!isNonNegInt(d.state_ticks_left)) fail(`${where}.state_ticks_left: expected non-negative integer`);
        out.state_ticks_left = d.state_ticks_left;
      }
      return out;
    });
  }
  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) fail('scenario.charms: expected array');
    sc.charms = raw.charms.map((c, i) => {
      const where = `scenario.charms[${i}]`;
      if (!isObj(c) || typeof c.id !== 'string' || !c.id) fail(`${where}: expected object with string id`);
      const out = { id: c.id };
      if (c.pos !== undefined) out.pos = parseVec(c.pos, where + '.pos');
      if (c.available !== undefined) {
        if (typeof c.available !== 'boolean') fail(`${where}.available: expected boolean`);
        out.available = c.available;
      }
      if (c.respawn_ticks !== undefined) {
        if (!isNonNegInt(c.respawn_ticks)) fail(`${where}.respawn_ticks: expected non-negative integer`);
        out.respawn_ticks = c.respawn_ticks;
      }
      return out;
    });
  }
  if (raw.lanterns !== undefined) {
    let list;
    if (Array.isArray(raw.lanterns)) list = raw.lanterns;
    else if (isObj(raw.lanterns)) list = Object.entries(raw.lanterns).map(([id, v]) => ({ ...(isObj(v) ? v : {}), id }));
    else fail('scenario.lanterns: expected array or object keyed by id');
    const n = lanternCount;
    sc.lanterns = list.map((l, i) => {
      const where = `scenario.lanterns[${i}]`;
      if (!isObj(l)) fail(`${where}: expected object`);
      const m = /^L(\d+)$/.exec(l.id || '');
      if (!m || Number(m[1]) < 1 || Number(m[1]) > n) fail(`${where}.id: expected L1..L${n}`);
      const out = { id: l.id };
      if (l.pos !== undefined) out.pos = parseVec(l.pos, where + '.pos');
      if (l.lit !== undefined) {
        if (typeof l.lit !== 'boolean') fail(`${where}.lit: expected boolean`);
        out.lit = l.lit;
      }
      if (l.deposited !== undefined) {
        if (!isNonNegInt(l.deposited)) fail(`${where}.deposited: expected non-negative integer`);
        out.deposited = Math.min(l.deposited, tuning.lantern_cost);
      }
      return out;
    });
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s <= 0) fail('scenario.time_left_s: expected positive number');
    sc.time_left_s = raw.time_left_s;
  }
  return sc;
}
