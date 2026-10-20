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
    primary: '#A3E635',      // lime: buttons, selected states, highlights (always with ink text)
    primarySoft: '#ECFCCB',  // pale lime tint
    mint: '#D9F99D',         // light green surface, credits card
    onPrimary: '#1F2A1F',    // text and icons on lime
    accent: '#4D7C0F',       // leaf green: links and small icons on light backgrounds (4.9:1)
    sun: '#FACC15',          // sun yellow: credits, rewards, the sun emblem
    sunSoft: '#FEF3C7',
    fur: '#F5A04A',          // Pawsa's orange (mascot only)
    furDark: '#DA7A1F',
    cream: '#FFFDF2',        // ivory page background
    card: '#FFFFFF',         // raised surfaces
    surfaceMuted: '#F6F4E4', // input fill, skeletons, quiet panels
    ink: '#1F2A1F',          // all text
    muted: '#4B5F52',        // secondary text (6.7:1 on ivory)
    mutedSoft: '#E9EADC',
    leaf: '#0F766E',         // success (teal, so it never fights the green brand)
    leafSoft: '#D5F3EE',
    warn: '#7A5410',         // text-safe on warnSoft
    warnSoft: '#FDF1D6',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    info: '#1B4F9C',
    infoSoft: '#E3EFFF',
    line: '#E8E2C8',         // hairlines and input borders
    lineStrong: '#D3CDB0',
  },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  space: { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32 },
  // Soft shadows tinted with ink. card: resting cards, float: bars and sheets, modal: dialogs.
  shadow: {
    card: '0 1px 2px rgba(31,42,31,.05), 0 2px 8px rgba(31,42,31,.05)',
    float: '0 2px 6px rgba(31,42,31,.06), 0 8px 24px rgba(31,42,31,.08)',
    modal: '0 8px 16px rgba(31,42,31,.08), 0 20px 48px rgba(31,42,31,.14)',
  },
  // size / weight / line height
  type: {
    display: [32, 800, 1.15], h1: [24, 800, 1.2], h2: [20, 700, 1.25], title: [17, 700, 1.3],
    body: [15, 400, 1.45], label: [13, 600, 1.35], caption: [12, 400, 1.35],
  },
  font: { family: "'Nunito', 'Segoe UI', system-ui, sans-serif" },
};

// Pawsa is no longer drawn here. The artwork lives in pawsa-art/ and build-icons.mjs places it in the app and the portal.

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
