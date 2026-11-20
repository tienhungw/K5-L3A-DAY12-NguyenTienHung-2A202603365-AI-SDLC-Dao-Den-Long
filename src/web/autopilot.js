// Demo bot for ?autoplay (screenshots / video / FPS benchmark). Produces the same contract inputs a player would.
// Simple waypoint navigation per night: bridge on Night 2, ramps + jump pad on Night 3.
import { distXZ } from '/sim/world.js';

const level = (y) => (y > 4.5 ? 2 : y > 1.5 ? 1 : 0);
const RAMPS = [30, 150].map((d) => (d * Math.PI) / 180);

function nextWaypoint(night, from, to) {
  if (night === 2) {
    const sideA = (p) => p.x < 35;
    if (sideA(from) !== sideA(to)) {
      const [nearX, farX] = sideA(from) ? [24, 46] : [46, 24];
      if (Math.abs(from.z) > 1 || (sideA(from) ? from.x < nearX - 0.5 : from.x > nearX + 0.5)) return { x: nearX, z: 0 };
      return { x: farX, z: 0 };
    }
    return to;
  }
  if (night === 3) {
    const lf = level(from.y), lt = level(to.y ?? 0);
    const r = Math.hypot(from.x, from.z);
    if (lt > lf) {
      if (lf === 0) {
        // walk to the nearest ramp foot, then up the ramp
        const a = RAMPS.reduce((b, c) => (Math.hypot(from.x - 32 * Math.cos(c), from.z - 32 * Math.sin(c)) < Math.hypot(from.x - 32 * Math.cos(b), from.z - 32 * Math.sin(b)) ? c : b));
        const foot = { x: 32 * Math.cos(a), z: 32 * Math.sin(a) };
        if (distXZ(from, foot) > 0.6 && r > 24.5) {
          const onAxis = Math.abs(-from.x * Math.sin(a) + from.z * Math.cos(a)) < 0.8 && r <= 33;
          return onAxis ? { x: 22 * Math.cos(a), z: 22 * Math.sin(a) } : foot;
        }
        return { x: 22 * Math.cos(a), z: 22 * Math.sin(a) };
      }
      return { x: 0, z: 13 }; // tier 1 -> tier 2 via the jump pad
    }
    if (lf === 1 && lt === 1) {
      // stay on the half-annulus: go around via r = 18 when the straight line would cut the inner hole
      const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      if (Math.hypot(mid.x, mid.z) < 13) { const a = Math.atan2(mid.z, mid.x); return { x: 18 * Math.cos(a), z: 18 * Math.sin(a) }; }
    }
    if (lf === 0 && lt === 0) {
      // go around the raised centre (tier 1 + tier 2) along r = 30
      const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
      if (Math.hypot(mid.x, mid.z) < 26) {
        const a = Math.atan2(from.z, from.x) + Math.sign(Math.atan2(to.z, to.x) - Math.atan2(from.z, from.x) || 1) * 0.6;
        return { x: 30 * Math.cos(a), z: 30 * Math.sin(a) };
      }
    }
  }
  return to;
}

export function autopilot(T) {
  let yaw = 0, tick = 0;
  return (w) => {
    tick++;
    const p = w.player;
    const out = { interact: false, pulse: false, jump: false, dash: false, pause: false };
    const threat = w.shades.find((s) => (s.state === 'chase' || s.state === 'wander') && distXZ(s.pos, p.pos) < 3.2);
    const thief = w.drifters.find((d) => d.state === 'chase' && distXZ(d.pos, p.pos) < 4);
    if ((threat || thief) && p.carried >= T.pulse_cost && tick % 2 === 0) out.pulse = true;
    const unlit = w.lanterns.filter((l) => !l.lit);
    const lantern = unlit.sort((a, b) => distXZ(a.pos, p.pos) + 8 * Math.abs(a.pos.y - p.pos.y) - (distXZ(b.pos, p.pos) + 8 * Math.abs(b.pos.y - p.pos.y)))[0];
    const need = lantern ? T.lantern_cost - lantern.deposited : 0;
    let target = null;
    const reachable = w.motes.filter((m) => w.night !== 3 || Math.abs(m.pos.y - p.pos.y) < 1.6);
    if (lantern && p.carried > 0 && (p.carried >= T.carry_capacity || p.carried >= need || !reachable.length)) target = lantern.pos;
    else if (reachable.length) target = reachable.reduce((a, b) => (distXZ(a.pos, p.pos) < distXZ(b.pos, p.pos) ? a : b)).pos;
    else if (w.motes.length) target = w.motes[0].pos;
    let dx = 0, dz = 0;
    if (target) {
      const isLantern = lantern && target === lantern.pos;
      if (isLantern && distXZ(target, p.pos) <= T.interact_radius * 0.8 && Math.abs(target.y - p.pos.y) < 1) out.interact = tick % 2 === 0;
      else {
        const wp = nextWaypoint(w.night, p.pos, target);
        const d = distXZ(wp, p.pos) || 1;
        dx = (wp.x - p.pos.x) / d; dz = (wp.z - p.pos.z) / d;
        // steer away from nearby shades; dash out when one is close and Tỏa Sáng is not available
        let ax = 0, az = 0;
        for (const s of w.shades) {
          if (s.state !== 'chase' && s.state !== 'wander') continue;
          const sd = distXZ(s.pos, p.pos);
          if (sd < 6 && sd > 1e-6) { ax += ((p.pos.x - s.pos.x) / sd) * (6 - sd); az += ((p.pos.z - s.pos.z) / sd) * (6 - sd); }
        }
        if (ax || az) {
          const ox = dx, oz = dz;
          dx += ax * 0.6; dz += az * 0.6;
          const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
          // never dodge toward the sea of clouds: probe the ground 2 m ahead
          if (typeof w.map.ground(p.pos.x + dx * 2, p.pos.z + dz * 2) !== 'number') { dx = ox; dz = oz; }
          if (threat && p.carried < T.pulse_cost && p.dashCd === 0 && tick % 2 === 0 && w.night !== 2 && w.night !== 3) out.dash = true;
        }
      }
    }
    // Camera follows travel direction; convert world direction back to camera-relative input (contract C).
    if (dx || dz) {
      const want = (Math.atan2(dx, dz) * 180) / Math.PI;
      yaw += (((want - yaw + 540) % 360) - 180) * 0.04;
    }
    const th = (yaw * Math.PI) / 180;
    out.move = [dx * Math.cos(th) - dz * Math.sin(th), dx * Math.sin(th) + dz * Math.cos(th)];
    out.cam_yaw_deg = yaw;
    return out;
  };
}
