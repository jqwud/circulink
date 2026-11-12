# CircuLink: Circular Drop-off Hub System Spec

Status: approved concept (2026-11-12). Replaces the Hiraman borrowing system.
Name: **CircuLink** (chosen by the team, 2026-11-12). Steps 1 (clean slate, rebrand, new database), 2 (rules engine R1 to R13) and 3 (the drop-off flow in the API) are done.

## 1. Purpose (SDG 12)

SDG 12 asks for sustainable consumption and production: "do more and better with less."
This system keeps items in use and out of the landfill. Residents bring items they no longer need to a hub, where staff sort each item into **reuse, repair, recycle or reject**. Reusable items go to verified partner organizations. Everything is weighed, so the main measure is **kilograms kept in use**, not the number of people helped.

| SDG 12 target | Feature |
|---|---|
| 12.2 Efficient use of resources | Reuse and repair outcomes extend an item's life |
| 12.3 Food waste | Surplus packaged food, with an expiry check, released only to verified organizations |
| 12.4 Chemicals and waste | E-waste and batteries go only to accredited handlers |
| 12.5 Reduce, reuse, recycle | The core flow, measured in kg |
| 12.6 Sustainability reporting | Monthly impact report for each hub and the whole system |
| 12.8 Awareness | Sorting guide and a personal impact page |

## 2. Roles

| Role | Where | Can do |
|---|---|---|
| Resident | Mobile app | Declare items, get a drop-off code, see their drop-offs, points and impact, read the sorting guide |
| Hub staff | Web portal | Check in drop-offs by code, weigh and sort items, release stock to partners, at their own hub only |
| Partner organization | Web portal | Request items from reuse stock and see their pickups. Must be approved by an admin |
| Recycler | Web portal (staff enters for them) | Receives recycle and e-waste batches. Accredited flag for e-waste |
| Admin | Web portal | Approve hubs, staff, partners and recyclers; review flags; see reports; edit categories and factors |

Hubs can be a **school or a barangay** (hub `type`: `school` / `barangay` / `other`). An admin registers each one.

## 3. Main flow

```
Resident declares items ──► code issued (expires in 7 days)
        │
        ▼
Resident brings items to hub ──► staff enters code ──► staff weighs + sorts each item
                                                        │
                ┌──────────────┬───────────────┬────────┴──────┐
                ▼              ▼               ▼               ▼
             REUSE           REPAIR         RECYCLE          REJECT
           (to stock)    (repair queue;   (batch to a      (disposed;
                │         then reuse or    recycler,        0 points)
                ▼         recycle)         by weight)
     Partner org requests ──► staff releases ──► partner confirms pickup
```

Item states: `declared → received → (in_stock | in_repair | in_recycle_batch | rejected) → (released | recycled)`.
A declaration with no drop-off expires after 7 days, with no penalty.

## 4. Points and impact

- Points are issued **only when staff process an item at the hub**. They stay `pending` until the item reaches a final state (`released`, `recycled`, `rejected`), then become `confirmed`.
- Formula: `points = floor(weight_kg × category_rate × outcome_multiplier)`
  - Multiplier: reuse 1.0 · repair 0.8 · recycle 0.5 · reject 0
  - Category rates are set by the admin (e.g. clothes 10/kg, e-waste 15/kg, paper 4/kg)
- Impact: `kg_diverted` (all non-rejected weight) and `co2e_avoided = weight × category CO₂ factor`. The factors are admin-editable estimates, labeled "estimate" in the UI.
- Points **cannot be transferred and have no cash value**. They unlock badge tiers (Seed, Sprout, Tree, Forest) and leaderboard rank. Non-cash recognition from a hub (e.g. a school merit certificate) is optional and handled outside the system.

## 5. Anti-abuse rules

Each rule is a pure function in `rules.js` with its own unit test. These tests are the proof that the system can't be gamed.

