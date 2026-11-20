// Standard maps for Nights 1-3 (Ticket-02, Part 2). Angles: from +X toward +Z, i.e. (x, z) = (r cos a, r sin a).
const ring = (n, r, startDeg, stepDeg, y = 0, cx = 0, cz = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((startDeg + i * stepDeg) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y, z: cz + r * Math.sin(a) };
  });
const L = (list) => list.map(([x, y, z], i) => ({ id: 'L' + (i + 1), pos: { x, y, z } }));

const ISLAND_A = { x: 0, z: 0 };
const ISLAND_B = { x: 70, z: 0 };

export const MAPS = {
  1: {
    name: 'Đảo Bến',
    duration_key: 'night1_duration_s',
    start: { x: 0, y: 0, z: 0 },
    lanterns: L([[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]]),
    motePoints: [...ring(8, 12, 0, 45), ...ring(16, 33, 0, 22.5)],
    shadePoints: ring(12, 37, 15, 30),
    shadeInterval: 480, shadeMax: 6, shadeSpeed: 4.0,
    pads: [],
    charms: [],
    drifters: false,
    wind: false,
    ground(x, z) { return Math.hypot(x, z) <= 40 ? 0 : null; },
    bounds: 40,
  },
  2: {
    name: 'Đảo Cau',
    duration_key: 'night2_duration_s',
    start: { x: 0, y: 0, z: 0 },
    lanterns: L([[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]]),
    motePoints: [
      ...ring(4, 10, 0, 90, 0, ISLAND_A.x, ISLAND_A.z), ...ring(8, 22, 0, 45, 0, ISLAND_A.x, ISLAND_A.z),
      ...ring(4, 10, 0, 90, 0, ISLAND_B.x, ISLAND_B.z), ...ring(8, 22, 0, 45, 0, ISLAND_B.x, ISLAND_B.z),
    ],
    shadePoints: [...ring(8, 26, 22.5, 45, 0, ISLAND_A.x, ISLAND_A.z), ...ring(8, 26, 22.5, 45, 0, ISLAND_B.x, ISLAND_B.z)],
    shadeInterval: 420, shadeMax: 8, shadeSpeed: 4.0,
    pads: [
      { pos: { x: 20, y: 0, z: 18 }, vy: 14, speed: 24, toward: ISLAND_B },
      { pos: { x: 50, y: 0, z: -18 }, vy: 14, speed: 24, toward: ISLAND_A },
    ],
    charms: [{ id: 'C1', pos: { x: 35, y: 0, z: 0 } }],
    drifters: true,
    wind: false,
    ground(x, z) {
      if (Math.hypot(x - ISLAND_A.x, z - ISLAND_A.z) <= 28) return 0;
      if (Math.hypot(x - ISLAND_B.x, z - ISLAND_B.z) <= 28) return 0;
      if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
      return null;
    },
    bounds: 100,
  },
  3: {
    name: 'Đảo Chuông',
    duration_key: 'night3_duration_s',
    // (0,0,0) is inside the bell tower on Night 3 -> start on tier 0 south of it (assumption, see docs/notes/phase-2.md).
    start: { x: 0, y: 0, z: -30 },
    lanterns: L([[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10], [-35, 0, -10], [20, 0, -35], [-20, 0, -35]]),
    motePoints: [...ring(18, 34, 0, 20, 0), ...ring(8, 18, 20, 20, 3), ...ring(4, 5, 45, 90, 6)],
    shadePoints: ring(16, 43, 0, 22.5),
    shadeInterval: 360, shadeMax: 10, shadeSpeed: 4.5,
    pads: [{ pos: { x: 0, y: 3, z: 13 }, vy: 12, speed: 8, dir: { x: 0, z: -1 } }],
    charms: [{ id: 'C1', pos: { x: 30, y: 0, z: 25 } }, { id: 'C2', pos: { x: -30, y: 0, z: 25 } }],
    drifters: true,
    wind: true,
    tower: { r: 2, top: 14 },
    ground(x, z) {
      const r = Math.hypot(x, z);
      if (r > 45) return null;
      if (r <= 2) return 'tower';
      if (r <= 8) return 6;
      if (r >= 12 && r <= 24 && z > 0) return 3;
      let h = 0;
      for (const deg of [30, 150]) {
        const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        const along = x * c + z * s, perp = Math.abs(-x * s + z * c);
        if (perp <= 1.5 && along >= 24 && along <= 30) h = Math.max(h, (3 * (30 - along)) / 6);
      }
      return h;
    },
    bounds: 45,
  },
};

/** Height of solid ground at (x, z): a number, null (void/sea of clouds) or 'tower' (impassable). */
export function groundAt(night, x, z) {
  return MAPS[night].ground(x, z);
}
