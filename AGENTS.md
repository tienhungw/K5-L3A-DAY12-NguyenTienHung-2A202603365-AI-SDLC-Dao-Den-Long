# AGENTS.md — Đảo Đèn Lồng

Game 3D (Three.js, web) + headless simulation (Node >= 18) for the Day 12 AI SDLC lab. Contract **v1.1**, 3 nights.

## Commands
- Install: `npm install` (browser game only; headless has zero deps)
- Play: `npm start` -> http://localhost:8765 (`?autoplay&seed=4&night=1&skip=30` = demo bot, `?fps` = FPS overlay)
- Test (must be green before you stop): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1|2|3 --ticks 21600 --out out.jsonl`
- Evidence: `node scripts/proof.mjs phase-N` -> `docs/proof/phase-N/`; browser shots + FPS: `node scripts/browser-check.mjs docs/proof/phase-N/browser` (server running, Node >= 22)

## Layout
- `src/sim/world.js` rules; `step()` follows Ticket-02's 12 numbered stages — keep the `// N.` comments in sync.
- `src/sim/maps.js` the 3 standard maps (`ground(x,z)` = height | null (void) | 'tower'). `src/sim/files.js` input/scenario validation. `runner.js` headless loop.
- `src/web/` renderer only (menus, HUD, audio, autopilot) — reads sim state, never changes rules. Sounds in `src/web/sounds/`.
- `game.contract.json` = tuning numbers (must equal Ticket-02 Part 1); other standard numbers live in `SPEC` in `world.js`.
- `tests/*.test.js` (node:test); `tests/scenarios/p{phase}-*.json` proof scenarios. `docs/specs/` tickets, `docs/notes/` assumptions/AI log/retro.

## Rules
- Read the ticket in `docs/specs/` before coding; quote it, never invent requirements. Unclear -> assumption row in `docs/notes/phase-N.md`.
- Determinism: randomness only via `w.rng`; all timers are tick counters decremented in stage 2 (so pause freezes them).
- Every new feature needs >= 1 scenario in `tests/scenarios/`; expected numbers derived by hand from the ticket, not read back from the sim.
- Creative extras stay in `src/web/` and must not change headless output.
- Malformed inputs/scenario/`--night` -> `InputError` -> exit code 2.
- Never hand-edit `docs/proof/`; regenerate. A rule change that breaks an old test: fix the test + add a row to the "test cũ bị thay" table in the phase notes.
- HUD: write to the DOM only when a value changes (per-frame DOM writes dropped FPS below 30).
- No secrets, `.env`, or API keys in the repo.
