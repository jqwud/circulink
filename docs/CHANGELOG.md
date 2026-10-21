# Changelog

Newest first. Each entry is one batch from `docs/IMPROVEMENT_ROADMAP.md`, or one earlier commit.

## Batch 0: Safety net (2026-10-22)

- Server tests now run only against `hiraman_test` and a temporary upload folder. They refuse any database whose name does not end in `_test`, so `npm test` can no longer wipe the demo data or save test photos into `server/uploads`.
- New fast unit tests for every rule in `server/src/rules.js` (`npm run test:unit`, no database needed).
- The borrow-loop test reports each of its 21 steps through Node's built-in test runner.
- New: `database/create-test-db.sql` (one-time root step), `docs/ARCHITECTURE.md`, `docs/QA_PLAN.md`, `docs/IMPROVEMENT_ROADMAP.md`, this changelog. `docs/SETUP.md` brought up to date.
- Server now asks for Node.js 22 or newer.
- Known behavior recorded by a test, not changed: "alcohol-free" in a listing is refused because "alcohol" is a banned word.

## Earlier commits

- 2026-10-20 · Find the server by itself and always show the splash.
- 2026-10-20 · Apply the Lime Sun palette and the new Pawsa.
- 2026-10-19 · One-click phone testing over USB.
- 2026-10-19 · Add the Android project.
- 2026-10-19 · UI phase 1: design tokens, theme and Nunito.
- 2026-10-19 · Fix photo uploads and ID preview on web.
- 2026-10-19 · Initial commit.
