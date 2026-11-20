---
name: verify
description: Run the full verification loop for Đảo Đèn Lồng (unit tests, headless proof scenarios, determinism check) and save evidence under docs/proof/<phase>. Use after any change to src/sim, game.contract.json, or before tagging a phase.
---

# Verify & save evidence

1. `npm test` — all tests must pass. If red: fix code (or fix the test *with a reason* in the phase notes). Do not weaken assertions to go green.
2. `node scripts/proof.mjs phase-N` — runs every `tests/scenarios/*.json`, checks its `expect` block,
   runs each twice to prove determinism, and writes:
   - `docs/proof/phase-N/<scenario>.jsonl` (raw headless output, never edited by hand)
   - `docs/proof/phase-N/SUMMARY.md` (requirement -> scenario -> result table, machine info)
3. Read SUMMARY.md. Any FAIL is reported honestly in `docs/notes/phase-N.md` ("chưa đạt" + reason).
4. Adding a requirement? Add a scenario file: `{ "requirement": "...", "seed": 1, "ticks": N, "scenario": {...}, "inputs": {...}, "expect": {...} }`.
   Supported `expect` keys: `end_state`, `end_ticks`, `end_score`, `events` (list of `{name, tick?, data?}` that must appear in order), `no_events` (names that must not appear), `min_shade_dist_to` (`{pos, gt}`).
