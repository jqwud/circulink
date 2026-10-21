# Hiraman QA plan

A risk-based test plan: test hardest where a bug would hurt residents most (credits, loan states, privacy), lighter elsewhere. Status: ✅ automated · 🟡 partly · ⬜ planned.

## Test pyramid and tools

| Layer | Covers | Tool | Status |
|---|---|---|---|
| Unit (many, fast) | `rules.js`, date and credit maths, banned words, Dart formatting | Node `node:test`; `flutter_test` | 🟡 `server/test/rules.test.js` (20 tests) |
| API and integration | Every endpoint: codes, roles, state changes, credits, against `hiraman_test` | `node:test` + `createApp().listen(0)` | 🟡 `server/test/loop.test.js` (21 steps) |
| End to end (few) | App: sign up and verify, borrow and return, share an item. Portal: verify a resident, settle a dispute | Flutter `integration_test`; Playwright | ⬜ |
| Accessibility | Contrast, tap targets, labels, portal WCAG | Flutter `meetsGuideline`; `@axe-core/playwright` | ⬜ |
| Load | API with 50–200 users | `autocannon` or k6 | ⬜ |
| Security | Dependencies, secrets, web scan | `npm audit`, gitleaks, OWASP ZAP baseline | 🟡 `npm audit` run manually: 0 vulnerabilities |

Run: `cd server && npm test` (all server tests), `npm run test:unit` (no database), `cd app && flutter analyze && flutter test`.

## Risk areas

| # | Area | Exists | Highest-value tests to add |
|---|---|---|---|
| 1 | Requirements and acceptance | Rules in README and `rules.js` | The criteria below; settle the "no stated rule" list |
| 2 | Functional | Main loop | Title 1, 2, 120, 121 characters; emoji names; double-submit borrow; every role against every admin route |
| 3 | Business rules | Rule numbers unit-tested; 12 loop steps | Exact-number table below |
| 4 | State and workflow | Happy-path transitions | Every refused transition; stuck states |
| 5 | API | Status and code checks | Expired token → 401 `auth_expired`; 61st login in 15 min → 429; wrong upload type → 400 |
| 6 | Data integrity | One ledger check | Balance = SUM(ledger) for everyone; 10 parallel borrows of one item → exactly 1 |
| 7 | Security | Role checks, private ID photo | Object-level access for every route; CSV formula injection; upload abuse |
| 8 | Privacy (RA 10173) | First names only; ID views audited | Notice and consent, 7-day ID deletion, account deletion |
| 9 | Accessibility (WCAG 2.2 AA) | Palette contrast validated | Labels, focus, 200% text, keyboard on web |
| 10 | Usability | Developer testing | Script below with real residents |
| 11 | Compatibility | One Android phone, Chrome | Android 8–15, 320 px to tablet, Chrome, Firefox, Safari, Edge (portal) |
| 12 | Performance | API median 12–34 ms on demo data | Targets below |
| 13 | Reliability and recovery | Connection card, Find server, retry | Airplane mode mid-borrow; MySQL stopped while the API runs; app killed during upload |
| 14 | Localization | 278 app and 184 portal strings translated | Server-made notification text; every screen in Filipino at 320 px |
| 15 | Installation and upgrade | `run-phone.cmd` | Upgrade keeps the login; database migrations |
| 16 | Observability | Audit log, health endpoint | Request log; health that checks the database |
| 17 | Regression | `npm test`, `flutter test` | CI on every push |
| 18 | Exploratory | — | Charters below |
| 19 | Release readiness | — | Checklist below |
| 20 | Bug reporting | — | Template and severity below |

## Acceptance criteria

| Feature | Given / When / Then | Status |
|---|---|---|
| Verification | Given a pending resident with an ID photo, when staff approve, then the resident has 3 credits and one "starter" ledger row; approving again adds nothing. | ✅ |
| Quick borrow | Given a verified resident with credits, when they request a low-tier item for free dates, then it is approved at once and 1 credit is held. | ✅ |
| Not enough credits | Given 1 credit, when requesting an item costing more, then `insufficient_credits` and nothing is held. | ✅ |
| Shelf at zero | Given 0 credits, when requesting a Barangay Shelf item, then it is accepted at cost 0 and handled by staff. | ✅ |
| Owner approval | Given a pending medium request, when someone else approves → 403; when the owner approves → approved. | ✅ |
| Refunds | Given a pending request holding 1 credit, when rejected or cancelled, then the credit returns. | ✅ |
| Photos | Given an approved medium request, when handover has no photo → 400 `photo_required`. | ✅ |
| On-time reward and cap | Given on-time good returns, the owner gets +1 for at most 2 loans per borrower per 30 days. | ✅ |
| Late penalty | Given a return after the end date, the borrower loses 1 credit, never below 0. | ✅ |
| Damage | Given a damaged or lost return, the loan is disputed, a report opens, no reward is given. | ✅ |
| Kits | Given a kit with some lines unavailable, available lines are booked and the rest listed missing; none free → 400. | 🟡 happy path only |
| Prohibited items | "gun", "gamot" refused; "gunting" allowed. | ✅ |

