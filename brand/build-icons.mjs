// Puts Pawsa where the app and the portal need him, and makes the icons from his round badge.
// Run:  node build-icons.mjs        (needs: npm install, for sharp)
// Source art lives in pawsa-art/. See pawsa-art/README.md for how the poses are made.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const art = path.join(here, 'pawsa-art');
const POSES = ['happy', 'hero', 'point', 'wink', 'oops', 'sleepy', 'cheer', 'head'];

// 1. Pose images for the app and the portal
for (const dir of [path.join(root, 'app', 'assets', 'pawsa'), path.join(root, 'portal', 'public', 'pawsa')]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const p of POSES) fs.copyFileSync(path.join(art, 'app', `pawsa-${p}.webp`), path.join(dir, `pawsa-${p}.webp`));
}

// 2. Icons: his round badge on a lime tile
const badge = path.join(art, 'pawsa-head.png');
async function icon(size, { bleed = false, rounded = true } = {}) {
  const head = Math.round(size * (bleed ? 0.66 : 0.86));
  const r = rounded && !bleed ? Math.round(size * 0.22) : 0;
  const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D9F99D"/><stop offset="1" stop-color="#A3E635"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/></svg>`);
  const face = await sharp(badge).resize(head, head, { kernel: 'lanczos3' }).png().toBuffer();
  const off = Math.round((size - head) / 2);
  return sharp(tile).composite([{ input: face, left: off, top: off }]).png().toBuffer();
}
const write = async (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); };

const res = path.join(root, 'app', 'android', 'app', 'src', 'main', 'res');
for (const [dpi, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  await write(path.join(res, `mipmap-${dpi}`, 'ic_launcher.png'), await icon(px));
}
const web = path.join(root, 'app', 'web');
await write(path.join(web, 'favicon.png'), await icon(64));
await write(path.join(web, 'icons', 'Icon-192.png'), await icon(192));
await write(path.join(web, 'icons', 'Icon-512.png'), await icon(512));
await write(path.join(web, 'icons', 'Icon-maskable-192.png'), await icon(192, { bleed: true }));
await write(path.join(web, 'icons', 'Icon-maskable-512.png'), await icon(512, { bleed: true }));
await write(path.join(root, 'app', 'assets', 'icon', 'icon.png'), await icon(1024));
await write(path.join(root, 'portal', 'public', 'favicon.png'), await icon(64));
console.log('Pawsa placed and icons built.');
