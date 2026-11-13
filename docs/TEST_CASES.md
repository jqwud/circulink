# CircuLink test cases

One complete test case for the whole system: a new resident signs up, logs in, brings items to a hub, and the items go on to a partner organization and a recycler until the points are confirmed. At each step it also checks the security a well-known website would: screening what people type, never revealing who has an account, sessions that really end, and each person seeing only what is theirs.

Every row is automated in [`server/test/full-journey.test.js`](../server/test/full-journey.test.js) and runs over real HTTP against a real MySQL database.

```
cd server
node --test test/full-journey.test.js     # only this test case
npm test                                   # everything
```

Last run: 2026-11-13, 26 of 26 passed.

## Test data

| Who | Account | Role |
|---|---|---|
| Dina Villanueva (new) | `dina.v@example.com`, phone 0919 555 0101, student ID 2024-00789 | Resident, made by sign-up in TC-04 |
| Ana Dela Cruz | `ana@circulink.test` | Another resident |
| Maria Santos | `staff@circulink.test` | Staff at Campus Green Hub |
| Jose Ramos | `staff2@circulink.test` | Staff at the other hub |
| Lingap Shelter | `partner@circulink.test` | Approved partner |
| Bagong Pag-asa NGO | `partner2@circulink.test` | Partner waiting for approval |
| Admin | `admin@circulink.test` | Admin |

## 1. Sign-up screening

| ID | Step | Expected result | Result |
|---|---|---|---|
| TC-01 | Sign up without accepting the privacy notice; with a bad email; a bad or missing phone; a bad student ID; a one-letter name | Each is refused with its own message. No account is made | Pass |
| TC-02 | Sign up with a name that is a script tag, a web link, has digits and symbols, or is a database command. Then with real names: `María Niña Dela Peña`, `Juan D'Angelo Jr.`, `Anne-Marie Santos, RN` | The first four are refused. The real names are accepted | Pass |
| TC-03 | Sign up with a password that is too short; common (`password123`, `Qwerty123`, `12345678`); one repeated letter; or the same as your own email name, phone or name | All refused: "That password is too easy to guess" | Pass |
| TC-04 | Sign up with good details, and also send `role: admin` and `points: 9999` | Account made as a **resident** with no points. The answer has no password or internal fields. The database holds only a bcrypt hash | Pass |
| TC-05 | Sign up again with the same email in capitals, the same phone written as +63, the same student ID | All refused with the **same** message, so sign-up can't be used to find out who is a member | Pass |

## 2. Logging in and sessions

| ID | Step | Expected result | Result |
|---|---|---|---|
| TC-06 | Log in with a wrong password; then with an email nobody has | Exactly the same answer for both | Pass |
| TC-07 | Log in with text meant to break the database (`' OR '1'='1`, `'; DROP TABLE users; --`) | Just "Wrong email or password". The data is untouched | Pass |
| TC-08 | Call the API with no token, nonsense, a token signed with a guessed secret, an unsigned token claiming to be admin, a changed token | All refused (401) | Pass |
| TC-09 | Log in, read the profile, log out, use the old token again | Login works. After logout **every** earlier token of the account is dead | Pass |
| TC-10 | Change the password: with a wrong current password; to a common one; to your own name; then properly | The first three are refused. After the change the other device is logged out and the old password no longer works | Pass |
| TC-11 | Change the profile: a name with markup; then a good name while also sending `role: admin` and a new student ID | Markup refused. The name changes; the role and the student ID do not | Pass |
| TC-12 | A resident opens admin, staff and partner addresses; staff and a partner open admin addresses; staff try to declare items | All refused (403) | Pass |

## 3. The main process

