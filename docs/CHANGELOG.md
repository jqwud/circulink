# Changelog

Newest first. Each entry is one batch from `docs/IMPROVEMENT_ROADMAP.md`, or one earlier commit.

## Batch 27: Quick replies instead of free chat (2026-10-23)

First batch of Hiraman 2.0 (design spec in Claude Docs, "Hiraman 2.0 Design Spec", section 6).

- **Residents message each other only with quick replies:** 35 pre-written phrases in English and Filipino, offered by the request's situation (before borrowing, before pickup, during the loan, return, problem, thanks) and by side (borrower or owner). A phrase can carry one picked value: a date, a date and time, a pickup point, a condition or a number. Nothing is typed, and each person reads the message in their own language. Replies such as "Yes, see you then" appear as buttons under a question.
- **Limits:** at most 10 quick replies per person per request per day, and the same phrase at most once every 10 minutes.
- **Staff keep free text.** Messages residents typed before this change stay readable (marked as old) and are deleted a year after the loan ends (new daily job).
- **"My situation is not listed"** opens Report a concern: a topic (unsafe, item problem, money asked, harassment, something else), an optional note, and Call 911 / Call the hall buttons. Only staff read it. Safety and harassment concerns are urgent: a red alert on the dashboard and first in Reports. A second harassment concern about the same person within 30 days pauses that person's messages until staff tap **Allow messages** (audited). At most 3 reports per person per day.
- **Kind words:** listings, Wanted posts, rating comments and concern notes refuse unkind English and Filipino words, also disguised ("g a g o", "sh1t"). Admins add local words on the Rules page; refusals are counted on the dashboard.
- **Privacy notice** updated (quick replies, concerns, old text deleted after a year), so residents agree once more.
- Migration 012 (backup taken first). Tests: 22 new server tests (`quick-replies.test.js`), message tests rewritten for phrases, an app end-to-end step that sends a quick reply, and a portal journey for an urgent concern.

## Batch 26: Release-ready app (2026-10-23)

- **Release key, kept by the team:** release builds are signed with the key named in `app/android/key.properties` (git-ignored, like `*.jks`). Nothing secret is in the repository; the team makes the key once (`docs/RELEASE.md`, step 2). Without it, builds still work, signed with the debug key, for testing only.
- **`node tools/build-release.mjs --server https://...`** builds the app residents install, and refuses when the server address is missing or malformed, the release key is not set up, or the shown version does not match `pubspec.yaml`. It warns about plain HTTP.
- **No backup of app data** to the cloud or to a new phone (`allowBackup="false"`, plus data extraction rules for Android 12 and newer). The login session and personal details stay on the phone; after a phone change, residents log in again.
- **Versions you can see:** the Me tab shows "Hiraman Version 1.0.0 (1)", and `/api/health` reports the server's version. Tests keep the app's shown version equal to `pubspec.yaml` and the server's equal to `package.json`.
- **`docs/RELEASE.md`:** the release checklist: decisions to make once (app ID, key keeper, server address, HTTPS), the key, versions, checks, building and trying on a real phone, updating the server safely, and how to roll back.
- **Proof:** a release build was made and signed with a throwaway key through `key.properties` (confirmed with `apksigner`), then key and build were deleted. The final manifest has backups off and version 1.0.0 (1).

## Batch 25: Bigger tests (2026-10-23)

- **Portal in a real browser** (`portal/e2e/`, Playwright): staff verify a new resident (who then has 3 credits), settle a damaged return as an accident (the owner gets a credit back), and clear a flagged listing from the red dashboard alert. `npm run test:e2e`.
- **App end to end** (`app/test/e2e/`): the app's real screens over real HTTP: log in, accept the privacy notice, search, borrow with typed dates, cancel and get the credit back; and a newcomer signs up and is asked to verify. `node tools/e2e.mjs`. A plain `flutter test` skips these.
- **Accessibility scan** (axe, WCAG 2.2 A and AA plus best practice) of the login page and all 11 portal pages; any finding fails. Fixed what it found: the dashboard's flag alert is now a real link inside an alert (screen readers said "alert", not "link"), the login page has a main landmark, and button columns have a hidden "Actions" header (the loan history column is now "With").
- **Load test** (`npm run test:load`, plain Node): 50 people p95 32 ms, 200 people p95 224 ms, no failures. The database pool size can be set with `DB_POOL_SIZE` (default unchanged).
- **App bugs found by the end-to-end tests and fixed:** on the Me tab the badge loading placeholder could not lay out (a grey box on a phone while badges loaded), and the floating buttons of Browse, Wanted and My items shared one animation tag (an error when opening a page from the home screen). A widget test now covers the placeholder.
- CI has a new job that runs both end-to-end suites on MySQL 8.

