---
name: verify
description: Run the full verification loop for Đảo Đèn Lồng (unit tests, headless proof scenarios for nights 1-3, determinism, browser screenshots + FPS) and save evidence under docs/proof/<phase>. Use after any change to src/sim, src/web, game.contract.json, or before tagging a phase.
---

# Verify & save evidence

1. `npm test` — all tests must pass. If red: fix code (or fix the test *with a reason* in the phase notes). Do not weaken assertions to go green.
2. `node scripts/proof.mjs phase-N` — runs every `tests/scenarios/*.json` through the real CLI twice (determinism), checks `expect`, writes
   `docs/proof/phase-N/<scenario>.jsonl` + `SUMMARY.md`. Never edit these by hand.
3. Renderer changed? Start `npm start`, then `node scripts/browser-check.mjs docs/proof/phase-N/browser --fps-seconds 20`
   (Node >= 22 + Chrome). It saves screenshots, `console-errors.json` (must be `[]`) and `fps.json` (Ticket-02: avg >= 30 FPS at 1280x720).
4. Mutation check when everything passes on the first try: change one expected number in a scenario, confirm the proof script reports FAIL, revert.
5. Report honestly in `docs/notes/phase-N.md` (what passed, what is manual-only, what is not done).

Scenario format: `{ "requirement", "night", "seed", "ticks", "snapshot_every", "scenario", "inputs", "expect" }`.
`expect` keys: `end_state`, `end_ticks`, `end_score`, `events` (ordered `{name, tick?, data?}` — data is a subset match),
`no_events`, `min_shade_dist_to` (`{pos, gt}`), `player_pos_at` (`[{tick, pos, tol?}]`), `last_snapshot` (`{"dot.path": value}`), or `expect_exit`.