| # | Rule | Stops |
|---|---|---|
| R1 | Only staff create points, and only by processing an item at a hub | Residents rewarding themselves |
| R2 | Only approved partner organizations can receive items. Residents cannot | Giving to yourself or a second account |
| R3 | Staff cannot process a drop-off whose resident account is their own (same user, or the same phone or student ID) | Staff crediting themselves |
| R4 | Staff can only act at hubs they are assigned to | Cross-hub fraud |
| R5 | Rejected items earn 0 points. Points follow weight, not item count | Junk drops and splitting one drop-off into many |
| R6 | Points stay pending until the item reaches a final state **and every item of the same drop-off is sorted**, so a flag raised by the last item always comes first. Confirmed points never change | Earning points before the item is really handled |
| R7 | Flag for admin review: one drop-off over 50 kg, a resident over 100 kg in 30 days, or a hub's daily total over 3× its 30-day average (once the day passes 20 kg, so a new hub's first busy day is not flagged). Flagged points stay pending; an upheld flag cancels them | Inflated weights |
| R8 | One account per phone number or student ID. Phone verification uses a code shown in the app or by staff (no paid SMS) | Fake accounts |
| R9 | At most 3 open declarations per resident. Codes are 6 characters, expire after 7 days, and work only once | Code spam |
| R10 | E-waste and battery items can only be sent to recyclers with `accredited = true` | Unsafe disposal (target 12.4) |
| R11 | Food items need an expiry date at least 3 days ahead, can only be reused (given out) or rejected, and can only be released to partners | Food safety |
| R12 | Every state change goes into an append-only `audit_log`. Points come only from ledger rows; balances are never edited directly | Hidden edits |
| R13 | Rate limits: 5 wrong passwords lock an email for 15 minutes, changes per person are limited, and code check-ins are capped at 30 per staff member per 15 minutes (with about 887 million possible codes) | Bots and code guessing |

The numbers are starting values and live in `server/src/rules.js`, next to one function per rule. `server/test/rules.test.js` tests each rule on its own (`npm run test:unit`, no database needed).

## 6. Data model (MySQL)

| Table | Key columns |
|---|---|
| `users` | id, role (resident/staff/partner/admin), name, phone (unique), student_id (unique, nullable), status |
| `hubs` | id, name, type (school/barangay/other), address, status |
| `hub_staff` | hub_id, user_id |
| `partners` | id, user_id, org_name, kind (shelter/school/ngo/other), status (pending/approved/suspended) |
| `recyclers` | id, name, materials, accredited (bool) |
| `categories` | id, name, rate_per_kg, co2_per_kg, hazardous (bool), food (bool) |
| `declarations` | id, resident_id, hub_id, code, status (open/received/expired), expires_at |
| `items` | id, declaration_id, category_id, weight_kg, outcome, state, expiry_date, processed_by, processed_at |
| `releases` | id, partner_id, hub_id, status (requested/released/picked_up), released_by |
| `release_items` | release_id, item_id |
| `recycle_batches` | id, hub_id, recycler_id, total_kg, sent_at |
| `points_ledger` | id, user_id, item_id, points, status (pending/confirmed/cancelled), reason |
| `flags` | id, kind, ref_id, status (open/cleared/upheld), reviewed_by |
| `audit_log` | id, actor_id, action, entity, entity_id, data_json, created_at (no update or delete) |
| `notifications` | kept from Hiraman |

## 7. Screens

**Mobile app (residents):** Home (impact total, badge) · Declare items · My codes · Drop-off history (each item's outcome) · Points and badges · Sorting guide · Profile.

**Web portal:**
- Staff: Check-in by code · Weigh and sort · Stock · Repair queue · Recycle batches · Release to partner
- Partner: Browse stock · My requests
- Admin: Hubs · Users and approvals · Categories and factors · Flags · Reports (monthly, per hub, export)

## 8. What we keep and what we remove

- **Keep:** Express API structure, auth and token handling, uploads, notifications, jobs runner, migration scripts, Docker setup, CI, Flutter UI kit and theme, portal shell.
- **Rewrite:** rules, services, routes, schema, every app and portal screen, seed data, docs, branding text.
- **Remove:** loans and borrowing, Barangay Shelf, Tiwala score, credits, food vouchers, disputes, phrase messaging, and every Hiraman name in the UI.

## 9. Fit with the CI/CD lab (Lab Act 3)

- `npm test` in `server/` runs the R1–R13 rule tests plus the flow tests. A broken rule turns the pipeline red and blocks publishing, which is Challenge 1.
- Pull requests run CI only. Pushes to `main` and `v*` tags also build and push the Docker image to GHCR (Challenges 2 and 3).
- One Dockerfile builds the API and portal inside the image, with no prebuilt `dist` copied in (Trap 1 in the lab guide).
- Only free tools: Node 22, MySQL, GitHub Actions, GHCR.

## 10. Build order

1. Clean slate: remove Hiraman features, keep the shell, write the new schema and migrations
2. Rules engine (R1–R13) and its unit tests
3. Declarations, codes, staff check-in, weigh and sort, points ledger
4. Stock, partner requests, releases, recycle batches, repair queue
5. Flags, audit log, admin review
6. Portal screens (staff, partner, admin)
7. App screens (resident)
8. Reports, impact dashboard, sorting guide
9. Docs, README, seed data, CI/CD update for the lab
