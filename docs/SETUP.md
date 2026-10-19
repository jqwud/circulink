# Hiraman setup guide (Windows)

You need three things running: the **database** (MySQL), the **server** (Node.js), and then the **portal** and the **app**. Do the steps in order.

> The Flutter app code was written without a Flutter compiler available. The server, database and portal were run and tested. If `flutter run` shows an error on your first try, copy the message and send it over. Small fixes are expected and quick.

## 1. Install what is missing

1. **Node.js (LTS)**: download from https://nodejs.org and install with the defaults. Then open a new terminal and check: `node -v` (should show 18 or higher).
2. **MySQL**: you said it is installed. Make sure it is running (Windows Services, or XAMPP's control panel, press Start next to MySQL). Check you can log in: `mysql -u root -p`. If `mysql` is not found, use the MySQL command line client from the Start menu, or XAMPP's Shell.
3. **Flutter**: you said it is installed. Run `flutter doctor` and fix anything marked with a red X (usually Android licenses: `flutter doctor --android-licenses`). Since it has been a year, also run `flutter upgrade`.

## 2. Create the database

In a terminal, in the Hiraman folder:

```
mysql -u root -p < database/schema.sql
```

This creates a database called `hiraman` with all the tables. (If you use XAMPP, you can instead open phpMyAdmin, click Import, and choose `database/schema.sql`.)

## 3. Start the server

```
cd server
copy .env.example .env
```

Open `server/.env` in Notepad and set:
- `DB_USER` and `DB_PASSWORD` to your MySQL login (XAMPP: user `root`, empty password).
- `JWT_SECRET` to any long random text.

Then:

```
npm install
npm run seed
npm start
```

`npm run seed` fills the database with a demo barangay (residents, items, a few requests). You can run it again any time to reset the demo. When you see "Hiraman API ... 4000", the server is up. Leave this terminal open.

Quick check: open http://localhost:4000/api/health in a browser. You should see `{"ok":true,...}`.

## 4. The LGU web portal

```
cd portal
npm install
npm run build
```

Now open **http://localhost:4000** and log in as `admin@hiraman.test` / `hiraman123`. (The server shows the built portal at the same address.)

If you want to edit the portal and see changes instantly, run `npm run dev` instead and open http://localhost:5173.

## 5. The Android app

Do this once, from the `app` folder:

```
cd app
flutter create . --org com.hiraman --project-name hiraman --platforms android
node tools/patch-android.mjs
flutter pub get
```

- `flutter create .` makes the Android part of the project (it will not overwrite our code in `lib/`). If it creates a new `test/widget_test.dart`, keep ours.
- `patch-android.mjs` lets the app use the internet and talk to your local server, and names it "Hiraman".

### Run on your Android phone

1. On the phone: Settings > About phone > tap *Build number* 7 times > back to Settings > Developer options > turn on **USB debugging**. Plug the phone into the computer and allow the prompt.
2. The phone and the computer must be on the **same Wi-Fi**.
3. Find your computer's Wi-Fi address: run `ipconfig` and look for *IPv4 Address* (example `192.168.1.10`).
4. Allow the server through the Windows firewall: the first time Node starts, Windows asks. Tick **Private networks** and Allow. (If you missed it: Windows Security > Firewall > Allow an app > Node.js.)
5. Run: `flutter run`
6. In the app, on the login screen, tap the small plug icon (top left), type `http://192.168.1.10:4000` (use your own address), tap **Test connection**. It should say Connected. Tap Save.
7. Log in as `ana@hiraman.test` / `hiraman123`.

On the **Android emulator** you do not need to change anything: the default address `http://10.0.2.2:4000` already reaches your computer.

### Build an installable APK (optional)

```
flutter build apk --release
```

The file is in `build/app/outputs/flutter-apk/app-release.apk`. Send it to the phone and install it.

## If something goes wrong

| Problem | Fix |
|---|---|
| `Access denied for user` when starting the server | Wrong `DB_USER` / `DB_PASSWORD` in `server/.env`. |
| `Unknown database 'hiraman'` | Step 2 was skipped. Import `database/schema.sql`. |
| App says it cannot reach the server | Same Wi-Fi? Correct IP? Firewall allowed Node on Private networks? Test `http://YOUR-IP:4000/api/health` in the phone's browser. |
| Photos do not upload | Use JPG, PNG or WEBP under 5 MB. |
| `flutter pub get` complains about versions | Run `flutter upgrade`, then try again. |
| Portal shows a blank page | You need `npm run build` in `portal/` (or use `npm run dev`). |
| Want to start the demo over | `cd server` then `npm run seed`. |

## Running the automated server test

```
cd server
npm test
```

It walks through the whole loop (sign up, verify, borrow, return, credits, damaged items, monthly cap, overdue) and prints 21 passed steps. It resets the demo data each time, so run `npm run seed` afterwards if you want the demo data back.
