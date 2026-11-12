# Changelog

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

The project is now **CircuLink**, a drop-off hub system for SDG 12. It replaces the Hiraman borrowing app; the Hiraman history stays in git.

- **Brand:** new name, logo (two arrows around a chain link), app icons and colors (CircuLink green `#0E7C66`, amber `#F2B33D`). The Pawsa mascot is retired.
- **Database:** new schema. The platform tables (accounts, notifications, audit log, job runs) are in `schema.sql`. Migration `001_hubs_and_items` adds hubs, hub staff, partner organizations, recyclers, categories (14 starting ones with estimated points and CO₂ factors), declarations, items, releases, recycle batches, the points ledger and flags. Database checks: item weight between 0 and 500 kg, points never negative, one points row per item, each item in at most one release and one recycle batch.
- **Accounts:** roles are resident, staff, partner and admin. Sign-up needs a phone number. There is one account per email, phone number (written any way) and student ID (R8). Sign-up can only create residents.
- **API:** account routes, `GET /hubs`, `GET /meta` (categories, hubs, outcomes, badge tiers, rule numbers) and notifications. All borrowing, donation, credit, Tiwala score and reward routes are removed.
- **Audit log:** append-only (R12). A test fails if any code updates or deletes audit rows.
- **Portal:** login for staff, partners and admins (residents are turned away), plus a dashboard of hubs and categories.
- **App:** new onboarding, Home (how CircuLink works, your impact), Hubs (where to bring things, what is accepted), Me, and notifications. Sign-up takes a phone number and an optional student ID. The Android app ID is now `com.circulink.app`.
- **Tests:** server 43, portal end-to-end 5 (with accessibility scan), app 14 plus 3 end-to-end journeys.
