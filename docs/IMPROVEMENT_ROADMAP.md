# Hiraman improvement roadmap

Agreed on 2026-10-22 after a read-only review (Phase 1 project map, Phase 2 analysis with 47 findings). Finding IDs (A1, B2, ...) refer to that review.

**How every batch works:** one commit per batch, undo with `git revert <commit>`. Batches that change the database take a backup first and ship an undo migration. Tests and the build run before each batch is reported.

Effort: **S** under 2 hours, **M** about half a day, **L** a day or more.

## Decisions recorded

| Topic | Decision |
|---|---|
| B1 Lateness | While a borrower has an item they check in once a day (Still with me / I returned it / There's a problem). "I returned it" stops the clock. A missed day sends a reminder; after 2 missed days the owner and staff are alerted. No automatic credit penalty for a missed check-in. |
| B2 Expiry | A pending request expires 7 days after it was made, or earlier if its end date passes. An approved request that is never picked up expires when its end date passes. Credits are refunded and both people are told. |
| B4 Disputes | Staff choose an outcome: fine after all (normal rules) · accident, nobody's fault (owner +1) · damaged, borrower's fault (owner +1, borrower −2) · lost (owner +2, borrower −2, item removed). Never below 0. Numbers live in `rules.js`. |
| D1 Contact | After approval, borrower and owner see each other's phone number until 7 days after the loan closes (shelf items show the barangay hall). Every request has a text thread for borrower, owner and staff. |
| D10 Push notifications | Not now. |
| S1 Hosting and HTTPS | Local only for now. |
| P1 ID photos | Deleted 7 days after approval or rejection; a new upload deletes the old file at once. |
| P2 Privacy | Notice and consent at sign-up and ID upload, delete-account request, "My data" screen. The barangay fills in its Data Protection Officer details. |
| Libraries | Allowed when needed: `url_launcher` (call/text buttons), `flutter_secure_storage` (encrypted token). Dev only: ESLint, Prettier, later Playwright and axe. |

## Batches

| # | Batch | Findings | Effort | Status |
|---|---|---|---|---|
| **Do now** | | | | |
| 0 | Safety net: tests on `hiraman_test` only, rule unit tests, roadmap, architecture and QA docs, setup guide refresh | B10 | S | Done (593e0a3) |
| 1 | Quick fixes: ignore uploads in git, real file-type check and friendly 400, own-upload photo paths only, safe CSV export, health checks the DB, 404 for unknown routes, one "already booked" check, block duplicate requests, delete junk files | P1 (part), B5, B6, S3, B13, B12 (part), A2, B3, A8 | M | Done |
| 2 | Migrations and backups: plain-SQL migration runner, guard-rail constraints, backup and restore scripts | B7, B8 | M | Planned |
| 3 | Scheduled jobs: 7-day request expiry, 7-day ID photo deletion, unused upload cleanup, reminders | B2, B11, P1 | M | Planned |
| 4 | UI quick fixes: onboarding on small and sideways phones, confirm steps, feedback after every action, demo login in debug only, portal dialog focus and English status labels | D2, D3, D4, D13, D11 | S–M | Planned |
| **Do next** | | | | |
| 5 | Daily check-in, fair lateness, request timeline | B1, D5 | L | Planned |
| 6 | Dispute outcomes with ledger rows | B4 | M | Planned |
| 7 | Phone numbers after approval and a request thread | D1 | L | Planned |
| 8 | Privacy notice, consent, delete account, My data | P2 | M | Planned |
| 9 | Change password, staff-assisted reset, real logout, per-user rate limits, stronger defaults | S2, S4, S5 | M | Planned |
| 10 | Rules from the server, puroks from the DB, booked days greyed out, Edit item, change dates while pending, small data rules | A1, A5, D7, D8, B15 | M | Planned |
| 11 | Notifications in the user's language | D6 | M | Planned |
| 12 | Request log, trimmed errors, lint back on, ESLint/Prettier, CI | A9, P3, A10, A11 | M | Planned |
| 13 | UI Phase 2: component library, gallery, `DESIGN_SYSTEM.md` | A4, D12 | M | Planned |
| 14 | UI Phase 3: screens in 4 sub-batches, accessibility | D9, D12 | L | Planned |
| 15 | Containers: Dockerfile, compose, dev overlay, `CONTAINERS.md` | C | M | Planned |
| **Do later** | Paging (B9), fewer queries (A6), constants (A7), service extraction (A3), OpenAPI (B12), time zones (B14), load and end-to-end tests, release key and backup setting (S1), one-page summary for the instructor | | | Later |
| **Skip** | Push notifications, hosting/HTTPS now, iOS build, ORM or framework switch, separate worker service, certificate pinning, root detection | | | Skipped |

## Batch log

### Batch 0: Safety net
- **Goal:** tests can never touch real data; rules have fast unit tests; docs baseline.
- **Files:** `server/test/helpers/env.js`, `server/test/helpers/db.js`, `server/test/rules.test.js` (new), `server/test/loop.test.js`, `server/package.json`, `database/create-test-db.sql` (new), `docs/*`.
- **Proof:** 41/41 tests twice in a row; demo database identical before and after.
- **Undo:** `git revert 593e0a3`. The `hiraman_test` database can stay or be dropped.

### Batch 1: Quick fixes
- **Goal:** close the small, clear gaps found in the review without changing how anyone uses the app.
- **Files:** `.gitignore`, `server/src/uploads.js` (new), `server/src/app.js`, `errors.js`, `services.js`, `routes/auth.js`, `items.js`, `requests.js`, `community.js`, `admin.js`, `app/lib/core/strings_fil.dart`, tests `uploads.test.js`, `booking.test.js`, `api-basics.test.js` (new), `loop.test.js`.
- **Proof:** 18 new tests written first; 17 failed before the fixes. After: 61/61 pass.
- **Behavior changes users can notice:** uploads that are not real JPG, PNG or WEBP files get a clear message; asking twice for the same item and dates is refused; `/api/health` answers 503 when the database is down.
- **Undo:** `git revert` the batch commit. No database changes.
