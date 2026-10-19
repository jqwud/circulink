# Hiraman

**Hiram muna, kapitbahay.** A barangay sharing app: borrow what you need, lend what you don't use, and waste less together. Built for **SDG 12 (Responsible Consumption and Production), Target 12.5: reduce waste through prevention, reduction, recycling and reuse.**

Pawsa the energetic pusa is the mascot. Everything works in **Filipino and English**.

## What is in this folder

| Folder | What it is |
|---|---|
| `app/` | The **resident mobile app** (Flutter, Android). Browse, borrow, lend, credits, wanted board, event kits. |
| `portal/` | The **LGU web portal** (React). Verify residents, manage listings and the Barangay Shelf, see transactions, reports and community impact. |
| `server/` | The **API** (Node.js + Express) that both use. |
| `database/` | The **MySQL** schema (`schema.sql`). |
| `brand/` | Pawsa, the icon and the colors. One source for both the app and the portal. |
| `docs/` | `SETUP.md` (how to run it) and `BUILD_NOTES.md` (how we built it, for the instructor). |

## Quick start (about 20 minutes)

Read **`docs/SETUP.md`**. It is written step by step for Windows. In short:

1. Install Node.js (LTS) and make sure MySQL is running.
2. `mysql -u root -p < database/schema.sql`
3. In `server/`: copy `.env.example` to `.env`, then `npm install`, `npm run seed`, `npm start`.
4. In `portal/`: `npm install`, `npm run build`. Open http://localhost:4000 for the LGU portal.
5. In `app/`: follow the Flutter steps in `docs/SETUP.md` and run it on your Android phone.

## Demo accounts (password for all: `hiraman123`)

| Who | Email | Where |
|---|---|---|
| LGU admin | `admin@hiraman.test` | Portal |
| LGU staff | `staff@hiraman.test` | Portal |
| Resident (verified) | `ana@hiraman.test`, `ben@`, `carlo@`, `dina@`, `elena@`, `fidel@` | App |
| Resident waiting for verification | `gina@`, `hector@` (all `@hiraman.test`) | App |
| Resident, no ID sent yet | `isa@hiraman.test` | App |

## The short version of how it works

- A resident signs up, sends a photo of an ID, and LGU staff verify them in the portal. They get **3 starter credits**.
- **Borrowing costs 1 credit** (2 for valuable items, free for Barangay Shelf items). Credits are held when you ask and returned if the request is rejected or cancelled.
- The **lender earns 1 credit only after a good, on-time return**. A late return costs the borrower 1 credit.
- Three **risk tiers** decide who approves: low is automatic, medium needs the owner (and photos), high is handled by LGU staff at the barangay hall.
- Damaged or lost items go to **barangay mediation** and no reward is given until settled.
- **Impact is counted honestly**: "purchases avoided" counts only borrowers who answered "yes, I would have bought or rented it". Waste numbers are shown as a labeled estimate range.
