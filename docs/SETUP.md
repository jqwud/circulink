# CircuLink setup guide (Windows)

You need three things running: the **database** (MySQL), the **server** (Node.js), and then the **portal** and the **app**. Do the steps in order.

## 1. Install what is missing

1. **Node.js 22 LTS or newer**: download it from https://nodejs.org and install with the defaults. Open a new terminal and check `node -v`.
2. **MySQL 8**: make sure it is running (Windows Services → MySQL80, or the XAMPP control panel). Check that you can log in as root: `mysql -u root -p`.
3. **Flutter**: run `flutter doctor` and fix anything marked with a red X (usually the Android licenses: `flutter doctor --android-licenses`).

## 2. Create the app account and the databases

In the project folder, as MySQL root, replace `your-password` with a password of your own for the app account:

```
mysql -u root -p --init-command="SET @pw = 'your-password'" -e "source database/create-test-db.sql"
mysql -u root -p -e "source database/schema.sql"
```

Never write the password into `create-test-db.sql` itself: the file is public on GitHub.

The first command creates the MySQL account `circulink` and the databases `circulink` and `circulink_test`. The second creates the platform tables in `circulink`. **Warning:** `schema.sql` deletes an existing `circulink` database first, so use it only for a new install. Later changes come as migrations (step 3).

## 3. Start the server

```
cd server
copy .env.example .env
```

Open `server/.env` and set:
- `DB_PORT` to your MySQL port (usually 3306; XAMPP sometimes uses 3307).
- `DB_USER=circulink` and `DB_PASSWORD` to the password you chose.
- `JWT_SECRET` to any long random text.

Then:

```
npm install
npm run migrate
npm run seed:demo
npm start
```

`npm run migrate` applies the files in `database/migrations`, including the hub tables. It takes a backup first and does nothing when there is nothing new. `npm run seed:demo` loads the demo data: an admin, hub staff, partner organizations, residents, two hubs and two recyclers, with six months of drop-offs so the reports and badges have something to show. `npm run seed` loads the same accounts with no drop-offs. Run either again any time to reset the demo. When you see "CircuLink API running on http://localhost:4000", the server is up. Leave this terminal open.

Quick check: open http://localhost:4000/api/health in a browser. You should see `{"ok":true,"app":"CircuLink API",...}`.

## 4. The web portal

```
cd portal
npm install
npm run build
```

Now open **http://localhost:4000** and log in as `admin@circulink.test`, `staff@circulink.test` or `partner@circulink.test`. The password is `circulink123`.

**A real install has no demo data.** Create its first admin account instead (in `server/`):

```
npm run create-admin -- "Full Name" email@example.com
```

It prints a temporary password once. When you log in with it, the portal asks you to choose your own password.

To edit the portal and see changes instantly, run `npm run dev` instead and open http://localhost:5173.

## 5. The resident app

### On your Android phone (easiest: USB cable)

1. On the phone: Settings → About phone → tap *Build number* 7 times → Developer options → turn on **USB debugging**.
2. Plug the phone in, unlock it, and tap **Allow** on "Allow USB debugging?".
3. Double-click **`app\run-phone.cmd`**. It starts the server if needed, connects the phone to it through the cable, then installs and opens the app.
4. Log in as `ana@circulink.test` / `circulink123`.

The app finds the server by itself. The login screen shows **"Connected to …"**, or **"Cannot reach the server"** with a **Find server** button.

The Android app ID is `com.circulink.app`.

### Without the cable

The phone must reach the laptop over a network:
- **Laptop hotspot (most reliable):** turn on Mobile hotspot on the laptop, connect the phone to it, and allow the server through the firewall once (Administrator PowerShell):
  ```
  New-NetFirewallRule -DisplayName "CircuLink API 4000 (hotspot)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Public -LocalAddress 192.168.137.1
  ```
- **Home Wi-Fi:** works only if the router lets devices see each other and the Wi-Fi is set to Private in Windows.

### In Chrome or on the emulator

- Chrome: `cd app` then `flutter run -d chrome`. It uses `http://localhost:4000`.
- Android emulator: `flutter run`. It uses `http://10.0.2.2:4000`.

### Build an installable APK (optional)

```
cd app
flutter build apk --release
```

The file is `build/app/outputs/flutter-apk/app-release.apk`. Without a release key it is signed with the debug key, which is fine for testing. For a public build, follow `docs/RELEASE.md`.

## If something goes wrong

| Problem | Fix |
|---|---|
| `Access denied for user` when starting the server | Wrong `DB_USER` / `DB_PASSWORD` in `server/.env`. |
| `ECONNREFUSED ...:3307` (or another port) | Nothing is listening on that port. Fix `DB_PORT` in `server/.env`. |
| `Unknown database 'circulink'` | Step 2 was skipped. |
| `Table 'circulink.hubs' doesn't exist` | Run `npm run migrate` in `server/`. |
| App says it cannot reach the server | Tap **Find server**. If it still fails, check that the cable is plugged in or the phone is on the laptop's hotspot, and that the server window is open. |
| Portal shows a blank page | Run `npm run build` in `portal/`, or use `npm run dev`. |
| Want to start the demo over | `cd server` then `npm run seed:demo` (or `npm run seed` for no drop-offs). |

## Backups and restore

```
cd server
npm run backup                                  # database + uploaded photos into server/backups/<name>-<time>/
npm run restore                                 # lists backups, newest first
npm run restore -- <backup folder> --yes       # replaces the database and photos (takes a safety backup first)
npm run migrate:status                          # which database changes are applied
npm run migrate:down                            # undoes the most recent change (takes a backup first)
```

Backups contain personal data (names, phone numbers). They stay on this computer, because `server/backups/` is ignored by git.

## Running the automated tests

The server tests use their own database, **`circulink_test`** (made in step 2), and a temporary upload folder. They refuse to run against any database whose name does not end in `_test`.

```
cd server
npm test            # every server test (rebuilds circulink_test each run)
npm run test:unit   # only the rule tests, no database needed

cd portal
npx playwright install chromium   # once; on Windows the installed Google Chrome is used instead
npm run test:e2e                   # portal journeys in a real browser + accessibility scan

cd app
flutter analyze
flutter test
node tools/e2e.mjs                 # the app's real screens against the real API
```

To use a test database with another name (it must end in `_test`), set `TEST_DB_NAME`, for example `TEST_DB_NAME=my_test npm test`.
