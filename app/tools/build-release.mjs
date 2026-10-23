// Builds the app that residents install. Refuses to build one that would not work for them.
//   cd app && node tools/build-release.mjs --server https://hiraman.example.gov.ph
//   (add --bundle for a Play Store .aab instead of an .apk)
// Checks first: a server address is given (residents cannot change it in a release build), the release key
// is set up (android/key.properties, see docs/RELEASE.md), and the shown version matches pubspec.yaml.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const server = args[args.indexOf('--server') + 1];
const bundle = args.includes('--bundle');
const problems = [];

// Only the characters of a plain web address, since it goes into the build command.
if (!args.includes('--server') || !/^https?:\/\/[A-Za-z0-9.:[\]-]+(\/[A-Za-z0-9._~/-]*)?$/.test(server || '')) {
  problems.push('Give the server address residents will use, like --server https://hiraman.example.gov.ph');
} else if (server.startsWith('http://')) {
  console.warn(`Note: ${server} is plain HTTP. Logins can be read on shared Wi-Fi. Use HTTPS for a real rollout (docs/RELEASE.md).`);
}
const keyFile = path.join(appDir, 'android', 'key.properties');
if (!fs.existsSync(keyFile)) {
  problems.push('No android/key.properties: the build would be signed with the debug key. Make the release key first (docs/RELEASE.md, step 2).');
} else {
  const storeFile = /^storeFile=(.+)$/m.exec(fs.readFileSync(keyFile, 'utf8'))?.[1]?.trim();
  if (!storeFile || !fs.existsSync(path.resolve(appDir, 'android', 'app', storeFile))) problems.push(`android/key.properties points to a key file that does not exist (${storeFile || 'storeFile missing'}).`);
}
const pubspec = /^version:\s*(\S+)/m.exec(fs.readFileSync(path.join(appDir, 'pubspec.yaml'), 'utf8'))?.[1];
const shown = /kAppVersion = '([^']+)'/.exec(fs.readFileSync(path.join(appDir, 'lib', 'core', 'constants.dart'), 'utf8'))?.[1];
if (pubspec !== shown) problems.push(`pubspec.yaml says ${pubspec} but lib/core/constants.dart (kAppVersion) says ${shown}. Make them the same.`);

if (problems.length) {
  console.error('Not building:\n- ' + problems.join('\n- '));
  process.exit(1);
}

console.log(`Building Hiraman ${pubspec} for ${server} ...`);
// Fixed words plus a checked address, through the shell so Windows finds flutter.bat.
const cmd = `flutter build ${bundle ? 'appbundle' : 'apk'} --release --dart-define=HIRAMAN_SERVER=${server}`;
const run = spawnSync(cmd, { cwd: appDir, stdio: 'inherit', shell: true });
if (run.status === 0) {
  console.log(`\nDone: build/app/outputs/${bundle ? 'bundle/release/app-release.aab' : 'flutter-apk/app-release.apk'}`);
  console.log('Next: the checks in docs/RELEASE.md, step 5, on a real phone.');
}
process.exit(run.status ?? 1);
