// Demo bot for ?autoplay (used for screenshots/video). Produces the same contract inputs a player would.
import { distXZ } from '/sim/world.js';

export function autopilot(T) {
  let yaw = 0, tick = 0;
  return (w) => {
    tick++;
    const p = w.player;
    const out = { interact: false, pulse: false, jump: false };
    const threat = w.shades.find((s) => s.state !== 'stunned' && distXZ(s.pos, p.pos) < 2.6);
    if (threat && p.carried >= T.pulse_cost && tick % 2 === 0) out.pulse = true;
    const unlit = w.lanterns.filter((l) => !l.lit);
    const nearestL = unlit.sort((a, b) => distXZ(a.pos, p.pos) - distXZ(b.pos, p.pos))[0];
    const need = nearestL ? 5 - nearestL.deposited : 0;
    let target = null;
    if (nearestL && p.carried > 0 && (p.carried >= T.carry_capacity || p.carried >= need || w.motes.length === 0)) target = nearestL.pos;
    else if (w.motes.length) target = w.motes.reduce((a, b) => (distXZ(a.pos, p.pos) < distXZ(b.pos, p.pos) ? a : b)).pos;
    let dx = 0, dz = 0;
    if (target) {
      const d = distXZ(target, p.pos);
      if (nearestL && target === nearestL.pos && d <= T.interact_radius * 0.8) out.interact = tick % 2 === 0;
      else { dx = (target.x - p.pos.x) / d; dz = (target.z - p.pos.z) / d; }
    }
    // Camera follows travel direction; convert world direction back to camera-relative input.
    if (dx || dz) {
      const want = (Math.atan2(dx, dz) * 180) / Math.PI;
      let diff = ((want - yaw + 540) % 360) - 180;
      yaw += diff * 0.04;
    }
    const th = (yaw * Math.PI) / 180;
    out.move = [dx * Math.cos(th) - dz * Math.sin(th), dx * Math.sin(th) + dz * Math.cos(th)];
    out.cam_yaw_deg = yaw;
    return out;
  };
}
