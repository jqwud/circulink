# CircuLink architecture

Residents use a mobile app to find hubs and declare items. Hub staff, partner organizations and admins use a web portal. Both apps talk to one API backed by MySQL. The design and the anti-abuse rules (R1 to R13) are in [`CIRCULAR_HUB_SPEC.md`](CIRCULAR_HUB_SPEC.md).

## System map

```
  Resident phone                                   Hub staff / partners / admins
  ┌──────────────────────┐                         ┌──────────────────────┐
  │ Flutter app (app/)   │                         │ React portal         │
  │ token: secure store  │                         │ (portal/)            │
  └──────────┬───────────┘                         └──────────┬───────────┘
             │ HTTP + JSON, "Authorization: Bearer <token>"    │ same API (same address once built)
             ▼                                                ▼
  ┌────────────────────────────────────────────────────────────────────────┐
  │ CircuLink API (server/): Node.js + Express, one process, port 4000     │
  │ • routes: auth (account), meta (hubs, categories, notifications)       │
  │ • serves the built portal and public photos (/uploads/public)          │
  │ • scheduled jobs inside the same process (src/jobs.js)                 │
  └───────────────┬─────────────────────────────────────┬──────────────────┘
                  ▼                                     ▼
  ┌──────────────────────────────┐   ┌─────────────────────────────────────┐
  │ MySQL 8: circulink           │   │ Local disk: server/uploads/public   │
  │ session time zone +08:00     │   │ item photos taken at the hub        │
  └──────────────────────────────┘   └─────────────────────────────────────┘
```

`/api/health` reports `db: ok` (200) or `db: down` (503). There are no paid services: no SMS and no push. Notifications are rows the app fetches while it is open.

## Folders

| Folder | What it holds |
|---|---|
| `server/src/app.js` | Builds the Express app: security headers, CORS, request ids and logging, the write rate limit, routes, and the portal. |
| `server/src/routes/` | `auth.js` (sign-up, login, profile, privacy, my data, uploads) and `meta.js` (hubs, categories, rule numbers, notifications). New areas get their own file. |
| `server/src/rules.js` | Every rule number in one place (codes, flag thresholds, outcomes and multipliers, badges). |
| `server/src/services.js` | `notify` and `audit`. `audit` is the only code that writes the audit log. |
| `server/src/jobs.js` | Scheduled jobs (unused upload cleanup, old notifications) and the runner that records each run in `job_runs`. |
| `server/test/` | One file per area, against the `circulink_test` database. `npm test`. |
| `database/` | `schema.sql` (platform tables) and `migrations/` (numbered, each with an undo part). `001_hubs_and_items.sql` holds the hub tables. |
| `portal/` | React + Vite. `src/App.jsx` (shell and navigation by role), `src/pages/`, `e2e/` (Playwright with an accessibility scan). |
| `app/` | Flutter. `lib/core/` (API client, state, theme, Filipino strings), `lib/screens/`, `lib/widgets/ui/` (UI kit). |
| `brand/` | Tokens (`build-brand.mjs`) and the logo and icons (`build-icons.mjs`). |

## Roles

| Role | Where | Made by |
|---|---|---|
| `resident` | App | Sign-up (the only role sign-up can create) |
| `staff` | Portal | Admin; assigned to hubs in `hub_staff` |
| `partner` | Portal | Admin; acts only while `partners.status = 'approved'` |
| `admin` | Portal | `npm run create-admin` or another admin |

## The item life cycle (built in steps 3 and 4)

```
declared ──staff checks in code──► received ──staff weighs + sorts──► in_stock ──release to partner──► released
                                                                   ├► in_repair ──► in_stock / in_recycle_batch
                                                                   ├► in_recycle_batch ──batch sent──► recycled
                                                                   └► rejected (0 points)
```

Points are written to `points_ledger` as `pending` when staff process an item. They become `confirmed` when the item reaches a final state, and `cancelled` if the outcome is reversed (R6).
