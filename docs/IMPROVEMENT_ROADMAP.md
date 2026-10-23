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
| Loan control (2026-10-23) | Owners keep approving, handing over and confirming returns for their low and medium items; staff can step in on any request from the portal (approve, cancel, close, fix). |
| Server setup (2026-10-23) | Real (release) builds show residents no server address or technical status; the address is built in. Test builds keep the tools for USB and hotspot testing. |
| Rule numbers (2026-10-23) | Admins edit them on the portal's Rules page within safe limits; every change is in the audit log; the app reads them from the server. |
| Flagged listings (2026-10-23) | A flagged listing stays hidden from neighbors until staff check it (for everyone's safety); staff get a high-priority alert. |
| Admin tools (2026-10-23) | Staff can edit or hide any listing, cancel or close any request (with correct refunds), and review listings the system flags automatically as unusual or possibly harmful. Not now: manual credit adjustment, pausing app features. |
| Resident view (2026-10-23) | Residents see only what they need. The component gallery leaves the app (developers open `lib/main_gallery.dart`); badges become an even grid. |

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
| 6 | Dispute outcomes with ledger rows | B4 | M | Done |
| 7 | Phone numbers after approval and a request thread | D1 | L | Done |
| 8 | Privacy notice, consent, delete account, My data | P2 | M | Done |
| 9 | Change password, staff-assisted reset, real logout, per-user rate limits, stronger defaults | S2, S4, S5 | M | Done |
| 10 | Rules from the server, puroks from the DB, booked days greyed out, Edit item, change dates while pending, small data rules | A1, A5, D7, D8, B15 | M | Done |
| 11 | Notifications in the user's language | D6 | M | Done |
| 12 | Request log, trimmed errors, lint back on, ESLint/Prettier, CI | A9, P3, A10, A11 | M | Done |
| 13 | UI Phase 2: component library, gallery, `DESIGN_SYSTEM.md` | A4, D12 | M | Done |
| 14 | UI Phase 3: screens in 4 sub-batches, accessibility | D9, D12 | L | Done |
| 15 | Containers: Dockerfile, compose, dev overlay, `CONTAINERS.md` | C | M | Done |
| **Next (agreed 2026-10-23)** | | | | |
| 16 | Phone test of batches 5 to 15, and anything it turns up | | S | Partly done (CI green; phone test by the user went well) |
| 17 | Resident view: even badge grid, gallery out of the app, no server tools or technical status in release builds | Resident view | S | Done |
| 18 | Staff control of requests and listings: approve, cancel or close any request with correct refunds; edit or hide any listing | Admin tools | M | Done |
| 19 | Automatic flags: unusual or possibly harmful listings go to a staff review queue | Admin tools | M | Done |
| 20 | Rule numbers editable by admins in the portal, within limits, audited | Rule numbers | M | Done |
| 21 | Long lists in pages | B9 | M | Planned |
| 22 | Code tidy-up without behavior change | A6, A7, A3 | M | Planned |
| 23 | One rule for Philippine time everywhere | B14 | S–M | Planned |
| 24 | API description (OpenAPI) | B12 | M | Planned |
| 25 | End-to-end, accessibility and load tests | QA | L | Planned |
| 26 | Release-ready app: signing key (kept by the team), no cloud backup of app data, versions, checklist | S1 | S | Planned |
| **Do later** | Paging (B9), fewer queries (A6), constants (A7), service extraction (A3), OpenAPI (B12), time zones (B14), load and end-to-end tests, release key and backup setting (S1) | | | Later |
| Summary | One-page summary for the instructor (`docs/INSTRUCTOR_SUMMARY.md`) | | S | Done |
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

### Batch 13: Component library, gallery, design system
- **Goal:** one place for every UI piece, so screens stop growing their own variants (the "unequal proportions" feeling).
- **Files:** `app/lib/widgets/ui/` (new: 16 files; `common.dart` split one component per file, code unchanged, plus new `HiTextField`, `showHiSheet`, `HiTabs`, `InfoBanner`, `SkeletonList`, `HiListTile`, `KeyValueRow`), `widgets/common.dart` (now exports the kit, so no screen import changed), `screens/dev/gallery_screen.dart` and `lib/main_gallery.dart` (new), `profile_screen.dart` (gallery link in debug builds only), `app/test/gallery_test.dart` (new, 4), `docs/DESIGN_SYSTEM.md` (new).
- **Proof:** `flutter analyze` clean; Flutter 13/13 (the gallery lays out without errors at 320 px, 400 px and 400 px with 200% text; tabs announce which one is selected); screenshots of the gallery at 400 px checked by eye.
- **Behavior changes users can notice:** none. Screens adopt the new pieces in Batch 14.
- **Undo:** `git revert` the batch commit.

### Batch 14: Screens and accessibility (four commits: 14a to 14d)
- **Goal:** the screens use the kit, so they look like one product, and people using screen readers, keyboards or large text can use the app.
- **14a (`4ae3179`):** loading placeholders instead of a spinner; Pawsa treated as decoration; list thumbnails not read twice and the item photo labeled; Home shelf cards, Profile badges and the photo tile are real buttons; shelf cards grow with large text; tooltips on the remaining icon buttons.
- **14b (`6efc4ce`):** five form pop-ups became bottom sheets that own their fields (reject, report a problem, rate, edit profile, post a wanted item); new `askText` and `ScreenHeader`; hand-drawn field borders removed so the theme applies; `KeyValueRow`, `InfoBanner` and `HiListTile` in use.
- **14c (`4c17618`):** font weights on the type scale (no visual change).
- **14d:** the request timeline marks a step done once the request has passed it, also for requests saved before their times were recorded (found in the screenshot check: older loans showed "Approved" as unfinished).
- **Proof:** `flutter analyze` clean; Flutter 15/15 (new: sheets, gallery at 200% text). Screenshot check of the real web build against a test server, signed in as a borrower: Home with the check-in card, the loan with contact, timeline and check-in (English and Filipino), Requests, Wanted with its new sheet, Profile with the new rows.
- **Not done:** a screen-reader walk-through on a real phone (TalkBack), and a full 200% text pass on every screen (only the gallery and onboarding are tested at large sizes).
- **Undo:** `git revert` the four commits, newest first.

### Batch 15: Containers
- **Goal:** the server side runs the same way on any computer with Docker, with nothing else to install.
- **Files:** `Dockerfile` (portal built into the API image), `docker-compose.yml` (MySQL 8 and the API, data in volumes, health checks), `docker-compose.dev.yml` (watch mode, MySQL on 3307), `docker/entrypoint.sh` (migrate, then start), `docker.env.example`, `.dockerignore`, `.gitattributes`, `.gitignore`, `docs/CONTAINERS.md` (new); `server/src/migrations.js` (`isFreshInstall`: no backup needed on a brand-new database), `scripts/migrate.js`, `src/config.js` (also reads `MYSQL_PASSWORD`), `scripts/create-admin.js` (new: the first admin of a real install), `package.json`; `.github/workflows/ci.yml` (new job: build, start, health check, portal page, migration status); `docs/SETUP.md`, `README.md`, `ARCHITECTURE.md`.
- **Proof:** server 170/170 (new: `isFreshInstall` is false for a used database; `create-admin` makes an admin who must change the password, and refuses a taken email); lint clean; the workflow and both compose files parse as valid YAML; the entrypoint has Linux line endings.
- **Not verified here:** Docker is not installed on this computer, so the image has not been built and the containers have not been started. The new CI job does exactly that on GitHub after the first push; watch its result.
- **Undo:** `git revert` the batch commit. No database changes.

### Batch 5: Daily check-in, fair lateness, request timeline
- **Goal:** a borrower is never charged for a slow confirmation, owners know their item is safe, and everyone can see where a request stands.
- **Files:** `database/migrations/003_checkins_and_timeline.sql` (new), `server/src/services.js` (check-in, approval time, lateness from "I returned it"), `jobs.js` (`runCheckins`), `rules.js`, `routes/requests.js` (`POST /requests/:id/checkin`, timeline fields), `routes/admin.js` (dashboard count, "Missed check-ins" filter); app `request_detail.dart` (check-in card, timeline), `home_tab.dart` (check-in cards), `widgets/common.dart`, `notifications_screen.dart`, `strings_fil.dart`; portal `Dashboard.jsx`, `Transactions.jsx`, `Reports.jsx`, `components.jsx`, `i18n.jsx`; tests `checkins.test.js` (new, 16), `jobs.test.js`, `rules.test.js`.
- **Proof:** server 101/101; `flutter analyze` clean, `flutter test` 5/5; portal builds; every new app and portal string has Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-161451-before-migrate`); row counts unchanged; the 2 loans already out start their check-in count on the migration day.
- **Behavior changes users can notice:** borrowers see a daily check-in card (Still with me / I returned it / There's a problem) on the request and on Home; lateness is judged by the day the borrower tapped "I returned it"; a missed day sends a reminder, two missed days alert the owner and show on the portal dashboard; owners see the last check-in; every request shows a progress timeline, held credits and its expiry date; overdue reminders stop once the borrower says the item is back.
- **Undo:** `npm run migrate:down` (drops the check-ins and the new columns, backs up first), then `git revert` the batch commit.

### Batch 6: Dispute outcomes
- **Goal:** every dispute ends with a clear, recorded result, and the credits follow the decision in the roadmap.
- **Files:** `database/migrations/004_dispute_outcomes.sql` (new), `server/src/rules.js` (`DISPUTE_OUTCOMES`), `services.js` (`settleDisputeTx`, shared `removeItemTx`, the normal return rules in one function), `routes/admin.js` (resolving a report on a disputed loan needs `settle`; `/admin/rules` lists the outcomes), `routes/requests.js`; app `request_detail.dart`, `wallet_screen.dart`, `notifications_screen.dart`, `strings_fil.dart`; portal `Reports.jsx`, `i18n.jsx`, `styles.css`; tests `disputes.test.js` (new, 10), `rules.test.js`, `loop.test.js`.
- **Proof:** server 112/112 (11 new; the loop test now settles its dispute instead of just closing it); `flutter analyze` clean, `flutter test` 5/5; portal builds; no missing Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-162223-before-migrate`); row counts unchanged (the demo has no disputes).
- **Behavior changes users can notice:** staff can no longer close a disputed loan without choosing an outcome (the old "Also mark the loan as closed" box is gone); the chosen outcome moves credits, removes a lost item and refunds its other bookings; both neighbors get a "Settled" notification; the request and the wallet show the outcome. "Credits on hold" now shows only while a request is active.
- **Undo:** `npm run migrate:down` (drops the outcome columns; ledger rows stay), then `git revert` the batch commit.

