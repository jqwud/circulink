# Hiraman architecture

A neighbourhood borrowing app for one barangay. Residents borrow and lend items with a mobile app; barangay staff run verification, the Barangay Shelf, disputes and announcements from a web portal. Both talk to one API backed by MySQL.

## System map

```
  Resident phone                                   Barangay staff
  ┌──────────────────────┐                         ┌──────────────────────┐
  │ Flutter app (app/)   │                         │ React portal         │
  │ token: phone storage │                         │ (portal/)            │
  └──────────┬───────────┘                         └──────────┬───────────┘
             │ HTTP + JSON, "Authorization: Bearer <token>"    │ same API (same address once built)
             ▼                                                ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ Hiraman API (server/): Node.js + Express, one process, port 4000       │
  │ • routes: auth, items, requests, community, admin (~65 endpoints)      │
  │ • serves the built portal and public photos (/uploads/public)          │
  │ • hourly reminder timer inside the same process                        │
  └───────────────┬─────────────────────────────────────┬──────────────────┘
                  ▼                                     ▼
  ┌──────────────────────────────┐   ┌─────────────────────────────────────┐
  │ MySQL 8: hiraman (15 tables) │   │ Local disk: server/uploads/         │
  │ session time zone +08:00     │   │  public/  item, handover, return     │
  └──────────────────────────────┘   │  private/ ID photos (staff route)    │
                                     └─────────────────────────────────────┘
```

There are no push notifications: reminders and alerts are rows in `notifications` that the app fetches when it is opened.

## Folders

| Folder | What it holds | Entry point |
|---|---|---|
| `server/` | The API | `src/index.js` (starts the server and the reminder timer) → `src/app.js` (builds the Express app) |
| `server/src/routes/` | One file per area: `auth`, `items`, `requests`, `community`, `admin` | |
| `server/src/rules.js` | Every rule number and small rule function (costs, tiers, banned words) | |
| `server/src/services.js` | The request life cycle and credit movements, shared by app and portal routes | |
| `server/test/` | `rules.test.js` (unit), `loop.test.js` (the whole borrow loop against `hiraman_test`), `helpers/` | `npm test` |
| `database/` | `schema.sql` (tables and reference data), `create-test-db.sql` | |
| `portal/` | React + Vite staff portal, 12 pages | `src/main.jsx` → `src/App.jsx` |
| `app/` | Flutter resident app, 19 screens | `lib/main.dart` → `screens/gate.dart` |
| `app/lib/core/` | API client, app state, theme, Filipino strings | |
| `brand/` | Design tokens (`build-brand.mjs`), mascot art and icons (`build-icons.mjs`, `pawsa-art/`) | |
| `docs/` | This file, setup, QA plan, roadmap, changelog, build notes | |

## How a loan flows

```
 borrower requests ──► pending ──owner/staff approve──► approved ──handover──► handed_over ──return good──► closed
        │                 │                                │                       │
        │                 └──reject / cancel──► rejected / cancelled (credits refunded)
        │                                                  └──cancel──► cancelled (refunded)
        │                                                                          └──return damaged/lost──► disputed ──staff resolve──► closed
 low-tier items skip "pending" and are approved at once
```

- **Credits** move only inside database transactions (`withTx` in `server/src/db.js`) and every change writes a `credit_ledger` row. Rows are locked (`SELECT ... FOR UPDATE`) so two requests cannot book the same dates or spend the same credit.
- **Who manages a loan:** the item owner for their own low and medium items; LGU staff for high-tier and Barangay Shelf items (`handledByStaff` in `rules.js`).
- **On a good return:** the lender earns 1 credit if it was on time and they have not hit the 2-per-30-days cap with this borrower; a late borrower loses 1 credit (never below 0).

## Key decisions

| Decision | Why |
|---|---|
| One API for app and portal | One place for rules and data; the portal is served by the API in production. |
| Rules in `rules.js` and `services.js`, not in the clients | The server is the authority. (Some numbers are still repeated in client text; see the roadmap.) |
| Philippine time everywhere | MySQL sessions use `+08:00` and dates are compared as `YYYY-MM-DD` strings (`todayPH`), so loans do not shift with the server's own clock. |
| ID photos private | Stored in `uploads/private`, served only through an authenticated staff route, and every view is written to `audit_log`. |
| Residents see first names only | Phone and email are visible to staff only. |
| Login tokens are JWTs (30 days) and the user is reloaded on every request | A suspension or role change takes effect immediately. |
| Tests use their own database | `server/test/helpers/env.js` forces a `*_test` database and a temporary upload folder before anything else loads. |

## Configuration

`server/.env` (copy from `.env.example`): `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGIN`, optional `UPLOAD_DIR`. Never commit `.env`.

The app's server address: set at build time by `run-phone.cmd` (`HIRAMAN_SERVER`, `HIRAMAN_SERVERS`), discovered at start-up (`AppState.findServer`), or typed on the login screen.

## Run, build and test

See `docs/SETUP.md`. In short: `npm start` in `server/`, `npm run build` in `portal/`, `run-phone.cmd` or `flutter run` in `app/`, `npm test` in `server/`, `flutter analyze` and `flutter test` in `app/`.