## Batch 24: API description (2026-10-23)

- `docs/openapi.json` (OpenAPI 3.1) describes all 88 operations: who may call each one, its inputs, its success code and its error codes. Open it in any OpenAPI viewer (for example editor.swagger.io).
- It is generated from `server/scripts/api-catalog.js` with `npm run docs:api`. A test fails if a route exists that is not described, if a description has no route, or if the file is out of date. Checked as valid with Redocly.
- A wrong password now answers 401 (`bad_login`) instead of 400. The app and the portal show the same message as before.

## Batch 23: Philippine time everywhere (2026-10-23)

- The app works out "today" in Philippine time (`phToday()` in `core/format.dart`) for the date pickers, the wanted-post date and "you checked in today", whatever time zone the phone is set to, so it always agrees with the server near midnight.
- The portal reads the server's times as Philippine time and shows dates in Manila time, so a computer set to another zone never shows the wrong day.
- Tests: server dates around Manila midnight, also with the computer set to UTC, Los Angeles and Kiritimati; app dates around midnight and on a phone set to Los Angeles.

## Batch 22: Code tidy-up, no behavior change (2026-10-23)

- **Fewer queries:** My items, the kit list and the portal's reports no longer query the database once per row; each uses one or two combined queries.
- **Named limits:** upload size, login tries, and page sizes live in `server/src/config.js`; the app's request timeout, server probe time, splash time and Browse page size in `app/lib/core/constants.dart`.
- **Smaller route files:** resident verification (approve, reject) and kit booking moved into `services.js` next to the request life cycle.
- **Proof of no change:** all 209 tests pass unchanged, and the output of the changed endpoints was recorded before and after on the same test data and is identical.

## Batch 21: Long lists in pages (2026-10-23)

- Lists take `?limit=` and `?offset=` and stay plain arrays (a page shorter than the limit is the last). Every paged list also sorts by id, so pages never overlap or skip (`pageOf` in `server/src/db.js`).
- Browse items, wanted posts and notifications: 50 by default, at most 100. Portal residents, listings, transactions, reports and the audit log: 100 by default, at most 200.
- The app's Browse loads 30 items at a time with "Load more"; the portal's long tables have "Load more" (`usePaged`, `LoadMore`).

## Batch 20: Rule numbers from the portal (2026-10-23)