### Batch 7: Phone numbers and a request thread
- **Goal:** after approval the two neighbors can actually reach each other, so a loan no longer stalls at "message the owner".
- **Files:** `database/migrations/005_request_messages.sql` (new), `server/src/services.js` (`contactOpen`, `threadOpen`), `rules.js`, `config.js` (`HALL_PHONE`), `.env.example`, `routes/requests.js` (`contact` on a request, `GET/POST /requests/:id/messages`); app `messages_screen.dart` (new), `request_detail.dart` (contact card with Call and Text), `notifications_screen.dart`, `strings_fil.dart`, `pubspec.yaml` (`url_launcher`), `AndroidManifest.xml` (tel and sms intents); portal `Transactions.jsx` (Messages button and thread), `i18n.jsx`, `styles.css`; tests `contact.test.js` (new, 12), `rules.test.js`.
- **Proof:** server 124/124; `flutter analyze` clean, `flutter test` 5/5; portal builds; no missing Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-162851-before-migrate`); row counts unchanged.
- **Behavior changes users can notice:** from approval until 7 days after a loan closes, the borrower and the owner see each other's first name and phone number with Call and Text buttons; items the barangay handles show the hall (and `HALL_PHONE` if set). Every request has a message thread for the borrower, the owner and staff, open while it waits and until 7 days after it closes; a new message sends one notification until the thread is opened. Staff read and answer threads from Transactions.
- **New library:** `url_launcher` (approved in the decisions) for the Call and Text buttons.
- **Undo:** `npm run migrate:down` (drops the messages), then `git revert` the batch commit.

### Batch 8: Privacy
- **Goal:** people know what is collected and why before they give it, and can see and delete their data (RA 10173).
- **Files:** `database/migrations/006_privacy.sql` (new), `server/src/privacy.js` (new: the notice in Filipino and English, `PRIVACY_VERSION`), `auth.js` (`privacy_ok`, `id_consent`, `deletion_requested`), `routes/auth.js` (`GET /privacy`, consent at sign-up, `POST /me/privacy`, `POST /me/id-consent`, `GET /me/data`, `POST`/`DELETE /me/delete-request`), `services.js` (`deleteAccountTx`), `routes/admin.js` (deletion filter, dashboard count, `POST /admin/users/:id/delete`), `.env.example` (`DPO_*`); app `privacy_screens.dart` (new: notice, My data, delete request), `gate.dart`, `auth_screens.dart`, `verification_screen.dart`, `profile_screen.dart`, `state.dart`, `strings_fil.dart`; portal `Residents.jsx`, `Dashboard.jsx`, `i18n.jsx`; tests `privacy.test.js` (new, 9), and consent added where `jobs`, `loop` and `uploads` tests sign up or send an ID.
- **Proof:** server 133/133; `flutter analyze` clean, `flutter test` 5/5; portal builds; no missing Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-163745-before-migrate`); row counts unchanged.
- **Behavior changes users can notice:** sign-up needs a ticked "I have read the privacy notice" box; sending an ID needs a ticked consent box; residents who joined earlier see the notice once and tap "I agree" (or log out); Profile has Privacy notice, My data (copy everything) and Delete my account (a request the resident can take back); admins delete accounts from Residents (refused while a loan is active), which removes the name, contacts, ID photo, messages and notes but keeps the anonymous loan records.
- **For the barangay:** fill in `DPO_NAME`, `DPO_EMAIL` and `DPO_PHONE` in `server/.env`; until then the notice says to ask at the hall's help desk. Have the barangay's legal or DPO contact review the notice text in `server/src/privacy.js`.
- **Undo:** `npm run migrate:down` (drops the consent and deletion columns; deleted accounts stay anonymized), then `git revert` the batch commit.

