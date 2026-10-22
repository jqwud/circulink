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
| 2 | Migrations and backups: plain-SQL migration runner, guard-rail constraints, backup and restore scripts | B7, B8 | M | Done |
| 3 | Scheduled jobs: 7-day request expiry, 7-day ID photo deletion, unused upload cleanup, reminders | B2, B11, P1 | M | Done |
| 4 | UI quick fixes: onboarding on small and sideways phones, confirm steps, feedback after every action, demo login in debug only, portal dialog focus and English status labels | D2, D3, D4, D13, D11 | S–M | Done |
| **Do next** | | | | |
| 5 | Daily check-in, fair lateness, request timeline | B1, D5 | L | Done |
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

### Batch 5: Daily check-in, fair lateness, request timeline
- **Goal:** a borrower is never charged for a slow confirmation, owners know their item is safe, and everyone can see where a request stands.
- **Files:** `database/migrations/003_checkins_and_timeline.sql` (new), `server/src/services.js` (check-in, approval time, lateness from "I returned it"), `jobs.js` (`runCheckins`), `rules.js`, `routes/requests.js` (`POST /requests/:id/checkin`, timeline fields), `routes/admin.js` (dashboard count, "Missed check-ins" filter); app `request_detail.dart` (check-in card, timeline), `home_tab.dart` (check-in cards), `widgets/common.dart`, `notifications_screen.dart`, `strings_fil.dart`; portal `Dashboard.jsx`, `Transactions.jsx`, `Reports.jsx`, `components.jsx`, `i18n.jsx`; tests `checkins.test.js` (new, 16), `jobs.test.js`, `rules.test.js`.
- **Proof:** server 101/101; `flutter analyze` clean, `flutter test` 5/5; portal builds; every new app and portal string has Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-161451-before-migrate`); row counts unchanged; the 2 loans already out start their check-in count on the migration day.
- **Behavior changes users can notice:** borrowers see a daily check-in card (Still with me / I returned it / There's a problem) on the request and on Home; lateness is judged by the day the borrower tapped "I returned it"; a missed day sends a reminder, two missed days alert the owner and show on the portal dashboard; owners see the last check-in; every request shows a progress timeline, held credits and its expiry date; overdue reminders stop once the borrower says the item is back.
- **Undo:** `npm run migrate:down` (drops the check-ins and the new columns, backs up first), then `git revert` the batch commit.

### Batch 2: Migrations and backups
- **Goal:** change the database safely from now on, and be able to undo and restore.
- **Files:** `database/migrations/001_guard_rails.sql` (new), `database/schema.sql` (header), `server/src/migrations.js`, `server/src/backup.js`, `server/scripts/migrate.js`, `backup.js`, `restore.js` (new), `server/src/index.js`, `server/package.json`, `.gitignore`, `server/test/helpers/*`, `server/test/migrations.test.js` (new), docs.
- **Proof:** 69/69 tests (8 new). Pre-checks on the demo database all 0; migration applied with an automatic backup; demo data identical before and after; a negative balance is now refused by the database.
- **Undo:** `npm run migrate:down` (removes the guard rails, backs up first), then `git revert` the batch commit. Or restore the backup taken before the migration: `npm run restore -- hiraman-<time>-before-migrate --yes`.

### Batch 3: Scheduled jobs
- **Goal:** nothing stays stuck or kept longer than needed: unanswered and uncollected requests expire, ID photos are deleted after 7 days, unused uploads are cleaned, owners hear about overdue items.
- **Files:** `database/migrations/002_jobs_and_expiry.sql` (new), `server/src/jobs.js` (new; reminders moved here from `services.js`), `server/src/db.js`, `rules.js`, `services.js`, `index.js`, `routes/admin.js`, `routes/requests.js`, app status and wallet labels, portal status label, tests `jobs.test.js` (new), `migrations.test.js`, `rules.test.js`.
- **Proof:** 84/84 tests (15 new, using a clock moved 6 and 8 days ahead). Migration applied to the demo database with a backup first; data unchanged.
- **Undo:** `npm run migrate:down` (expired requests become cancelled; the decision dates and job history are dropped), then `git revert` the batch commit.

### Batch 4: UI quick fixes
- **Goal:** screens fit every phone, risky taps ask first, every action says what happened, and the portal works by keyboard and speaks plain English.
- **Files:** app `screens/onboarding_screen.dart`, `wanted_screen.dart`, `my_items_screen.dart`, `auth_screens.dart`, `core/strings_fil.dart`, `test/onboarding_layout_test.dart` (new); portal `src/components.jsx`, `src/i18n.jsx`, `src/pages/Residents.jsx`, `src/pages/StaffAudit.jsx`; server `routes/admin.js` (audit wording), `test/api-basics.test.js`.
- **Proof:** onboarding widget test at 320×568, 800×380 and 400×860 failed before (overflow of 227 and 251 px) and passes after; `flutter analyze` clean, `flutter test` 5/5. Server 85/85 (1 new test, failed first on "user_reinstateed"). A browser script against `hiraman_test` passed 22/22 portal checks: focus moves into dialogs, Tab and Shift+Tab stay inside, Escape closes only the top dialog and focus returns, Suspend and Disable ask first, Cancel changes nothing, every action shows a message, no raw "handed_over" style words in English. Demo database identical before and after.
- **Behavior changes users can notice:** removing a wanted post, suspending a resident and disabling a staff account now ask "Are you sure?" first (reinstate and enable still happen at once); a short message confirms posting, pausing, resuming and removing; the demo login hint no longer appears in release builds; the portal shows "Borrowed", "Returned", "reward for lending" and so on instead of raw words; the audit log says "user reinstated" instead of "user reinstateed" (older rows keep the old word).
- **Undo:** `git revert` the batch commit. No database changes.
