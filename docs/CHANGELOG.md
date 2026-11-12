# Changelog

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
