# AGENTS.md — Đảo Đèn Lồng

Game 3D (Three.js, web) + headless simulation (Node >= 18) for the Day 12 AI SDLC lab.

## Commands
- Install: `npm install` (only needed for the browser game; headless has zero deps)
- Play: `npm start` -> http://localhost:8765
- Test (must be green before you stop): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out.jsonl`
- Evidence: `node scripts/proof.mjs <phase>` -> writes `docs/proof/<phase>/`

## Layout
- `src/sim/` pure game logic (no DOM, no Date/Math.random). `world.js` = rules, `files.js` = input/scenario validation, `runner.js` = headless loop.
- `src/headless.js` CLI (Test Contract). `src/web/` renderer only — reads sim state, never changes rules.
- `game.contract.json` is the single source of truth for tuning numbers; sim loads it at runtime.
- `tests/*.test.js` (node:test). `tests/scenarios/` proof scenarios. `docs/notes/` assumptions, AI log, retro.

## Rules
- Read the current phase spec in `docs/specs/` before coding; quote it, never invent requirements. Unclear -> write an assumption in `docs/notes/phase-N.md`.
- Determinism: randomness only via `w.rng` (seeded). Timers in ticks, not seconds.
- Creative extras live in `src/web/` only and must not change headless output.
- Malformed inputs/scenario -> `InputError` -> exit code 2.
- Never hand-edit files in `docs/proof/`; regenerate with the proof script.
- Changing a rule? Update the test with a one-line reason; never delete a test silently.
- No secrets, `.env`, or API keys in the repo.
