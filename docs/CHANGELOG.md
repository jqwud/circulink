# Changelog

Newest first. Each entry is one batch from `docs/IMPROVEMENT_ROADMAP.md`, or one earlier commit.

## Batch 1: Quick fixes (2026-10-22)

- **Privacy:** `server/uploads/` is ignored by git, so uploaded ID photos can never be committed. Sending a new ID photo deletes the previous one.
- **Uploads:** the server reads each file's first bytes and accepts only real JPG, PNG or WEBP photos, saved with the right extension. A wrong type now gets "Only JPG, PNG or WEBP photos are allowed." (400) instead of a server error (500); a file over 5 MB gets "Photos must be 5 MB or smaller.". Upload handling moved to `server/src/uploads.js`.
- **Photos:** listing, handover and return photos must be files uploaded through the app; links to other websites and made-up paths are refused (`bad_photo`).
- **CSV export:** cells that start with = + - or @ are written as text, so they cannot run as formulas in Excel.
- **Health check:** `/api/health` also checks the database and answers 503 when it is down.
- **Unknown addresses** now get 404 even when not logged in (before: 401).
- **Booking:** one shared definition of "already taken" (`TAKEN_SQL` in `services.js`) is used when asking, approving and booking kits, so an owner can no longer approve dates while the item is still out and overdue. Asking twice for the same item and overlapping dates is refused (`duplicate_request`); a kit sent twice books nothing the second time. A kit request without dates now gets a clear 400 instead of a server error.
- Filipino messages for the four new error codes. Removed the stray `qc` and `query` files and an unused export.

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
