# Changelog

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