- Admins change ten rule numbers on the Rules page (starter credits, costs, lender reward, late penalty, monthly cap, maximum loan days, expiry days, missed check-ins before an alert), each within safe limits, after a confirm step that lists every change. Staff see them read-only.
- Changes apply at once everywhere (booking, returns, jobs, the app's texts through `/meta`), survive restarts, and are written to the audit log (`rule_changed`). An admin can go back to the default.
- Fixed in code on purpose: how long ID photos and phone numbers are kept (they are in the privacy notice) and the dispute outcomes (agreed decision).
- `server/src/settings.js`; `GET`/`PUT /api/admin/settings`; migration 011 adds `rule_settings`.

## Batch 19: Automatic flags (2026-10-23)

- New and edited listings are checked automatically. A listing is **held back (hidden from neighbors) until staff check it** when it has a banned word written in disguise ("g u n", "g@mot", "p1stol"), a valuable or hazardous thing listed below the high tier (laptop, generator, projector, chainsaw...), it is the third item from an account less than a day old, or two different neighbors reported it. Plainly banned words are still refused outright.
- The owner is told kindly that the barangay is checking it (not which check). Waiting requests on it are refunded.
- Staff get a red alert at the top of the dashboard, a red count beside Listings, and the reasons on each flagged listing, with "Looks fine, show it", Edit and Remove. Every flag is in the audit log.
- An edit is checked for what it changes, so a listing staff already cleared is not flagged again by an unrelated edit.
- The demo data now looks like an established community (accounts three months old, items weeks old).
- The check numbers live in `SCREENING` in `server/src/rules.js`.

## Batch 18: Staff can step in (2026-10-23)

- **Requests:** on Transactions, staff can approve, reject, hand over or confirm the return of any request (owners still do it for their own), and cancel any waiting or booked request with a reason both neighbors see; held credits are refunded (`POST /admin/requests/:id/cancel`).
- **Listings:** staff can edit any listing, hide it from neighbors with a reason the owner sees (its waiting and booked requests are refunded), show it again, or remove it (`POST /admin/items/:id/hide`, `/show`). A hidden listing disappears from browse, kits and booking; the owner sees "Hidden by the barangay" and the reason in My items.
- Staff edits follow the owners' rule: no tier change while a request is active.
- Migration 010 adds a review state to listings (`ok`, `hidden`, and `flagged` for batch 19).

## Batch 17: What residents see (2026-10-23)

- Badges sit in an even grid: three equal tiles per row, earned ones bright, the rest muted with a lock and "Locked"; rows grow with large text (`BadgeGrid`, also in the gallery and its test).
- The component gallery is no longer reachable from the app; developers open it with `flutter run -t lib/main_gallery.dart`.
- Real (release) builds hide the server address (Profile and the login plug button) and the technical connection card; residents see only "No connection. Check your internet and try again." when it is down. Test builds keep the tools (`kShowServerTools`; `--dart-define=HIRAMAN_SERVER_TOOLS=true` turns them on in a release build).

## Batch 15: Containers (2026-10-23)

- `Dockerfile`: one image with the API and the built portal. `docker-compose.yml`: MySQL 8 and the API, with the database, photos and backups in volumes, health checks, Philippine time. `docker-compose.dev.yml`: the API restarts on save and MySQL is open on port 3307.
- On every start the container brings the database up to date, backing it up first (a brand-new database with no accounts is not backed up: there is nothing in it yet).
- `npm run create-admin -- "Full Name" email` creates the first admin of a real install with a one-time password.
- `docs/CONTAINERS.md`: first start, demo data, everyday commands, backups, the phone app, development, troubleshooting.
- CI builds the image, starts both containers and checks the health and the portal page on every push.

## Batch 14: Screens and accessibility (2026-10-23)

- Lists load with grey placeholder cards instead of a spinner.
- Screen readers: Pawsa pictures are skipped as decoration, list thumbnails are not read twice, the item photo says what it shows, badges say whether they are earned, and the shelf cards, badges and photo tile are real buttons. The password eye and the rating stars have names.
- Large text: Home shelf cards grow instead of cutting names off; detail rows stack.
- Forms: rejecting, reporting a problem, rating, editing your profile and posting a wanted item now open as bottom sheets; every text field has the same look.
- Requests and Wanted share one heading style.
- The request timeline shows older loans correctly.

## Batch 13: Component library, gallery, design system (2026-10-23)

- The app's shared widgets moved from one 600-line file into `app/lib/widgets/ui/`, one component per file, with the code unchanged; `widgets/common.dart` exports them all, so no screen changed.
- New components for the screens to adopt: `HiTextField` (one field style), `showHiSheet` (short forms as bottom sheets), `HiTabs` (pill tabs with counts), `InfoBanner` (tinted notes with icons), `SkeletonList` (loading without a spinner), `HiListTile` and `KeyValueRow` (stack on narrow screens and large text).
- Component gallery: every token and component on one screen (Profile in debug builds, or `flutter run -t lib/main_gallery.dart`), tested at 320 px, 400 px and 200% text.
- `docs/DESIGN_SYSTEM.md`: principles, tokens, components, patterns, accessibility rules and how to add something new.

## Batch 12: Logs, lint and automatic checks (2026-10-23)

- **Request log:** one line per API request (time, request id, method, path without the query string, status, duration, user id). Every answer carries `X-Request-Id`; a server error also returns `request_id` so a resident can quote it. `LOG_REQUESTS=0` turns the log off.
- **Errors without personal data:** unexpected errors are logged as one short line; quoted values, emails and long numbers are hidden. Failed jobs store the cleaned message.
- **App lint:** `use_build_context_synchronously` is back on and `flutter_lints` is at 6; 17 places that used a screen after waiting now keep the app state first.
- **JavaScript lint:** ESLint for the API and the portal (`npm run lint`); it found and we fixed an error rethrown without its cause, a duplicate translation key and a ref read in a cleanup. Prettier is available on demand (`npm run format -- <file>`).
- **CI:** `.github/workflows/ci.yml` runs the API lint and tests on MySQL 8, the app's analysis and tests, and the portal's lint and build on every push and pull request.
- `.editorconfig` for consistent indentation.

## Batch 11: Notifications in the reader's language (2026-10-22)

- Every notice now stores its values (`notifications.params`: item, dates, names, numbers). The app writes the sentence in Filipino or English with friendly dates (`app/lib/core/notification_text.dart`); 62 notice sentences have Filipino text.
- The English `title` and `body` are still stored, for older app versions and older rows. Staff announcements are shown exactly as written.
- The reminder job and the "new ID to review" notice now go through the same `notify` helper.
- Migration 009 adds `notifications.params`.

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
