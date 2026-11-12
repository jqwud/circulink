// Generates the design tokens shared by the app and the portal.
// Run:  node build-brand.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// ---------- design tokens (shared by app and portal) ----------
export const tokens = {
  color: {
    primary: '#0E7C66',      // CircuLink green: buttons, selected states, the loop in the logo (5.1:1 with white)
    primarySoft: '#D7F2EA',  // pale green tint
    mint: '#E6F6EF',         // light green surface, impact cards
    onPrimary: '#FFFFFF',    // text and icons on green
    accent: '#0B6B58',       // links and small icons on light backgrounds
    sun: '#F2B33D',          // amber: points, badges, the link in the logo
    sunSoft: '#FDF0D5',
    fur: '#F2B33D',          // kept for older components: same as sun
    furDark: '#C98A12',
    cream: '#F7FAF8',        // page background
    card: '#FFFFFF',         // raised surfaces
    surfaceMuted: '#EEF3F0', // input fill, skeletons, quiet panels
    ink: '#12261F',          // all text
    muted: '#4A5F57',        // secondary text
    mutedSoft: '#E3EBE7',
    leaf: '#166534',         // success
    leafSoft: '#DCFCE7',
    warn: '#7A5410',         // text-safe on warnSoft
    warnSoft: '#FDF1D6',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    info: '#1B4F9C',
    infoSoft: '#E3EFFF',
    line: '#DCE5E0',         // hairlines and input borders
    lineStrong: '#C3D0C9',
  },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32 },
  // Soft shadows tinted with ink. card: resting cards, float: bars and sheets, modal: dialogs.
  shadow: {
    card: '0 1px 2px rgba(18,38,31,.05), 0 2px 8px rgba(18,38,31,.05)',
    float: '0 2px 6px rgba(18,38,31,.06), 0 8px 24px rgba(18,38,31,.08)',
    modal: '0 8px 16px rgba(18,38,31,.08), 0 20px 48px rgba(18,38,31,.14)',
  },
  // size / weight / line height
  type: {
    display: [32, 800, 1.15], h1: [24, 800, 1.2], h2: [20, 700, 1.25], title: [17, 700, 1.3],
    body: [15, 400, 1.45], label: [13, 600, 1.35], caption: [12, 400, 1.35],
  },
  font: { family: "'Nunito', 'Segoe UI', system-ui, sans-serif" },
};

// The logo and icons are drawn in build-icons.mjs.

fs.writeFileSync(path.join(here, 'tokens.json'), JSON.stringify(tokens, null, 2));
const kebab = (k) => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const css = `:root{
${Object.entries(tokens.color).map(([k, v]) => `  --c-${kebab(k)}: ${v};`).join('\n')}
  ${Object.entries(tokens.radius).map(([k, v]) => `--r-${k}:${v}px;`).join(' ')}
  ${Object.entries(tokens.space).map(([k, v]) => `--s-${k}:${v}px;`).join(' ')}
${Object.entries(tokens.shadow).map(([k, v]) => `  --shadow-${k}: ${v};`).join('\n')}
  --font:${tokens.font.family};
}
`;
fs.writeFileSync(path.join(here, 'tokens.css'), css);
fs.mkdirSync(path.join(root, 'portal', 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'portal', 'src', 'tokens.css'), css);
console.log('tokens written');
