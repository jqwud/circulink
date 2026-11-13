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
    primary: '#4A6B2A',      // moss: buttons, selected states, the loop in the logo (6.1:1 with white)
    primarySoft: '#E4ECD5',  // pale moss tint
    mint: '#EEF2E2',         // light moss surface, impact cards
    onPrimary: '#FFFFFF',    // text and icons on green
    accent: '#3D5A22',       // links and small icons on light backgrounds
    sun: '#BF8B2E',          // SDG 12 gold: points, badges, the link in the logo
    sunSoft: '#F6EBD3',
    fur: '#BF8B2E',          // kept for older components: same as sun
    furDark: '#8F6620',
    cream: '#F6F2E8',        // oat/kraft page background
    card: '#FFFDF8',         // warm white raised surfaces
    surfaceMuted: '#EFEADD', // input fill, skeletons, quiet panels
    ink: '#23261B',          // all text
    muted: '#5C5F4E',        // secondary text
    mutedSoft: '#E6E2D5',
    leaf: '#2F6B3A',         // success
    leafSoft: '#E1EDD9',
    warn: '#7A5410',         // text-safe on warnSoft
    warnSoft: '#F8ECD2',
    danger: '#B42318',
    dangerSoft: '#FBE4DF',
    info: '#1F5F5B',
    infoSoft: '#DDEDEA',
    line: '#E3DDCF',         // hairlines and input borders
    lineStrong: '#CCC4B2',
  },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32 },
  // Soft shadows tinted with ink. card: resting cards, float: bars and sheets, modal: dialogs.
  shadow: {
    card: '0 1px 2px rgba(35,38,27,.05), 0 2px 8px rgba(35,38,27,.05)',
    float: '0 2px 6px rgba(35,38,27,.06), 0 8px 24px rgba(35,38,27,.08)',
    modal: '0 8px 16px rgba(35,38,27,.08), 0 20px 48px rgba(35,38,27,.14)',
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
