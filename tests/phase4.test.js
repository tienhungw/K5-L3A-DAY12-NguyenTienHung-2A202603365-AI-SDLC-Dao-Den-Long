// Ticket-04: contract v1.3, bench statistics, soak, local leaderboard + export command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/sim/runner.js';
import { frameStats } from '../src/bench-stats.js';
import { validateName, addEntry, sortEntries, isoWithOffset, MAX_ENTRIES } from '../src/leaderboard.js';

const contract = JSON.parse(readFileSync(join(ROOT, 'game.contract.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'ddl4-'));

test('contract v1.3 declares bench_cmd and soak_cmd and keeps every earlier field', () => {
  assert.equal(contract.contract_version, '1.3');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd', 'bench_cmd', 'soak_cmd', 'tuning']) assert.ok(contract[k], k);
  assert.equal(contract.tuning.fuel_max, 100); // v1.2 tuning unchanged
});

test('frameStats follows the Ticket-04 definitions', () => {
  // 100 frames: 98 x 10 ms, 2 x 50 ms -> N=100, sum=1080, k=1 (ceil(1)), worst=[50]
  const dts = [...Array(98).fill(10), 50, 50];
  assert.deepEqual(frameStats(dts), { frames: 100, avg_fps: 92.6, p1_low_fps: 20, frame_ms_p95: 10 });
  // 201 frames -> k = ceil(2.01) = 3: mean of the 3 largest
  const d2 = [...Array(198).fill(16), 40, 50, 60];
  assert.equal(frameStats(d2).p1_low_fps, 20); // 1000 / 50
  assert.equal(frameStats(d2).frame_ms_p95, 16);
});

test('soak: 10 nights in one process, rotating nights, no crash, RSS within 1.2x', () => {
  const out = join(tmp, 'soak.json');
  const cmd = contract.soak_cmd.split(' ');
  const r = spawnSync(process.execPath, [...cmd.slice(1), '--seed', '7', '--nights', '10', '--out', out], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(s.nights, 10);
  assert.equal(s.crashes, 0);
  assert.equal(s.results.length, 10);
  for (const x of s.results) assert.ok(['won', 'lost'].includes(x));
  assert.ok(s.mem_end_mb <= 1.2 * s.mem_start_mb, `${s.mem_end_mb} > 1.2 x ${s.mem_start_mb}`);
  // deterministic results for the same seed
  const r2 = spawnSync(process.execPath, [...cmd.slice(1), '--seed', '7', '--nights', '10', '--out', out + '2'], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(readFileSync(out + '2', 'utf8')).results, s.results);
});

test('leaderboard names: 3-12 chars of [A-Za-z0-9_]; Vietnamese letters accepted', () => {
  for (const ok of ['Hung', 'abc', 'A_1', 'Nguyễn_Hưng', 'ĐăngĐăng12']) assert.ok(validateName(ok), ok);
  for (const bad of ['ab', 'a'.repeat(13), 'has space', 'x-y', '', null, 'a<b>', '日本語です']) assert.equal(validateName(bad), null, String(bad));
});

test('leaderboard keeps top 10, score desc, ties -> earlier achieved_at first; ISO 8601 with offset', () => {
  let e = [];
  const base = new Date('2026-11-20T10:00:00+07:00').getTime();
  for (let i = 0; i < 12; i++) e = addEntry(e, { name: `P${i}xx`, score: i % 3 === 0 ? 500 : i * 10, nights_won: 1, seed: i }, new Date(base + i * 60000));
  assert.equal(e.length, MAX_ENTRIES);
  assert.deepEqual(e.slice(0, 4).map((x) => x.name), ['P0xx', 'P3xx', 'P6xx', 'P9xx']); // 500s in time order
  for (let i = 1; i < e.length; i++) assert.ok(e[i - 1].score >= e[i].score);
  assert.match(e[0].achieved_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  assert.deepEqual(Object.keys(e[0]).sort(), ['achieved_at', 'name', 'nights_won', 'score', 'seed']);
  assert.throws(() => addEntry([], { name: 'ok_name', score: 1, nights_won: 4, seed: 1 }));
  assert.match(isoWithOffset(new Date()), /[+-]\d\d:\d\d$/);
  assert.deepEqual(sortEntries([{ score: 1, achieved_at: '2026-01-01T00:00:00+00:00' }, { score: 2, achieved_at: '2026-01-02T00:00:00+00:00' }]).map((x) => x.score), [2, 1]);
});

test('run_cmd --export-leaderboard writes {"entries": [...]} in rank order from the on-disk file', () => {
  const file = join(tmp, 'lb.json'), out = join(tmp, 'export.json');
  writeFileSync(file, JSON.stringify({ entries: [
    { name: 'late', score: 100, nights_won: 1, achieved_at: '2026-11-20T12:00:00+07:00', seed: 1 },
    { name: 'top', score: 900, nights_won: 3, achieved_at: '2026-11-20T13:00:00+07:00', seed: 2 },
    { name: 'early', score: 100, nights_won: 1, achieved_at: '2026-11-20T11:00:00+07:00', seed: 3 },
  ] }));
  const [bin, ...args] = contract.run_cmd.split(' ');
  assert.equal(bin, 'node');
  const r = spawnSync(process.execPath, [...args, '--export-leaderboard', out], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, LEADERBOARD_FILE: file } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).entries.map((e) => e.name), ['top', 'early', 'late']);
});
