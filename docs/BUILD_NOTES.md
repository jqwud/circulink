# Hiraman: how we built it

Context for the instructor. Hiraman is the project from our pitch, now developed into a working prototype. This document explains **what we built, how it fits together, and why we made each choice**.

## 1. The problem and the SDG

Barangay households own many things they use a few times a year (ladders, chairs, tools, calculators, party items) while neighbors buy the same things new. That is waste created by buying, and waste created later when the items are thrown away.

Hiraman is a barangay-level sharing platform: neighbors borrow, lend, donate and reuse, with the **Local Government Unit (LGU) as the trusted organizer**.

**SDG 12, Target 12.5**: substantially reduce waste generation through prevention, reduction, recycling and reuse. Every completed loan is a purchase that did not have to happen.

## 2. Two sides of one system

| Side | Who | Technology | Why |
|---|---|---|---|
| Mobile app | Residents | Flutter (Android) | One code base, works on the phones residents already have. |
| Web portal | LGU staff and admin | React + Vite | Staff work at a desk and need tables, filters and exports. |
| API | Both | Node.js + Express | Simple, one language across the web parts. |
| Database | Both | MySQL | Familiar, runs on a laptop, good for relational records like loans and credits. |

Both clients talk to the same API, so a request approved in the portal appears in the app immediately. The portal is built into plain files and served by the same server.

```
Flutter app ──┐
              ├──> Node/Express API ──> MySQL (hiraman)
React portal ─┘          │
                         └── uploads/public  (item photos)
                             uploads/private (ID photos, staff only)
```

## 3. Design decisions that matter

**Trust comes from the LGU.** Residents must send an ID photo; staff verify them before they can borrow or lend. ID photos are stored privately and are viewable only by staff through an authenticated route. Other residents see only a first name and purok.

**A credit system keeps sharing fair.** Starter credits (3) let new members borrow. Borrowing costs 1 credit (2 for high-value items; Barangay Shelf items are free so no one is locked out). Credits are *held* when a request is made and *returned* if it is rejected or cancelled. The lender earns 1 credit **only** after a confirmed, on-time, undamaged return. Late return costs the borrower 1 credit (never below zero). A monthly cap (2 rewarded loans per lender and borrower pair) prevents two accounts farming credits. Every change is a row in `credit_ledger`, so any balance can be explained.

**Risk tiers decide who approves.**

| Tier | Example | Approval | Handover |
|---|---|---|---|
| Low | Calculator, extension cord | Automatic | Neighbor to neighbor |
| Medium | Power drill | Owner approves | Photos at handover and return |
| High / Barangay Shelf | Valuable items, LGU-owned items | LGU staff | Barangay hall |

**Problems have a path.** Damaged or lost returns become `disputed` and open a report automatically. The barangay mediates. No lender reward is given until settled.

**Impact is measured honestly.** "Purchases avoided" counts only borrowers who answered *"yes, I would have bought or rented it"* in a one-question survey after a return. "Maybe" is shown separately and never added. Waste prevented is shown as a **labeled estimate range** (confirmed yes only, up to yes plus maybe) multiplied by an average weight per category. We say plainly that it is an estimate.

**Safety rules.** Listings are checked against a prohibited list (weapons, medicines, chemicals, fireworks, alcohol, cigarettes) using whole-word matching, so "gunting" (scissors) is allowed. Residents can report any item or loan.

**Filipino and English from the start.** The app and portal both have a language toggle. English text is the key and the Filipino dictionary is looked up with English as a fallback, so a missing translation never breaks a screen.

**Pawsa, the mascot.** Pawsa appears on empty states, success dialogs, errors and onboarding, so the app feels friendly and approachable for all ages. Colors and the icon come from one source (`brand/`) used by both the app and portal.

## 4. What is built

### Resident app (19 screens)

Onboarding, login, register (with server address setting), ID verification, home (credits, news, shelf, kits, new items, notification bell), browse and search with category filters, item details, borrow request with date range, share an item, my items (pause, resume, remove), requests (two tabs) and request details with every action (approve, reject, hand over, return with condition and photo, cancel, survey, rating, report), credits wallet, wanted board, event kits, notifications, profile with badges, edit profile, community impact, help and rules, report.

### LGU portal (12 pages)

Login, dashboard, resident verification (with private ID viewer), residents (suspend, reinstate), listings (remove, restore), Barangay Shelf (add and edit LGU-owned items), transactions (with CSV export), reports and disputes, announcements (all or one purok), community impact (with the labeled estimate), rules (read-only view of the credit rules), staff and audit log.

### API

About 60 routes. Business rules (credits, approvals, caps, returns) live in one file, `server/src/services.js`, and are shared by the app and portal so they cannot disagree. All credit movement happens inside database transactions.

## 5. How we know it works

`server/test/loop.test.js` runs the whole loop against a real MySQL-compatible database (21 steps): register, unverified blocked, ID upload, staff verification and starter credits, rejection reason, prohibited listing check, low-tier auto-approval, double-booking blocked, only the owner can hand over, on-time return and lender reward, ledger completeness, medium-tier approval and photo requirement, damaged return mediation, reject and cancel refunds, insufficient credits, monthly cap, overdue penalty, portal endpoints, kits, wanted board and announcements.

The portal was built and screenshot-tested in both languages, and every phrase was checked for a Filipino translation.

**Honest limitation:** the Flutter app was written and checked for structure, imports and translations, but it could not be compiled in our build environment. Expect to fix a few small errors on the first `flutter run`.

## 6. Mapping to the pitch rubric

| Criterion | Where to look |
|---|---|
| **Prototype** | Working app + portal + API + database (this repo). Demo accounts in `README.md`. |
| **Impact** | Portal > Impact page; app > Our community impact; honest survey method in section 3. |
| **Sustainability** | LGU runs it (verification, shelf, mediation, announcements). Credits remove the need for money. Runs on one laptop or small server. |
| **SDG alignment** | Target 12.5; every loan avoids a purchase; Repair and Reuse tag; Barangay Shelf for reuse of donated items. |
| **Feasibility and risk** | Verification, risk tiers, mediation, prohibited list, private ID storage, audit log. |

## 7. Suggested demo script (5 minutes)

1. **Portal** (admin): dashboard, then Verification. Open `gina@` and approve (or reject with a reason). Mention the ID viewer is staff only.
2. **App** (Ana): home, credits, browse, open an item, choose dates, send request. Show the credit held.
3. **App** (Ben, owner of a medium item): approve the request, confirm handover with a photo, then confirm return.
4. **App**: the borrower answers the one-question survey; the lender gets +1 credit. Show the wallet history.
5. **Portal**: Transactions and CSV export; Reports (the damaged-item path); Impact (labeled estimate).
6. Switch the app to **English / Filipino** to show the toggle.

## 8. What we would do next

Push notifications, a pilot with one real barangay, a donation workflow with weighing at the hall, SMS for residents without data, and iOS.
