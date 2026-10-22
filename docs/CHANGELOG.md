# Changelog

Newest first. Each entry is one batch from `docs/IMPROVEMENT_ROADMAP.md`, or one earlier commit.

## Batch 10: One source of truth, better forms, small data rules (2026-10-22)

- **Rules from the server:** `/meta` now carries the rule numbers and the puroks; help, wallet, verification and date texts are built from them (`context.tv` fills `{n}` in a translated sentence). The condition-photo rule is decided once on the server (`photo_required`).
- **Puroks:** a `puroks` table managed by staff on the Rules page; the app's sign-up and profile read it (`GET /api/puroks` works before login). Removing a purok keeps it for people who already chose it.
- **Date picker:** booked days are greyed out, an overdue loan blocks days up to today, and a range cannot pass 14 days or a booked day. The same picker is used for items, kits and changing dates.
- **Edit item:** owners edit a listing with the share form. The tier cannot change while a request is active (`item_busy`).
- **Change dates:** a borrower can move a waiting request (`PATCH /requests/:id/dates`), with the same checks as a new request; the owner is told.
- **Small data rules:** staff cannot approve a resident without an ID photo (`no_id_photo`); staff can restore only what staff removed (`owner_removed`); a phone number can be cleared and must look like one (`bad_phone`); a purok must be on the list (`bad_purok`); `%` and `_` in searches are matched literally.
- Migration 008 adds `puroks` and `items.removed_by`.

## Batch 9: Account safety (2026-10-22)

- **Passwords:** new passwords need at least 8 characters. Residents and staff can change their password (the current one is needed); other sessions end and this device stays logged in.
- **Staff-assisted reset:** staff give a resident a temporary password at the hall (admins can do it for staff); it is shown once, every session of that account ends, and the person must choose a new password at the next login. Written to the audit log.
- **Real logout:** logging out ends the session on the server (every device of that account), not just on the phone.
- **Sessions:** staff 12 hours, residents 14 days, renewed once a day while the app is used. The app keeps the login in encrypted storage (`flutter_secure_storage`) and moves an older saved login there once.
- **Limits:** 5 wrong passwords for one email lock it for 15 minutes; each logged-in person may make up to 300 changes per 15 minutes (`WRITE_LIMIT`); reading is never limited.
- **Safer defaults:** the server refuses to start with `NODE_ENV=production` and no real `JWT_SECRET`; `CORS_ORIGIN` lists the web addresses allowed to call the API (empty = this server and localhost); a taken email at sign-up gets a neutral message (`signup_failed`).
- Migration 007 adds `users.token_version` and `users.must_change_password`.

## Batch 8: Privacy (2026-10-22)

- **Privacy notice** (RA 10173) in Filipino and English: what is collected, why, who sees it, how long it is kept, your rights, and the barangay's Data Protection Officer (`DPO_NAME`, `DPO_EMAIL`, `DPO_PHONE` in `.env`). Served at `GET /api/privacy` and shown in the app.
- **Consent:** signing up needs the notice to be accepted (`privacy_required`); sending an ID photo needs a separate consent (`id_consent_required`). People who joined before see the notice once and agree. Changing `PRIVACY_VERSION` asks everyone again.
- **My data:** residents can see and copy everything Hiraman holds about them (`GET /api/me/data`).
- **Delete my account:** residents ask from Profile and can take it back; staff see requests on the dashboard and in Residents; an admin deletes the account, which is refused while a loan is active. The name, contact details, ID photo, messages, notes, wanted posts and notifications are removed; waiting requests are cancelled and refunded; listings are removed; anonymous loan and credit records stay.
- Migration 006 adds `privacy_version`, `privacy_accepted_at`, `id_consent_at`, `deletion_requested_at` and `deleted_at` to `users`.

## Batch 7: Phone numbers and a request thread (2026-10-22)

- **Phone numbers after approval:** the borrower and the owner see each other's first name and phone number, with Call and Text buttons, from approval until 7 days after the loan closes. Waiting, rejected, cancelled and expired requests show none. Items the barangay handles show the Barangay Hall, its hours and `HALL_PHONE` (new, optional, in `.env`).
- **Message thread:** every request has a short text thread for the borrower, the owner and barangay staff (up to 500 characters a message). It is open while the request waits and until 7 days after it closes, then stays readable. A new message notifies the others once until they open the thread.
- Staff read and write threads from the portal's Transactions page.
- The approval notice now says to open the request to call or message the owner.
- Migration 005 adds `request_messages`. The app now uses `url_launcher`.

## Batch 6: Dispute outcomes (2026-10-22)

