// Runs every tests/scenarios/*.json through the real headless CLI (twice, for determinism),
// checks its `expect` block and writes evidence to docs/proof/<phase>/.
// Usage: node scripts/proof.mjs <phase> [--no-write]
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir, cpus, platform, release, totalmem } from 'node:os';
import { ROOT } from '../src/sim/runner.js';

const phase = process.argv[2] || 'local';
const noWrite = process.argv.includes('--no-write');
const outDir = noWrite ? mkdtempSync(join(tmpdir(), 'proof-')) : join(ROOT, 'docs', 'proof', phase);
const work = mkdtempSync(join(tmpdir(), 'proof-in-'));
mkdirSync(outDir, { recursive: true });

const scDir = join(ROOT, 'tests', 'scenarios');
const files = readdirSync(scDir).filter((f) => f.endsWith('.json')).sort();

function runCli(spec, name, out) {
  const args = [join(ROOT, 'src', 'headless.js'), '--seed', String(spec.seed ?? 1), '--night', String(spec.night ?? 1), '--ticks', String(spec.ticks), '--out', out];
  if (spec.scenario) { const p = join(work, name + '.scenario.json'); writeFileSync(p, JSON.stringify(spec.scenario)); args.push('--scenario', p); }
  if (spec.inputs) { const p = join(work, name + '.inputs.json'); writeFileSync(p, JSON.stringify(spec.inputs)); args.push('--inputs', p); }
  if (spec.snapshot_every) args.push('--snapshot-every', String(spec.snapshot_every));
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { status: r.status, stderr: r.stderr, ms, text: r.status === 0 ? readFileSync(out, 'utf8') : '' };
}

const subset = (want, got) => Object.entries(want).every(([k, v]) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? got && subset(v, got[k]) : JSON.stringify(v) === JSON.stringify(got?.[k]));

function check(expect, lines) {
  const fails = [];
  const end = lines.at(-1);
  const events = lines.filter((l) => l.type === 'event');
  const snaps = lines.filter((l) => l.type === 'snapshot');
  if (end?.type !== 'end') fails.push('last line is not {type:"end"}');
  for (const k of ['state', 'ticks', 'score']) {
    const want = expect['end_' + k];
    if (want !== undefined && end?.[k] !== want) fails.push(`end.${k} = ${end?.[k]}, expected ${want}`);
  }
  if (expect.events) {
    let i = 0;
    for (const want of expect.events) {
      while (i < events.length && !(events[i].name === want.name && (want.tick === undefined || events[i].tick === want.tick) && (!want.data || subset(want.data, events[i].data)))) i++;
      if (i >= events.length) { fails.push(`missing event (in order): ${JSON.stringify(want)}`); break; }
      i++;
    }
  }
  for (const [k, v] of Object.entries(expect.last_snapshot || {})) {
    const got = k.split('.').reduce((o, key) => o?.[key], snaps.at(-1));
    if (JSON.stringify(got) !== JSON.stringify(v)) fails.push(`last snapshot ${k} = ${JSON.stringify(got)}, expected ${JSON.stringify(v)}`);
  }
  for (const n of expect.no_events || []) if (events.some((e) => e.name === n)) fails.push(`unexpected event ${n}`);
  if (expect.min_shade_dist_to) {
    const { pos, gt } = expect.min_shade_dist_to;
    let min = Infinity;
    for (const s of snaps.slice(1)) for (const sh of s.shades) min = Math.min(min, Math.hypot(sh.pos[0] - pos[0], sh.pos[2] - pos[2]));
    if (!(min > gt)) fails.push(`closest shade distance ${min.toFixed(3)} is not > ${gt}`);
  }
  for (const p of expect.player_pos_at || []) {
    const s = snaps.find((x) => x.tick === p.tick);
    if (!s) { fails.push(`no snapshot at tick ${p.tick}`); continue; }
    const d = Math.hypot(...s.player.pos.map((v, j) => v - p.pos[j]));
    if (d > (p.tol ?? 0.01)) fails.push(`tick ${p.tick} player.pos ${JSON.stringify(s.player.pos)} != ${JSON.stringify(p.pos)}`);
  }
  return fails;
}

const rows = [];
let allOk = true;
for (const f of files) {
  const name = basename(f, '.json');
  const spec = JSON.parse(readFileSync(join(scDir, f), 'utf8'));
  const a = runCli(spec, name, join(outDir, name + '.jsonl'));
  const b = runCli(spec, name, join(work, name + '.again.jsonl'));
  let fails = [];
  if (spec.expect_exit !== undefined) {
    if (a.status !== spec.expect_exit) fails.push(`exit ${a.status}, expected ${spec.expect_exit}`);
  } else if (a.status !== 0) fails.push(`exit ${a.status}: ${a.stderr.trim()}`);
  else fails = check(spec.expect || {}, a.text.trim().split('\n').map((l) => JSON.parse(l)));
  const deterministic = a.status === b.status && a.text === b.text;
  if (!deterministic) fails.push('two runs differ (non-deterministic)');
  const ok = fails.length === 0;
  allOk &&= ok;
  rows.push({ name, night: spec.night ?? 1, requirement: spec.requirement, ok, deterministic, ms: a.ms, fails });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${a.ms.toFixed(0)} ms)${ok ? '' : '\n      ' + fails.join('\n      ')}`);
}

const md = [
  `# Proof — ${phase}`,
  '',
  'Generated by `node scripts/proof.mjs ' + phase + '` (do not edit by hand). Each scenario in `tests/scenarios/` is run through the real CLI',
  '`node src/headless.js`, checked against its `expect` block, then run a second time and compared byte-for-byte (determinism).',
  '',
  `Machine: ${platform()} ${release()}, ${cpus()[0]?.model?.trim()} x${cpus().length}, ${(totalmem() / 2 ** 30).toFixed(1)} GB RAM, Node ${process.version}`,
  '',
  '| Scenario | Night | Requirement | Result | Deterministic | Run time |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](../../../tests/scenarios/${r.name}.json) | ${r.night} | ${r.requirement} | ${r.ok ? 'PASS' : 'FAIL: ' + r.fails.join('; ')} | ${r.deterministic ? 'yes' : 'NO'} | ${r.ms.toFixed(0)} ms |`),
  '',
  `**${rows.filter((r) => r.ok).length}/${rows.length} scenarios pass.** Raw outputs: \`*.jsonl\` in this folder.`,
  '',
].join('\n');
writeFileSync(join(outDir, 'SUMMARY.md'), md);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} pass -> ${join(outDir, 'SUMMARY.md')}`);
process.exit(allOk ? 0 : 1);
