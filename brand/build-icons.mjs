// The CircuLink logo, drawn in code so every size stays sharp, and every icon the app and portal need.
// Run:  node build-icons.mjs        (needs: npm install, for sharp)
//
// The mark: two arrows chasing each other around a circle (the reuse loop), with a chain link in the middle
// (the "Link": items linked to a second life, givers linked to partner organizations).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { tokens } from './build-brand.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const C = tokens.color;

// The mark on a 120x120 grid. `loop` colors the arrows, `link` the chain link.
export function markSvg({ loop = C.primary, link = C.sun, size = 120, background = null, radius = 0, scale = 1 } = {}) {
  const pad = (120 - 120 * scale) / 2;
  const bg = background ? `<rect width="120" height="120" rx="${radius}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">${bg}
<g transform="translate(${pad} ${pad}) scale(${scale})">
  <g fill="none" stroke="${loop}" stroke-width="11" stroke-linecap="round">
    <path d="M20.5 45.6 A42 42 0 0 1 96.5 43.5"/>
    <path d="M99.5 74.4 A42 42 0 0 1 23.5 76.5"/>
  </g>
  <g fill="${loop}">
    <path d="M110.5 40.4 L102.6 58.6 L86.9 46.6 Z"/>
    <path d="M9.5 79.6 L17.4 61.4 L33.1 73.4 Z"/>
  </g>
  <g fill="none" stroke="${link}" stroke-width="7">
    <rect x="29" y="51" width="34" height="18" rx="9" transform="rotate(-35 46 60)"/>
    <rect x="57" y="51" width="34" height="18" rx="9" transform="rotate(-35 74 60)"/>
  </g>
</g></svg>`;
}

// The horizontal logo: mark plus the word "CircuLink" ("Circu" in ink, "Link" in the brand green).
export function logoSvg({ ink = C.ink, accent = C.primary } = {}) {
  const mark = markSvg({ size: 120 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">
<g>${mark}</g>
<text x="136" y="80" font-family="Nunito, 'Segoe UI', Arial, sans-serif" font-size="58" font-weight="800" letter-spacing="-1"><tspan fill="${ink}">Circu</tspan><tspan fill="${accent}">Link</tspan></text></svg>`;
}

const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();

// App icon: white loop and amber link on a green tile. Maskable icons keep the mark inside the safe zone.
const tile = (size, { bleed = false } = {}) => png(markSvg({
  loop: '#FFFFFF', link: C.sun, background: C.primary, radius: bleed ? 0 : 26, scale: bleed ? 0.62 : 0.8,
}), size);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // Source files
  write(path.join(here, 'logo-mark.svg'), markSvg());
  write(path.join(here, 'logo.svg'), logoSvg());
  write(path.join(here, 'icon.png'), await tile(1024));

  // Portal
  write(path.join(root, 'portal', 'public', 'logo-mark.svg'), markSvg());
  write(path.join(root, 'portal', 'public', 'logo.svg'), logoSvg());
  write(path.join(root, 'portal', 'public', 'favicon.png'), await tile(64));

  // App: the mark for screens, and the launcher icons
  write(path.join(root, 'app', 'assets', 'brand', 'logo-mark.png'), await png(markSvg(), 512));
  write(path.join(root, 'app', 'assets', 'icon', 'icon.png'), await tile(1024));
  const res = path.join(root, 'app', 'android', 'app', 'src', 'main', 'res');
  for (const [dpi, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    write(path.join(res, `mipmap-${dpi}`, 'ic_launcher.png'), await tile(px));
  }
  const web = path.join(root, 'app', 'web');
  write(path.join(web, 'favicon.png'), await tile(64));
  write(path.join(web, 'icons', 'Icon-192.png'), await tile(192));
  write(path.join(web, 'icons', 'Icon-512.png'), await tile(512));
  write(path.join(web, 'icons', 'Icon-maskable-192.png'), await tile(192, { bleed: true }));
  write(path.join(web, 'icons', 'Icon-maskable-512.png'), await tile(512, { bleed: true }));
  console.log('CircuLink logo and icons built.');
}