- **Staff choose how a dispute ends:** fine after all (the normal return rules), an accident (owner +1), damaged by the borrower (owner +1, borrower −2) or lost (owner +2, borrower −2, item removed). Nobody goes below 0. The numbers live in `DISPUTE_OUTCOMES` in `rules.js`.
- Resolving a report about a disputed loan now requires an outcome (`settle_required`); the loan is closed and settled in the same step, and a second resolve never pays twice.
- A lost item is removed and its other waiting or booked requests are rejected with their credits refunded.
- Both neighbors are notified, the request shows "Settled: ...", and the wallet names the settlement rows.
- "Credits on hold" is shown only while a request is pending, approved or out.
- Migration 004 adds `requests.dispute_outcome` and `requests.settled_at`.

## Batch 5: Daily check-in, fair lateness, request timeline (2026-10-22)

- **Daily check-in:** while a borrower has an item they answer once a day: Still with me, I returned it, or There's a problem. The app shows a check-in card on the request and on Home. The handover day itself needs no check-in.
- **Fair lateness:** "I returned it" saves the moment, and on-time is judged by that day. An owner who confirms late no longer costs the borrower a credit.
- **Missed check-ins:** one missed day sends the borrower a reminder (at most one a day); two missed days in a row alert the owner once and appear on the portal dashboard and in a new "Missed check-ins" tab. No credit penalty. A check-in starts the count again.
- **There's a problem:** tells the owner and opens a report for barangay staff.
- **Timeline:** every request shows Requested, Approved, Borrowed, Borrower says returned and Return confirmed with dates, the credits on hold, and the day an unanswered or uncollected request expires.
- **Reminders:** due and overdue reminders stop once the borrower says the item is back; such a loan is no longer shown as overdue.
- Migration 003 adds `request_checkins` and the columns `approved_at`, `borrower_returned_at`, `checkin_since`, `checkin_reminded_on`, `checkin_alerted_on` to `requests`. Loans already out start their check-ins on the day the migration runs.
- Portal: report reasons and check-in states shown as words.

## Batch 4: UI quick fixes (2026-10-22)

- **Onboarding fits every phone:** on a small phone Pawsa shrinks; on a phone held sideways he sits beside the words; with very large text the slide scrolls instead of cutting off. A widget test checks three screen sizes.
- **Ask first:** removing a wanted post (app), suspending a resident and disabling a staff account (portal) now show a confirm step. In the portal, Cancel has the focus so a stray Enter never confirms.
- **Say what happened:** short messages after posting a wanted item, marking it found, removing it, and pausing, resuming or removing a listing (app); after suspending, reinstating, disabling and enabling (portal).
- **Demo login hint** on the app's login screen shows in debug builds only.
- **Portal keyboard use:** dialogs move focus inside when they open, keep Tab inside, close with Escape (only the top one when two are open) and give focus back to the button that opened them.
- **Portal English labels:** statuses, tiers, return conditions and credit history reasons show as words ("Borrowed", "Returned", "reward for lending") in English mode; credit history reasons are also translated to Filipino.
- **Audit log wording:** reinstating a resident is now logged as `user_reinstated` (was `user_reinstateed`).

## Batch 3: Scheduled jobs (2026-10-22)

- **Request expiry:** a pending request nobody answers expires 7 days after it was made (or once its end date passes); an approved request that is never picked up expires once its end date passes. The borrower's held credit is refunded (`refund_expired`) and both people are notified. New request status "Expired" in the app and portal.
- **ID photos:** deleted 7 days after staff approve or reject them, and the deletion is written to the audit log. Accounts approved or rejected before this change start their 7 days now.
- **Unused uploads:** photos that were never attached to anything are deleted after a day.
- **Reminders:** the owner is now told once when their item becomes overdue (before: only the borrower heard).
- **Job runner:** every job runs on its own interval, checked every 10 minutes. Each run is recorded in a new `job_runs` table and shown to staff at `/api/admin/jobs`; one failing job does not stop the others.
- Migration 002 adds the "expired" status, `users.verification_decided_at` and `job_runs`. The app's credit history now names "request expired" and "item removed" refunds.

## Batch 2: Migrations and backups (2026-10-22)

- **Migrations:** numbered SQL files in `database/migrations`, each with an undo part, applied by `npm run migrate` and recorded in a `schema_migrations` table. Running it again does nothing. It takes a backup first. `npm run migrate:status` and `npm run migrate:down` show and undo.
- **Migration 001 (guard rails):** the database itself now refuses negative credit balances, requests that end before they start, ratings outside 1-5 stars, and rows pointing at missing kits, requests, users or staff. Two indexes speed up the unread count and the "is this item taken" check. Applied to the demo database; no data changed.
- **Backups:** `npm run backup` saves the database and the uploaded photos to `server/backups/` (ignored by git, because it holds personal data). `npm run restore -- <folder> --yes` puts a backup back, after taking a safety backup of the current state.
- The server warns at start-up when the database is missing a migration.
- Tests build the test database from `schema.sql` plus every migration, and keep their backups in a temporary folder.

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