### Batch 9: Account safety
- **Goal:** a lost phone or a forgotten password is no longer a month-long risk or a database job, and nobody can flood the system.
- **Files:** `database/migrations/007_account_safety.sql` (new), `server/src/auth.js` (token version, 12-hour staff and 14-day resident sessions), `config.js` (secret required in production, origin list, write limit), `app.js` (`corsAllowed`, per-person write limit), `routes/auth.js` (8-character passwords, neutral sign-up, failed-login lockout, `POST /auth/logout`, `POST /me/password`, daily token renewal), `routes/admin.js` (`POST /admin/users/:id/reset-password`), `services.js`, `.env.example`; app `password_screen.dart` (new), `state.dart` (token in `flutter_secure_storage`, real logout, renewal), `gate.dart`, `profile_screen.dart`, `auth_screens.dart`, `strings_fil.dart`, `pubspec.yaml`, both widget tests (secure storage mock); portal `auth.jsx`, `App.jsx`, `components.jsx` (`PasswordModal`, `ResetPasswordButton`), `Residents.jsx`, `StaffAudit.jsx`, `i18n.jsx`, `styles.css`; tests `accounts.test.js` (new, 13).
- **Proof:** server 146/146; `flutter analyze` clean, `flutter test` 5/5; portal builds; no missing Filipino text. Migration applied to the demo database with a backup first; row counts unchanged.
- **Behavior changes users can notice:** new passwords need 8 characters (old ones still work); logging out or changing the password ends every session of that account; 5 wrong passwords lock that email for 15 minutes; staff sessions last 12 hours and resident sessions 14 days, renewed daily while the app is used; staff can give a resident a temporary password at the hall (admins for staff), which must be changed at the next login; each person may make up to 300 changes per 15 minutes (`WRITE_LIMIT`); a taken email at sign-up gets a neutral message; the phone keeps its login in encrypted storage; with `NODE_ENV=production` the server will not start without a real `JWT_SECRET`.
- **Settings to check:** `CORS_ORIGIN` empty now means "this server and localhost only". An existing `.env` with `CORS_ORIGIN=*` keeps allowing every website; change it to empty or to a list.
- **New library:** `flutter_secure_storage` (approved in the decisions).
- **Undo:** `npm run migrate:down` (drops the token version and the reset flag), then `git revert` the batch commit.

