// Generates Pawsa mascot poses, app icon and design tokens.
// Run:  node build-brand.mjs   (needs: npm i sharp, only for the PNG icon)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- design tokens (shared by app and portal) ----------
export const tokens = {
  color: {
    primary: '#B8560A',      // deep orange: buttons, links (white text passes contrast)
    primarySoft: '#FDE7CF',  // light orange tint
    fur: '#F5A04A',          // Pawsa orange
    furDark: '#D9781E',
    cream: '#FFF8EE',        // app background
    card: '#FFFFFF',
    ink: '#22304A',          // main text
    muted: '#6B7690',
    leaf: '#1F7A50',         // reuse / success
    leafSoft: '#DDF3E8',
    warn: '#B7791F',
    warnSoft: '#FDF1D6',
    danger: '#C0392B',
    dangerSoft: '#FBE3E0',
    line: '#EADFCF',
  },
  radius: { sm: 8, md: 14, lg: 22 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  font: { family: "'Nunito', 'Segoe UI', system-ui, sans-serif" },
};

// ---------- Pawsa ----------
const C = {
  fur: tokens.color.fur, dark: tokens.color.furDark, cream: '#FFE8C7',
  ear: '#F7B7A3', line: '#6B3308', scarf: '#2E9E6B', scarfDark: '#1F7A50',
  nose: '#E8768A', eye: '#2B1B12', white: '#FFFFFF', bag: '#C98B4B', bagDark: '#9C6630',
};

function eyes(pose) {
  const L = 80, R = 120, Y = 82;
  switch (pose) {
    case 'wink':
      return `<ellipse cx="${L}" cy="${Y}" rx="7" ry="9" fill="${C.eye}"/><circle cx="${L + 2.5}" cy="${Y - 3}" r="2.6" fill="#fff"/>
        <path d="M ${R - 8} ${Y + 1} Q ${R} ${Y - 8} ${R + 8} ${Y + 1}" fill="none" stroke="${C.eye}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'sleepy':
      return `<path d="M ${L - 8} ${Y} Q ${L} ${Y + 8} ${L + 8} ${Y}" fill="none" stroke="${C.eye}" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M ${R - 8} ${Y} Q ${R} ${Y + 8} ${R + 8} ${Y}" fill="none" stroke="${C.eye}" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'cheer':
      return `<path d="M ${L - 8} ${Y + 4} Q ${L} ${Y - 9} ${L + 8} ${Y + 4}" fill="none" stroke="${C.eye}" stroke-width="3.8" stroke-linecap="round"/>
        <path d="M ${R - 8} ${Y + 4} Q ${R} ${Y - 9} ${R + 8} ${Y + 4}" fill="none" stroke="${C.eye}" stroke-width="3.8" stroke-linecap="round"/>`;
    case 'oops':
      return `<ellipse cx="${L}" cy="${Y}" rx="7" ry="9" fill="${C.eye}"/><circle cx="${L + 2.5}" cy="${Y - 3}" r="2.6" fill="#fff"/>
        <ellipse cx="${R}" cy="${Y}" rx="7" ry="9" fill="${C.eye}"/><circle cx="${R + 2.5}" cy="${Y - 3}" r="2.6" fill="#fff"/>
        <path d="M ${L - 10} ${Y - 11} L ${L + 8} ${Y - 17}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>
        <path d="M ${R + 10} ${Y - 11} L ${R - 8} ${Y - 17}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`;
    default: // happy
      return `<ellipse cx="${L}" cy="${Y}" rx="7" ry="9" fill="${C.eye}"/><circle cx="${L + 2.5}" cy="${Y - 3}" r="2.6" fill="#fff"/>
        <ellipse cx="${R}" cy="${Y}" rx="7" ry="9" fill="${C.eye}"/><circle cx="${R + 2.5}" cy="${Y - 3}" r="2.6" fill="#fff"/>`;
  }
}

function mouth(pose) {
  if (pose === 'cheer') {
    return `<path d="M 88 108 Q 100 128 112 108 Z" fill="#8E2D2D" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M 94 118 Q 100 123 106 118" fill="${C.nose}"/>`;
  }
  if (pose === 'oops') {
    return `<path d="M 91 116 Q 100 108 109 116" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (pose === 'sleepy') {
    return `<path d="M 94 111 Q 100 115 106 111" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>`;
  }
  return `<path d="M 100 104 L 100 109 M 100 109 Q 92 117 86 111 M 100 109 Q 108 117 114 111" fill="none" stroke="${C.line}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function extras(pose) {
  if (pose === 'oops') {
    return `<path d="M 150 52 Q 156 64 150 70 Q 144 64 150 52 Z" fill="#8FD3F4" stroke="#4BA3CF" stroke-width="2"/>`;
  }
  if (pose === 'sleepy') {
    return `<text x="150" y="40" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="22" fill="${tokens.color.muted}">z</text>
            <text x="164" y="26" font-family="Nunito, Arial, sans-serif" font-weight="800" font-size="16" fill="${tokens.color.muted}">z</text>`;
  }
  if (pose === 'cheer') {
    const star = (x, y, s) => `<path d="M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y} L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3} L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z" fill="#F7C948"/>`;
    return star(40, 30, 10) + star(168, 40, 8) + star(28, 66, 6);
  }
  return '';
}

export function pawsa(pose = 'happy', { head = false } = {}) {
  const body = head ? '' : `
  <!-- tail -->
  <path d="M 140 170 Q 186 168 178 128 Q 174 112 160 120" fill="none" stroke="${C.line}" stroke-width="16" stroke-linecap="round"/>
  <path d="M 140 170 Q 186 168 178 128 Q 174 112 160 120" fill="none" stroke="${C.fur}" stroke-width="10" stroke-linecap="round"/>
  <!-- body -->
  <ellipse cx="100" cy="158" rx="44" ry="36" fill="${C.fur}" stroke="${C.line}" stroke-width="3"/>
  <ellipse cx="100" cy="166" rx="26" ry="24" fill="${C.cream}"/>
  <!-- tote bag -->
  <path d="M 78 150 Q 78 134 100 134 Q 122 134 122 150" fill="none" stroke="${C.bagDark}" stroke-width="4" stroke-linecap="round"/>
  <rect x="68" y="148" width="64" height="40" rx="9" fill="${C.bag}" stroke="${C.line}" stroke-width="3"/>
  <path d="M 68 160 H 132 M 68 172 H 132 M 84 148 V 188 M 100 148 V 188 M 116 148 V 188" stroke="${C.bagDark}" stroke-width="2" opacity=".55"/>
  <!-- leaf badge on bag -->
  <path d="M 100 156 Q 112 158 112 170 Q 100 170 100 156 Z" fill="${C.scarf}" stroke="${C.scarfDark}" stroke-width="2"/>
  <!-- paws -->
  <ellipse cx="72" cy="186" rx="13" ry="9" fill="${C.cream}" stroke="${C.line}" stroke-width="3"/>
  <ellipse cx="128" cy="186" rx="13" ry="9" fill="${C.cream}" stroke="${C.line}" stroke-width="3"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Pawsa the cat, Hiraman mascot">
  <title>Pawsa</title>${body}
  <!-- scarf -->
  <path d="M 62 118 Q 100 140 138 118 L 130 134 Q 100 152 70 134 Z" fill="${C.scarf}" stroke="${C.scarfDark}" stroke-width="3" stroke-linejoin="round"/>
  <!-- ears -->
  <path d="M 50 66 L 54 20 L 90 46 Z" fill="${C.fur}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M 150 66 L 146 20 L 110 46 Z" fill="${C.fur}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M 58 56 L 60 33 L 79 47 Z" fill="${C.ear}"/>
  <path d="M 142 56 L 140 33 L 121 47 Z" fill="${C.ear}"/>
  <!-- head -->
  <ellipse cx="100" cy="86" rx="56" ry="46" fill="${C.fur}" stroke="${C.line}" stroke-width="3"/>
  <!-- stripes -->
  <path d="M 100 41 V 56 M 86 43 L 89 56 M 114 43 L 111 56" stroke="${C.dark}" stroke-width="4" stroke-linecap="round"/>
  <path d="M 46 82 H 58 M 48 94 H 59 M 154 82 H 142 M 152 94 H 141" stroke="${C.dark}" stroke-width="4" stroke-linecap="round"/>
  <!-- muzzle -->
  <ellipse cx="100" cy="106" rx="24" ry="17" fill="${C.cream}"/>
  <circle cx="68" cy="102" r="8" fill="#F28B82" opacity=".35"/>
  <circle cx="132" cy="102" r="8" fill="#F28B82" opacity=".35"/>
  ${eyes(pose)}
  <path d="M 94 98 Q 100 96 106 98 Q 104 104 100 105 Q 96 104 94 98 Z" fill="${C.nose}" stroke="${C.line}" stroke-width="1.5" stroke-linejoin="round"/>
  ${mouth(pose)}
  <!-- whiskers -->
  <path d="M 70 106 L 44 100 M 70 111 L 44 114 M 130 106 L 156 100 M 130 111 L 156 114" stroke="${C.line}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
  ${extras(pose)}
</svg>`;
}

const poses = ['happy', 'wink', 'oops', 'sleepy', 'cheer'];
const outDirs = [
  path.join(here), path.join(root, 'app', 'assets', 'pawsa'), path.join(root, 'portal', 'public', 'pawsa'),
];
for (const d of outDirs) fs.mkdirSync(d, { recursive: true });
for (const p of poses) {
  const svg = pawsa(p);
  for (const d of outDirs) fs.writeFileSync(path.join(d, `pawsa-${p}.svg`), svg);
}
// head-only logo mark
const head = pawsa('happy', { head: true }).replace('viewBox="0 0 200 200"', 'viewBox="30 10 140 130"');
for (const d of outDirs) fs.writeFileSync(path.join(d, 'pawsa-head.svg'), head);

// app icon (cream rounded square + Pawsa face)
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${tokens.color.primarySoft}"/>
  <g transform="translate(112 150) scale(4.4)">${pawsa('happy', { head: true }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
</svg>`;
fs.writeFileSync(path.join(here, 'icon.svg'), icon);
fs.mkdirSync(path.join(root, 'app', 'assets', 'icon'), { recursive: true });
fs.writeFileSync(path.join(root, 'app', 'assets', 'icon', 'icon.svg'), icon);
fs.writeFileSync(path.join(root, 'portal', 'public', 'favicon.svg'), head);

try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(icon)).resize(1024, 1024).png().toFile(path.join(root, 'app', 'assets', 'icon', 'icon.png'));
  await sharp(Buffer.from(icon)).resize(1024, 1024).png().toFile(path.join(here, 'icon.png'));
  console.log('icon.png written');
} catch (e) {
  console.log('sharp not installed, skipped PNG icon:', e.message);
}

fs.writeFileSync(path.join(here, 'tokens.json'), JSON.stringify(tokens, null, 2));
const css = `:root{\n${Object.entries(tokens.color).map(([k, v]) => `  --c-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v};`).join('\n')}\n  --r-sm:${tokens.radius.sm}px; --r-md:${tokens.radius.md}px; --r-lg:${tokens.radius.lg}px;\n  --font:${tokens.font.family};\n}\n`;
fs.writeFileSync(path.join(here, 'tokens.css'), css);
fs.mkdirSync(path.join(root, 'portal', 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'portal', 'src', 'tokens.css'), css);
console.log('brand built:', poses.join(', '));