| ID | Step | Expected result | Result |
|---|---|---|---|
| TC-13 | Dina declares 2 jackets, an old phone and a toy for Campus Green Hub. The toy's description is an image tag with a script | She gets a 6-character code. The description is kept as plain text. She has 0 points: declaring earns nothing (R1) | Pass |
| TC-14 | Ana tries to open, cancel or list Dina's drop-off | "Not found". The code never appears | Pass |
| TC-15 | The code is tried by Dina herself, by staff of the other hub, with a wrong code, then by the right staff (typed in lower case), then again | Only the right staff succeed, once. Then "code already used" (R3, R4, R9) | Pass |
| TC-16 | Sorting is tried by Dina (400 kg), by the other hub's staff, with a negative weight, with a made-up outcome. Then properly: jackets 2 kg reuse, phone 0.5 kg recycle, toy 1 kg reject. Then the jackets again at 50 kg | Only the proper sorting works: 20, 3 and 0 points. An item is sorted once. Impact: 2.5 kg kept, 23 points **pending**, 0 confirmed (R1, R5) | Pass |
| TC-17 | Stock is opened by the partner waiting for approval, then by the approved partner. Dina tries to ask for the jackets. The approved partner asks for them | Only the approved partner sees stock, with no giver's name, and can ask (R2) | Pass |
| TC-18 | Hand-over is tried by the other hub's staff and by the partner itself, then done by the right staff. The partner confirms pickup | Only the right staff can. The jackets' points become confirmed. The phone's stay pending (R6) | Pass |
| TC-19 | Staff put the phone in a batch for the junk shop, then for the accredited recycler, and send it | Junk shop refused. Accredited recycler accepted (R10) | Pass |
| TC-20 | Dina looks at her drop-off and impact | Items: released, recycled, rejected. 23 points confirmed, 0 pending, badge Seed. She has a notification | Pass |
| TC-21 | Dina and the admin try to add or transfer points directly, and Dina sends `points: 500` with a profile change | No such address exists, even for the admin. Her points are still 23 (R12) | Pass |

## 4. Oversight and privacy

| ID | Step | Expected result | Result |
|---|---|---|---|
| TC-22 | The admin opens this month's report | 2.5 kg kept in use, 1 kg rejected, 1 item given to a partner. No names anywhere | Pass |
| TC-23 | The admin reads the audit log, then tries to add to it, change it or delete from it | Sign-up, password change, declaration, check-in and sorting are all there. It can't be changed | Pass |
| TC-24 | Dina downloads her own data | Her profile and 3 items. Nothing of anyone else's, and no password | Pass |
| TC-25 | The admin suspends Dina, then reinstates her | Suspended: her token stops working at once and login says "suspended". Reinstated: she can log in | Pass |
| TC-26 | Five wrong passwords for Dina, then the right one | The account is locked for 15 minutes, even for the right password (R13) | Pass |

## How this compares with well-known websites

| What large sites do | CircuLink |
|---|---|
| Check every field on the server, not only in the app | TC-01, TC-02 |
| Refuse common passwords and passwords made of your own details | TC-03, TC-10 |
| Store passwords only as a slow one-way hash | TC-04 (bcrypt) |
| Never say whether an email is registered | TC-05, TC-06. Login also takes the same time for an unknown email |
| Lock an account after repeated wrong passwords | TC-26, plus a limit per network |
| Log out everywhere on logout or password change | TC-09, TC-10 |
| Let nobody choose their own role or see another person's data | TC-04, TC-11, TC-12, TC-14 |
| Let people download their data and ask for deletion | TC-24, and "Delete my account" in the app |
| Keep a record of every change | TC-23 |

## What is not covered

- **Proving the email or phone belongs to the person.** Large sites send a code by email or SMS. Both need a paid service, so CircuLink does not do it. One account per email, phone and student ID (TC-05) is the limit instead, and staff see the person face to face at the hub before any points exist.
- **HTTPS.** The test runs over plain HTTP on one computer. A public install needs HTTPS in front (see `CONTAINERS.md`).
- **Two-step login** for staff and admins.
- **The screens themselves.** This test case is at the API. The same flows on the real screens are in `portal/e2e/` (browser) and `app/test/e2e/` (app).