### Batch 10: One source of truth, better forms, small data rules
- **Goal:** screens never repeat a rule the server decides, forms prevent mistakes instead of reporting them, and a handful of data gaps are closed.
- **Files:** `database/migrations/008_puroks_and_item_removal.sql` (new), `server/src/db.js` (`likeText`, `purokNames`), `rules.js` (`photoRequired`), `services.js` (`changeRequestDates`, `removeItemTx` records who removed, check-in `alert`), `routes/items.js` (`/meta` rules and puroks, public `GET /puroks`, booked days include overdue loans, tier locked during a loan, owner removal recorded), `routes/requests.js` (`PATCH /requests/:id/dates`, `photo_required`), `routes/auth.js` (purok and phone checks, profile fields can be cleared), `routes/admin.js` (puroks managed by staff, approval needs an ID photo, restore only staff removals, escaped search); app `widgets/date_range.dart` (new), `core/i18n.dart` (`tv`/`txv`), `state.dart`, `item_detail.dart`, `kits_screen.dart`, `help_screen.dart`, `wallet_screen.dart`, `home_tab.dart`, `verification_screen.dart`, `request_detail.dart`, `add_item_screen.dart` (also Edit item), `my_items_screen.dart`, `auth_screens.dart`, `profile_screen.dart`, `strings_fil.dart`; portal `Rules.jsx` (puroks), `Verification.jsx`, `Transactions.jsx`, `Listings.jsx`, `i18n.jsx`; tests `data-rules.test.js` (new, 14), `loop.test.js`.
- **Proof:** server 160/160; `flutter analyze` clean, `flutter test` 5/5; portal builds; no missing Filipino text. Migration applied to the demo database with a backup first (`hiraman-20261022-165943-before-migrate`); row counts unchanged; the seven puroks are in the new table.
- **Behavior changes users can notice:** the date picker greys out booked days (including an overdue loan up to today) and stops a range at 14 days; owners can edit an item (not its tier while a loan is active); borrowers can change the dates of a waiting request; the purok list comes from the server and staff add or remove puroks in Rules; help, wallet and verification texts use the server's numbers; a phone number can be cleared and must look like one; staff cannot approve someone without an ID photo or restore an item its owner deleted; searching for % or _ no longer matches everything.
- **Undo:** `npm run migrate:down` (drops the puroks table and the removal column), then `git revert` the batch commit.

