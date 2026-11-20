// Generates tests/scenarios/p1-03-full-win.json: walk origin -> L1 -> ... -> L5,
// picking lantern_cost motes on each leg and depositing them. Expected score is computed here
// from the contract numbers + Ticket-02 rules, independently of the simulation code.
// Phase 2: Night 1 standard map (Ticket-02 Part 2), 10 motes per lantern, score on deposit.
import { readFileSync, writeFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url))).tuning;
const L = [[0, 25], [23.8, 7.7], [14.7, -20.2], [-14.7, -20.2], [-23.8, 7.7]];
const step = C.player_speed / 60;
let at = [0, 0], t = 0;
const frames = [], motes = [];
for (const [x, z] of L) {
  const dx = x - at[0], dz = z - at[1], d = Math.hypot(dx, dz);
  for (let i = 1; i <= C.lantern_cost; i++) { const f = 0.05 + 0.08 * i; motes.push([+(at[0] + dx * f).toFixed(3), 0, +(at[1] + dz * f).toFixed(3)]); }
  const n = Math.ceil(d / step);
  frames.push({ tick: t, move: [+(dx / d).toFixed(6), +(dz / d).toFixed(6)], interact: false });
  frames.push({ tick: t + n, move: [0, 0], interact: true });
  t += n + 1;
  at = [x, z];
}
const endTick = t; // last interact happens in step t-1 -> event tick t
const score = 5 * C.lantern_cost * C.score.per_mote + 5 * C.score.per_lantern
  + Math.floor(C.night1_duration_s - endTick / 60) * C.score.per_second_left + C.flames * C.score.per_flame_left;
const spec = {
  requirement: 'Ván thắng trọn vẹn Đêm 1 (bản đồ chuẩn): gom 50 đom đóm, thắp 5 đèn -> won/all_lit, điểm dự đoán độc lập',
  seed: 1, ticks: 6000, snapshot_every: 60,
  scenario: { random_motes: false, random_shades: false, motes },
  inputs: { frames },
  expect: {
    end_state: 'won', end_ticks: endTick, end_score: score,
    events: ['L1', 'L2', 'L3', 'L4', 'L5'].map((id) => ({ name: 'lantern_lit', data: { lantern_id: id } }))
      .concat([{ name: 'game_over', tick: endTick, data: { result: 'won', reason: 'all_lit' } }]),
    no_events: ['player_hit'],
  },
};
writeFileSync(new URL('../tests/scenarios/p1-03-full-win.json', import.meta.url), JSON.stringify(spec, null, 1) + '\n');
console.log('endTick', endTick, 'score', score);
