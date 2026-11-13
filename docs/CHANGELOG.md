# Changelog

## 1.2.0: UI and UX pass (2026-11-13)

- **App forms:** sign-in, sign-up and change password use the shared `HiTextField`, with autofill and a Next key. Mistakes now show under the field they belong to; server errors show as a red `InfoBanner` with an icon.
- **Home:** the *Your impact* card shows a dash while loading and a short message when it cannot load, instead of a false 0 kg and 0 points.
- **App text:** every screen uses the `HiText` styles; the splash tagline is translated.
- **Portal, staff:** *Hand over* and *Mark as sent* ask before acting, because they confirm residents' points and cannot be undone. A failed load of the recycle batches or the category list now shows an error with *Try again* instead of nothing.
- **Portal, partner:** *Take back* asks before cancelling a request.
- **Portal dates:** shown in Manila time (for example *Nov 13, 2026, 3:12 PM*) instead of raw text, in check-in, releases, requests, flags, the audit log and expiry dates.
- **Portal styling:** the focus ring uses the accent token, stat and note borders come from the tone tokens, the language buttons announce which one is on (`aria-pressed`), and inline styles were replaced by shared classes (only the data-sized chart bars keep one).

## 1.1.0: the CI/CD lab (Lab Act 3) (2026-11-13)

- **Pipeline:** the workflow is `.github/workflows/ci-cd.yml`, can be started by hand (`workflow_dispatch`), and also publishes the image as `:main` and `:v1.2.3`.
- **Secret check:** a step confirms the `DEMO_API_KEY` repository secret without printing it; on forks and fresh copies, where secrets are missing, it only warns.
- **Lab challenges:** a deliberately broken test stopped publishing (Challenge 1), pull request #1 ran the checks without publishing (Challenge 2), and the `v1.0.0` and `v1.1.0` tags published versioned images (Challenges 3 and 4).
- **Team** table in the README.

## 0.9.1: the complete test case and stricter sign-up (2026-11-13)

- **`docs/TEST_CASES.md`:** one test case of 26 steps from sign-up to the monthly report, with the security checks at each step. All of it is automated in `server/test/full-journey.test.js`.
- **Passwords:** common passwords (`password123`, `12345678`), one repeated letter, and passwords made of your own email, name or phone are refused at sign-up and when changing a password.
- **Names:** letters of any language, spaces and `. ' - , ( )` only, so a name can't carry a link or markup.
- **Login** takes the same time for an unknown email as for a wrong password, so the answer time doesn't show who has an account.

## 0.9.0: step 9, docs, demo data and the CI/CD pipeline (2026-11-13)

- **CD:** the pipeline now publishes the Docker image to the GitHub Container Registry (`ghcr.io/jqwud/circulink`) when every check passes on `main` (`latest`, `sha-<commit>`) or on a `v*` tag (`1.2.3`, `1.2`). Pull requests and other branches are checked but never published. Only the publish job may write packages.
- `docker-compose.ghcr.yml` runs the published image instead of building one.
- **Demo data:** `npm run seed:demo` adds six months of drop-offs to the demo accounts: finished months with partner pickups and recycle batches, and this month with stock, an item in repair, a partner request, a heavy drop-off flagged for the admin and an open code. A test checks that this data keeps the rules (R5, R6, R7, R10). `npm run seed` is unchanged.
- **Docs:** new `CICD.md`; the README, architecture, setup and containers guides now describe the finished system.

## 0.8.0: step 8, reports, impact dashboard and sorting guide (2026-11-13)

- **Impact reports** for admins (`GET /admin/reports`, `/admin/reports.csv`): kg by outcome, kg kept in use, diversion rate, estimated CO₂e, drop-offs, residents and partner pickups for a month, for all hubs or one, split by hub and by category, with the last 12 months. Totals only, never names. Weight from a drop-off whose flag was upheld is left out.
- Portal: the *Impact reports* page with a CSV export, and a "This month" row on the admin dashboard.
- App: the *Sorting guide* (how to prepare items, what each outcome means, a tip per category) and a card with what everyone kept in use together (`GET /impact`).
- 8 new server tests, a portal journey and an app journey.

## 0.7.0: step 7, the app screens (2026-11-13)

- Residents declare items in the app and get a 6-character code, see their open codes and history, and open each drop-off to see what staff decided for every item (outcome, kg, points, pending or confirmed). An open drop-off can be cancelled.
- Home shows the resident's real impact: kg kept in use, points, pending points, estimated CO₂ avoided, badge and points to the next badge.
- New *Drop-offs* tab. Everything in English and Filipino.
- A new app journey on the real API: declare, staff check in and sort, the resident sees the result.

## 0.6.0: step 6, the portal screens (2026-11-12)

