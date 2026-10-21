# Hiraman setup guide (Windows)

You need three things running: the **database** (MySQL), the **server** (Node.js), and then the **portal** and the **app**. Do the steps in order.

## 1. Install what is missing

1. **Node.js 22 LTS or newer**: download from https://nodejs.org and install with the defaults. Open a new terminal and check `node -v`.
2. **MySQL 8**: make sure it is running (Windows Services → MySQL80, or XAMPP's control panel). Check you can log in as root: `mysql -u root -p`.
3. **Flutter**: run `flutter doctor` and fix anything marked with a red X (usually Android licenses: `flutter doctor --android-licenses`).

## 2. Create the database and an app account

In a terminal, in the Hiraman folder, as MySQL root:

```
mysql -u root -p -e "source database/schema.sql"
```

This creates a database called `hiraman` with all the tables. **Warning:** it deletes an existing `hiraman` database first.

Then give the app its own MySQL account, so the server never needs your root password. Replace `choose-a-password`:

```
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'hiraman'@'localhost' IDENTIFIED BY 'choose-a-password'; CREATE USER IF NOT EXISTS 'hiraman'@'127.0.0.1' IDENTIFIED BY 'choose-a-password'; GRANT ALL PRIVILEGES ON hiraman.* TO 'hiraman'@'localhost'; GRANT ALL PRIVILEGES ON hiraman.* TO 'hiraman'@'127.0.0.1'; FLUSH PRIVILEGES;"
```

## 3. Start the server

```
cd server
copy .env.example .env
```

Open `server/.env` and set:
- `DB_PORT` to your MySQL port (usually 3306; XAMPP sometimes uses 3307).
- `DB_USER=hiraman` and `DB_PASSWORD` to the password you chose.
- `JWT_SECRET` to any long random text.

Then:

```
npm install
npm run seed
npm start
```

`npm run seed` fills the database with a demo barangay (residents, items, a few requests). Run it again any time to reset the demo. When you see "Hiraman API running on http://localhost:4000", the server is up. Leave this terminal open.

Quick check: open http://localhost:4000/api/health in a browser. You should see `{"ok":true,...}`.

## 4. The LGU web portal

```
cd portal
npm install
npm run build
```

Now open **http://localhost:4000** and log in as `admin@hiraman.test` / `hiraman123`. The server shows the built portal at the same address.

To edit the portal and see changes instantly, run `npm run dev` instead and open http://localhost:5173.

## 5. The resident app

The Android project is already in the repository, so there is nothing to generate.

### On your Android phone (easiest: USB cable)

1. On the phone: Settings → About phone → tap *Build number* 7 times → Developer options → turn on **USB debugging**.
2. Plug the phone in, unlock it, and tap **Allow** on "Allow USB debugging?".
3. Double-click **`app\run-phone.cmd`**. It starts the server if needed, connects the phone to it through the cable, then installs and opens the app.
4. Log in as `ana@hiraman.test` / `hiraman123`.

The app finds the server by itself. The login screen shows **"Connected to …"** or **"Cannot reach the server"** with a **Find server** button.

### Without the cable

The phone must reach the laptop over a network:
- **Laptop hotspot (most reliable):** turn on Mobile hotspot on the laptop, connect the phone to it, and allow the server through the firewall once (Administrator PowerShell):
  ```
  New-NetFirewallRule -DisplayName "Hiraman API 4000 (hotspot)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Public -LocalAddress 192.168.137.1
  ```
- **Home Wi-Fi:** works only if the router lets devices see each other, and the Wi-Fi is set to Private in Windows.

Install the app with the cable once (`run-phone.cmd`); after that it looks for the server on the laptop's addresses by itself.

### In Chrome or on the emulator

- Chrome: `cd app` then `flutter run -d chrome`. It uses `http://localhost:4000`.
- Android emulator: `flutter run`. It uses `http://10.0.2.2:4000`.

### Build an installable APK (optional)

```
cd app
flutter build apk --release
```

The file is `build/app/outputs/flutter-apk/app-release.apk`. Release builds are currently signed with the debug key, which is fine for testing but not for publishing.

## If something goes wrong

| Problem | Fix |
|---|---|
| `Access denied for user` when starting the server | Wrong `DB_USER` / `DB_PASSWORD` in `server/.env`. |
| `ECONNREFUSED ...:3307` (or another port) | Nothing is listening on that port. Fix `DB_PORT` in `server/.env`. |
| `Unknown database 'hiraman'` | Step 2 was skipped. Import `database/schema.sql`. |
| App says it cannot reach the server | Tap **Find server**. Still failing: is the cable plugged in, or is the phone on the laptop's hotspot? Is the server window open? |
| Photos do not upload | Use JPG, PNG or WEBP under 5 MB. |
| Portal shows a blank page | Run `npm run build` in `portal/` (or use `npm run dev`). |
| Want to start the demo over | `cd server` then `npm run seed`. |

## Running the automated tests

The server tests use their own database, **`hiraman_test`**, and a temporary upload folder. They never touch your `hiraman` database or your uploaded photos. They refuse to run against any database whose name does not end in `_test`.

Once, as MySQL root, create the test database:

```
mysql -u root -p -e "source database/create-test-db.sql"
```

Then, any time:

```
cd server
npm test            # rule unit tests + the full borrow-loop test (rebuilds hiraman_test each run)
npm run test:unit   # only the fast rule tests, no database needed
```

The app has its own checks:

```
cd app
flutter analyze
flutter test
```

See `docs/QA_PLAN.md` for what is tested and what is planned.
