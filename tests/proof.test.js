// Runs every tests/scenarios/*.json through the real CLI (twice) via scripts/proof.mjs in dry mode,
// so `npm test` covers unit tests + headless scenarios + determinism in one command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../src/sim/runner.js';

test('all proof scenarios pass and are deterministic', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'proof.mjs'), 'test', '--no-write'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