- **Hub staff:** *Check in and sort* (type the resident's code; weigh and sort each item, with an expiry date for food and a warning for hazardous items; add items they did not list; a queue of drop-offs still to sort), *Stock and recycling* (stock, repair queue and recyclables at my hubs; move items; make a recycle batch, where recyclers that are not accredited cannot be chosen for e-waste; mark batches as sent), *Releases to partners* (hand over or decline with a reason).
- **Partner organizations:** *Available items* (choose items from one hub and ask for them; never shows who gave them) and *My requests* (take back, or confirm the items arrived).
- **Admins:** all staff pages, plus *Flags*, *Accounts* (make accounts with a temporary password shown once, assign hubs, suspend, reset, delete on request; never on their own account), *Partner organizations*, *Hubs and recyclers*, *Categories* and the read-only *Audit log*.
- The dashboard shows what needs doing for each role.
- Every page is in English and Filipino (220 phrases).
- Browser tests: the whole loop from check-in to confirmed points, the e-waste rule, an admin journey, and an accessibility scan of every page for each role (9 tests).

## 0.5.0: step 5, the admin side (2026-11-12)

- **Accounts:** admins create staff, partner and admin accounts with a temporary password shown once (residents only ever sign up in the app), assign staff to hubs, suspend and reinstate (suspending ends every session at once), reset passwords, and delete resident accounts that asked for it (name and contact go; weights and points stay without a name, so totals stay right).
- **Partner organizations:** approve or suspend. Suspending drops the organization's open requests, so the items go back to stock.
- **Hubs, recyclers, categories:** add and change them. Pausing or closing a hub cancels its open codes. Recycler accreditation (R10) is set here. Point rates are limited to 0 to 50 per kg, and every change keeps the old value in the audit log.
- **Audit log:** a read-only page of every change, with who made it. There is no way to edit or delete it through the API.
- **Limits on admins:** an admin can never suspend, reset, delete or approve their own account, or decide a flag on their own drop-off.
- 16 new tests.

## 0.4.0: step 4, where items go (2026-11-12)

- **Partner organizations** (approved only, R2) browse reusable stock at the hubs (never who gave it), ask one hub for items, take back a request, and confirm when items arrive.
- **Hub staff** see their stock and partner requests, hand items over or decline with a reason, move items after sorting (repair done, spoiled, recyclable after all), and put recyclables into batches for a recycler, then send them.
- Items become **final** when handed to a partner or sent to a recycler. Their points are then confirmed and the resident is told.
- Checked again at the counter: the partner is still approved, staff never hand items to their own organization (also through a second account), food is still fresh, and e-waste and batteries go only to an accredited recycler (also if it lost its accreditation after the batch was made).
- New rule: moving an item after sorting can only lower its points, never raise them, so sorting as "recycle" and moving to stock later cannot be used to gain points.
- 27 new tests (146 server tests in total).

## 0.3.0: step 3, the drop-off flow (2026-11-12)

- **Residents** declare items for a hub and get a 6-character code (`POST /declarations`), see their drop-offs with each item's outcome and points, cancel an open one, and see their impact (`GET /me/impact`: kg kept in use, estimated CO₂e, points and badge).
- **Hub staff** see their hubs and queue, check a drop-off in by its code (`POST /staff/checkin`), add an item the resident did not list, and weigh and sort each item (`POST /staff/items/:id/sort`). Sorting is the only place points are created.
- **Admins** review flagged drop-offs: clear (points go on) or uphold (points cancelled, resident told).
- A job expires codes nobody used within 7 days.
- R6 is stricter: points are confirmed only once every item of the drop-off is sorted, so a flag raised by the last item always holds all of them. Found while writing the tests.
- R11: sealed food can only be given out or rejected.
- R13: 30 wrong codes per staff member per 15 minutes; codes that work do not count.
- 29 new end-to-end tests that try each rule the way a cheater would (119 server tests in total).

## 0.2.0: step 2, the rules engine (2026-11-12)

- Every anti-abuse rule from the spec (R1 to R13) is now a small function in `server/src/rules.js`: who may act at a hub, who may receive items, no processing your own drop-off (also through a second account with the same phone or student ID), points from weight and outcome, the item life cycle, when points become confirmed or cancelled, review flags, drop-off codes, hazardous items, food, and rate limits.
- 49 rule tests (`npm run test:unit`, no database needed), plus end-to-end tests for the login lockout and the per-person change limit.
- Phone numbers written as +63 and 0 are now the same number (R8).
- `database/create-test-db.sql` takes the app account's password on the command line (`SET @pw = '...'`), so a password is never written into the public repository.

## 0.1.0: CircuLink, step 1 (2026-11-12)

The project is now **CircuLink**, a drop-off hub system for SDG 12.

- **Brand:** new name, logo (two arrows around a chain link), app icons and colors (CircuLink green `#0E7C66`, amber `#F2B33D`). The Pawsa mascot is retired.
- **Database:** new schema. The platform tables (accounts, notifications, audit log, job runs) are in `schema.sql`. Migration `001_hubs_and_items` adds hubs, hub staff, partner organizations, recyclers, categories (14 starting ones with estimated points and CO₂ factors), declarations, items, releases, recycle batches, the points ledger and flags. Database checks: item weight between 0 and 500 kg, points never negative, one points row per item, each item in at most one release and one recycle batch.
- **Accounts:** roles are resident, staff, partner and admin. Sign-up needs a phone number. There is one account per email, phone number (written any way) and student ID (R8). Sign-up can only create residents.
- **API:** account routes, `GET /hubs`, `GET /meta` (categories, hubs, outcomes, badge tiers, rule numbers) and notifications. All borrowing, donation, credit, Tiwala score and reward routes are removed.
- **Audit log:** append-only (R12). A test fails if any code updates or deletes audit rows.
- **Portal:** login for staff, partners and admins (residents are turned away), plus a dashboard of hubs and categories.
- **App:** new onboarding, Home (how CircuLink works, your impact), Hubs (where to bring things, what is accepted), Me, and notifications. Sign-up takes a phone number and an optional student ID. The Android app ID is now `com.circulink.app`.
- **Tests:** server 43, portal end-to-end 5 (with accessibility scan), app 14 plus 3 end-to-end journeys.
