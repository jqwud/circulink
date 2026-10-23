# Releasing Hiraman

How to give residents a new version of the app, and update the server and portal, without losing anyone's data. Work through it top to bottom. Tick each box.

## 1. Decide once, before the first public release

- [ ] **The app's ID** (`applicationId` in `app/android/app/build.gradle.kts`, now `com.hiraman.hiraman`). Phones and the Play Store know the app by it, and **it can never change** after residents install it. Something like `ph.gov.<barangay>.hiraman` is typical.
- [ ] **Who keeps the release key** (step 2), and where its backup copy lives. Two people should know.
- [ ] **The server address** residents' phones will use. A release build has it built in, and residents cannot change it (the server address setting is hidden in release builds).
- [ ] **HTTPS.** The app can talk plain HTTP (needed for the laptop on Wi-Fi during development). For a real rollout, put the server behind HTTPS (for example a reverse proxy with a certificate), or anyone on the same Wi-Fi can read logins. This is roadmap item S1 and is not done yet.

## 2. The release key (once, by the team)

The key proves that an update comes from you. **If it is lost, the app can never be updated again**, only uninstalled and installed fresh. If it leaks, someone else could publish an "update". So:

1. Make it on the computer that builds releases (`keytool` comes with Android Studio's Java):
   ```
   keytool -genkey -v -keystore C:\keys\hiraman-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias hiraman
   ```
   Choose strong passwords and write them in your password manager, not in a file in the project.
2. Copy `hiraman-release.jks` to a second safe place (an encrypted USB stick kept at the barangay hall, for example).
3. Create `app/android/key.properties` (it is git-ignored, never commit it):
   ```
   storeFile=C:/keys/hiraman-release.jks
   storePassword=<the store password>
   keyAlias=hiraman
   keyPassword=<the key password>
   ```
   Keep the `.jks` file **outside** the project folder. `git status` must never show `key.properties` or a `.jks` file.

Without `key.properties`, `flutter build` still works but signs with the debug key: fine for testing, never for residents. `tools/build-release.mjs` refuses to build in that case.

## 3. Set the version

- [ ] App: `version:` in `app/pubspec.yaml`, for example `1.1.0+2`. The part after `+` (the build number) must go up by at least 1 every release, or phones refuse the update. Put the same text in `kAppVersion` in `app/lib/core/constants.dart` (a test checks they match). Residents see it at the bottom of the **Me** tab.
- [ ] Server and portal: `version` in `server/package.json` and `portal/package.json`. The server's version shows at `/api/health`.
- [ ] Add a section to `docs/CHANGELOG.md`: what changed, in plain words.

## 4. Check everything

- [ ] `cd server && npm run lint && npm test`
- [ ] `cd portal && npm run lint && npm run test:e2e` (browser journeys and accessibility)
- [ ] `cd app && flutter analyze && flutter test && node tools/e2e.mjs`
- [ ] `cd server && npm run test:load` (p95 under 300 ms)
- [ ] `npm audit` in `server` and `portal`: no high or critical problems.
- [ ] CI is green on GitHub for the commit you are releasing.

## 5. Build and try it on a real phone

```
cd app
node tools/build-release.mjs --server https://<your server>
```

(`--bundle` makes a `.aab` for the Play Store instead of an `.apk`.) Then, with the built app on a real phone (uninstall the debug app first, since the keys differ):

- [ ] It opens and finds the server; no server address button anywhere.
- [ ] Log in, browse, borrow a quick-borrow item and cancel it (the credit comes back).
- [ ] Me tab shows the right version; no component gallery.
- [ ] Switch to Filipino and back.
- [ ] Turn on airplane mode: a clear "No connection" message, no crash.

## 6. Update the server and portal

1. **Back up first:** `cd server && npm run backup` (or let step 2 do it: `npm run migrate` always backs up before changing the database).
2. Stop the API, update the code (`git pull`), `npm ci` in `server` and `portal`, `npm run build` in `portal`.
3. `cd server && npm run migrate`, then start the API. Check `/api/health` shows `"db": "ok"` and the new version.
4. Production settings in `server/.env` (never print or share this file):
   - [ ] `NODE_ENV=production` and a long random `JWT_SECRET` (the server refuses to start without one).
   - [ ] `CORS_ORIGIN` lists only your portal's address, not `*`.
   - [ ] `DPO_NAME`, `DPO_EMAIL`, `DPO_PHONE` filled in; the privacy notice text reviewed by a lawyer (RA 10173).
5. Log in to the portal and look at the dashboard.

## 7. Hand out the app

- [ ] Share the `.apk` only from a place the barangay controls (the hall, the official page), never through random chat forwards.
- [ ] Keep the previous `.apk` and the database backup until the new version has run for a week.

## If something goes wrong

- **App:** give residents the previous `.apk` back. It must have a *lower* build number, so they uninstall first (their account lives on the server, so they just log in again).
- **Server:** `npm run migrate:down` undoes the last database change; or restore the backup from step 6 (`docs/SETUP.md`, "Backups and restore"). Then check out the previous release and start it.
