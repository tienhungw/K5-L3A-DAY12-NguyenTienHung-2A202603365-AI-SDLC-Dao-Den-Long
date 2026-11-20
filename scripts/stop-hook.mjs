// Claude Code Stop hook: refuse to finish while tests are red.
// Exit code 2 -> Claude is told to keep working and sees stderr.
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try { if (JSON.parse(input || '{}').stop_hook_active) process.exit(0); } catch { /* ignore */ }
  const r = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' });
  if (r.status !== 0) {
    const tail = (r.stdout + r.stderr).split('\n').filter((l) => /not ok|# fail|error:/.test(l)).slice(0, 20).join('\n');
    process.stderr.write(`npm test is RED — fix before stopping:\n${tail}\n`);
    process.exit(2);
  }
  process.exit(0);
});
