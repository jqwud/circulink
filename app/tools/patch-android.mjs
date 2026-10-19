// Run once after `flutter create`, from the app folder:   node tools/patch-android.mjs
// It makes the Android app allowed to use the internet and to talk to the local server (http, not https),
// and names the app "Hiraman".
import fs from 'node:fs';
import path from 'node:path';

const manifest = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) {
  console.error('Cannot find ' + manifest + '.\nRun "flutter create . --org com.hiraman --project-name hiraman --platforms android" in the app folder first.');
  process.exit(1);
}

let xml = fs.readFileSync(manifest, 'utf8');
let changed = false;

if (!xml.includes('android.permission.INTERNET')) {
  xml = xml.replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application');
  changed = true;
}
if (!xml.includes('usesCleartextTraffic')) {
  xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
  changed = true;
}
xml = xml.replace(/android:label="[^"]*"/, () => {
  changed = true;
  return 'android:label="Hiraman"';
});

if (changed) {
  fs.writeFileSync(manifest, xml);
  console.log('Done: internet permission, local server access and app name set.');
} else {
  console.log('Nothing to change. The manifest is already set up.');
}