**No stated rule yet** (decided on 2026-10-22, to be built): request expiry (B2), daily check-in and lateness (B1), dispute outcomes (B4), ID photo retention (P1), account deletion (P2). Still open: tier changes while on loan, open wanted posts after their date, minimum ratings before showing an average.

## Business-rule tests with exact numbers

| Rule | Case | Expected | Status |
|---|---|---|---|
| Max 14 days, inclusive | start = end · end = start + 13 · end = start + 14 | accepted · accepted · `too_long` | ⬜ |
| No past dates (PHT) | start = yesterday · start = today 00:01 PHT with the server clock on UTC | `past_date` · accepted | ⬜ |
| Cost | low or medium owned / high owned / shelf | 1 / 2 / 0 | ✅ unit |
| Pair cap | 3rd on-time loan, same pair, within 30 days · next loan on day 31 | +0 and `credit_capped` · +1 | 🟡 first case |
| Penalty floor | late return with 0 credits | stays 0, no ledger row | ⬜ |
| On time | confirmed on the end date · the day after | on time · late −1 | 🟡 |
| Order of operations | late and capped return | owner +0, borrower −1, both notified | ⬜ |
| Kit with too few credits | 1 credit, 3 lines costing 1 | 1 booked, 2 "not enough credits" | ⬜ |

## State changes

| From \ action | approve / reject | cancel | handover | return | survey / rate |
|---|---|---|---|---|---|
| pending | allowed | borrower | 400 | 400 | 400 |
| approved | 400 | borrower | allowed | 400 | 400 |
| handed_over | 400 | 400 | 400 | allowed | 400 |
| closed / disputed | 400 | 400 | 400 | 400 | allowed |
| rejected / cancelled | 400 | 400 | 400 | 400 | 400 |

Stuck today (fixed by batches 3, 5, 6): pending forever, approved never collected, handed over never confirmed, disputed never resolved.

## Permissions

| Action | Resident | Item owner | Staff | Admin |
|---|---|---|---|---|
| Borrow, wanted post, report | yes (verified) | yes | no | no |
| Approve / hand over / confirm return of own item | no | yes (not staff-handled) | yes | yes |
| Read someone else's request | 403 | own items only | yes | yes |
| Portal routes | 403 | 403 | yes | yes |
| View an ID photo | no | no | yes (audited) | yes (audited) |
| Staff accounts and audit log | no | no | 403 | yes |

## Performance targets

| Measure | Target | Today |
|---|---|---|
| API p95, 50 concurrent users, laptop | < 300 ms | median 12–34 ms on demo data, not load-tested |
| App cold start to splash / to usable | < 2 s / < 4 s | not measured |
| Photo shown in lists | < 200 KB | app uploads 1280 px q80; portal uploads not resized |
| Mascot images | < 100 KB each | 52–102 KB |

## Usability test (5 tasks, first-time users)

1. Sign up and send a photo of your ID.
2. Find folding chairs and borrow them for next Saturday.
3. Share a ladder so neighbors must ask you first.
4. Approve a request for your ladder and record the handover with a photo.
5. How many credits do you have, and why did the number change last time?

Observe hesitation, wrong taps, and whether people understand credits and tiers. Success: each task done without help in under 3 minutes, average ease rating of at least 5 out of 7.

## Exploratory charters

- **Break the credit rules (45 min):** double taps, two phones at once, cancel after handover, kit with 1 credit, late return at 0 credits.
- **Misuse the upload (30 min):** GIF, 6 MB file, renamed .exe, SVG, a 10 000 px photo, an outside URL as the photo.
- **Bad connection (30 min):** airplane mode mid-borrow, server stopped, Chrome slow-3G, kill the app during an upload, switch Wi-Fi to hotspot.

## Smoke test (every change, about 5 minutes)

`/api/health` ok · resident and staff log in · Browse lists items · borrow a quick-borrow item and cancel it (credit returns) · portal dashboard loads · `npm test`, `flutter analyze`, `flutter test` pass, portal builds.

## Full regression (before each release)

All server tests on a fresh test database · unit tests · end-to-end journeys · manual pass on a real phone in Filipino and English · accessibility checks · the three charters. Bugs about credits or request states always get an automated test first.

## Release go / no-go

- [ ] No open Blocker or Major bugs
- [ ] Smoke and full regression passed (results attached)
- [ ] Database backup taken and restore tested
- [ ] Migrations applied on a copy first
- [ ] Version numbers and release notes updated
- [ ] Release APK signed with the release key
- [ ] Rollback ready: previous APK and the backup
- [ ] Privacy notice approved by the barangay
- [ ] Demo accounts and demo text removed

## Bug report template

```
Title: <what is wrong, where>
Steps to reproduce:
  1.
  2.
Expected:
Actual:
Severity: Blocker | Major | Minor | Trivial
Priority: P1 | P2 | P3
Environment: app version, phone and Android version, browser, server commit
Evidence: screenshot, screen recording, server log lines
```

| Severity | Meaning | Example |
|---|---|---|
| Blocker | Data loss, wrong credits, privacy leak, main journey impossible | Credits deducted twice |
| Major | Main journey broken, no workaround | Cannot confirm a return |
| Minor | Wrong, with a workaround | No Edit item; delete and re-post |
| Trivial | Cosmetic | Misaligned chip |