### Batch 11: Notifications in the reader's language
- **Goal:** Filipino readers get Filipino notices with friendly dates, in the place they look most.
- **Files:** `database/migrations/009_notification_params.sql` (new), `server/src/services.js` (`notify` stores `params`), every place that sends a notice (`services.js`, `jobs.js`, `routes/admin.js`, `routes/auth.js`, `routes/community.js`, `routes/requests.js`); app `core/notification_text.dart` (new), `notifications_screen.dart`, `strings_fil.dart` (62 sentences); tests `server/test/notifications.test.js` (new), `app/test/notification_text_test.dart` (new, 4).
- **Proof:** server 164/164 (the new test runs the main flows and finds no notice without values except staff announcements); Flutter 9/9 (Filipino and English sentences, friendly dates, every type fills its blanks, old rows keep their text); `flutter analyze` clean. Migration applied to the demo database with a backup first; row counts unchanged.
- **Behavior changes users can notice:** notices appear in the app's language with dates like "Okt 21, 2026" instead of "2026-10-21". Older notices and staff announcements show as they were sent.
- **Undo:** `npm run migrate:down` (drops the values; the English text stays), then `git revert` the batch commit.

### Batch 12: Logs, lint and automatic checks
- **Goal:** when a resident says "it failed" there is something to look at, logs never leak personal data, and every push is checked automatically.
- **Files:** `server/src/app.js` (request id and request log), `errors.js` (`safeMessage`, `safeErrorLine`, `request_id` in 500 answers), `config.js` (`LOG_REQUESTS`), `jobs.js` (cleaned job errors), `migrations.js`, `seed.js`, `test/helpers/env.js`, `test/logging.test.js` (new, 4), `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `package.json`; portal `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `package.json`, `components.jsx`, `i18n.jsx`; app `analysis_options.yaml`, `pubspec.yaml` (`flutter_lints` 6) and 12 screens fixed for the context lint; `.github/workflows/ci.yml` (new), `.editorconfig` (new).
- **Proof:** server 168/168 (the logging test failed first: missing `safeErrorLine`); `npm run lint` clean in server and portal; `flutter analyze` clean with `use_build_context_synchronously` back on (17 findings fixed); Flutter 9/9; portal builds; the workflow file parses as valid YAML. The workflow itself has not run yet: it runs on GitHub after the first push.
- **Behavior changes users can notice:** none in the app. Server errors now include a short `request_id` the person can quote; the server prints one line per request (`LOG_REQUESTS=0` turns it off).
- **Decision:** Prettier is set up to match the current style but not applied to the whole code base (it would reformat 55 files and hide real changes in the history). Use `npm run format -- <file>` on files you edit.
- **New libraries (dev only):** ESLint, `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, Prettier.
- **Undo:** `git revert` the batch commit. No database changes.

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
