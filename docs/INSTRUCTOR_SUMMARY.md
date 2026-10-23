# Hiraman: one-page summary

**What it is.** A barangay sharing platform: residents borrow and lend everyday items through a Flutter app, and LGU staff verify residents and handle disputes in a web portal. Both use one Node.js API and a MySQL database. The aim is **SDG 12.5**: every loan is a purchase that did not have to happen.

**How we improved it.** After the first working prototype we reviewed the whole system as an architect, a UI/UX designer and a QA engineer. We mapped the project, found and ranked 47 issues, and agreed a roadmap of 16 small batches. Every batch followed the same rules:
- the tests for business rules came first;
- each batch is one commit, with a written way to undo it;
- every database change backed up first and shipped its own undo;
- every batch was reported with what was and was not verified.

## What changed

| Area | Before | After |
|---|---|---|
| **Fairness** | A borrower lost a credit if the owner confirmed a return late | The borrower checks in daily ("Still with me / I returned it / There's a problem"); lateness is judged by "I returned it" |
| **Disputes** | Closing a dispute moved no credits | Staff choose one of four outcomes; credits follow agreed numbers, never below 0 |
| **Stuck requests** | Requests could wait forever | Unanswered requests expire after 7 days, with credits refunded |
| **Arranging a handover** | "Message the owner", with no way to do it | Phone numbers after approval, plus a message thread on each request |
| **Privacy (RA 10173)** | No notice, consent or deletion; ID photos kept forever | Notice and consent, "My data", account deletion, ID photos deleted 7 days after the decision |
| **Account safety** | 30-day logins that could not be ended; no password reset | Real logout, password change, reset by staff at the hall, failed-login lockout, per-person limits |
| **Language** | Notifications always in English with raw dates | Written in Filipino or English with friendly dates |
| **Usability** | Booked dates were refused only after choosing them; few confirmations | Booked days greyed out; edit items and dates; confirm before removing; feedback after every action |
| **Accessibility** | Tap areas screen readers could not reach; text cut off at large sizes | Real buttons, labels, tested at 200% text; portal dialogs work by keyboard |
| **Engineering** | No migrations, backups, logs or automatic checks | Migrations with undo, backup and restore, scheduled jobs, request logs without personal data, lint, CI, containers |

## Evidence

- **170 automated API tests** on a separate test database (the real data is never touched).
- **15 app tests**, including layouts on a 320-pixel phone, with large text, and in both languages.
- **Lint is clean** in all three parts.
- **The demo database was migrated nine times.** Each time there was a backup first and a check that no rows changed.
- **Screens were checked in screenshots**, in English and Filipino.

## Honest limits

- **Not yet re-tested on a real phone** after these changes.
- **The automatic checks (CI) and the containers have not run yet.** They run on GitHub after the first push; Docker is not installed on the development laptop.
- **The privacy notice needs a legal review.** The barangay should also name its Data Protection Officer.
- **Agreed for later:** paging for long lists, an API description (OpenAPI), end-to-end and load tests, a release signing key, and hosting with HTTPS.

## Where to look

| Document | What it covers |
|---|---|
| `docs/ARCHITECTURE.md` | How it fits together |
| `docs/IMPROVEMENT_ROADMAP.md` | Every decision and batch, with proof and how to undo it |
| `docs/QA_PLAN.md` | How it is tested |
| `docs/DESIGN_SYSTEM.md` | How it looks |
| `docs/SETUP.md` and `docs/CONTAINERS.md` | How to run it |
| `docs/CHANGELOG.md` | What changed, batch by batch |
