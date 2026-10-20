// Face edits drawn over the cut-out character, in char coordinates (1024 x 1024).
const sharp = require('sharp');
const { W0 } = require('./lib.cjs');
const B = '#3E280B';
const EYES = { L: { x: 429, y: 405 }, R: { x: 600, y: 405 } };

const px = (char, x, y) => { const i = (Math.round(y) * W0 + Math.round(x)) * 4; return [char[i], char[i + 1], char[i + 2]]; };
const avg = (arr) => arr.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0]).map((v) => Math.round(v / arr.length));
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// fur colour above and below one eye, so the patch blends in
function eyeFur(char, e) {
  const top = avg([-30, -10, 10, 30].map((dx) => px(char, e.x + dx, 357)));
  const bot = avg([-34, -12, 12, 34].map((dx) => px(char, e.x + dx, 450)));
  return { top: hex(top), bot: hex(bot) };
}

// Returns SVG markup (char coordinates) for the chosen expression.
function faceSvg(char, kind) {
  const defs = []; let body = '';
  const patchEye = (e, id) => {
    // the fur around his eyes is a steady orange; only the very top sits in the hat's shadow
    defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CB8C4A"/><stop offset=".3" stop-color="#E3A95A"/><stop offset="1" stop-color="#E2A758"/></linearGradient>`);
    return `<ellipse cx="${e.x}" cy="${e.y + 1}" rx="56" ry="45" fill="url(#${id})" filter="url(#soft)"/>`;
  };
  const arcUp = (e) => `<path d="M ${e.x - 42} ${e.y + 10} Q ${e.x} ${e.y - 26} ${e.x + 42} ${e.y + 10}" fill="none" stroke="${B}" stroke-width="10" stroke-linecap="round"/>`;
  const arcDown = (e) => `<path d="M ${e.x - 42} ${e.y - 8} Q ${e.x} ${e.y + 24} ${e.x + 42} ${e.y - 8}" fill="none" stroke="${B}" stroke-width="10" stroke-linecap="round"/><path d="M ${e.x - 34} ${e.y + 8} l -9 5 M ${e.x} ${e.y + 17} v 10 M ${e.x + 34} ${e.y + 8} l 9 5" stroke="${B}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  const cream = hex(avg([px(char, 470, 520), px(char, 560, 520), px(char, 515, 530)]));
  const mouthPatch = `<ellipse cx="515" cy="497" rx="66" ry="26" fill="${cream}" filter="url(#soft)"/>`;
  const openMouth = `<path d="M 470 489 Q 515 560 560 489 Z" fill="#7C2A1E" stroke="${B}" stroke-width="8" stroke-linejoin="round"/><path d="M 492 523 Q 515 506 538 523 Q 526 546 515 546 Q 504 546 492 523 Z" fill="#E8798B"/>`;
  const smallO = `<path d="M 497 492 Q 515 520 533 492" fill="none" stroke="${B}" stroke-width="8" stroke-linecap="round"/>`;
  const wavy = `<path d="M 474 502 Q 494 484 515 500 Q 536 484 556 502" fill="none" stroke="${B}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (kind) {
    case 'wink':
      body += patchEye(EYES.R, 'gR') + arcUp(EYES.R);
      break;
    case 'cheer':
      body += patchEye(EYES.L, 'gL') + patchEye(EYES.R, 'gR') + arcUp(EYES.L) + arcUp(EYES.R) + mouthPatch + openMouth;
      break;
    case 'sleepy':
      body += patchEye(EYES.L, 'gL') + patchEye(EYES.R, 'gR') + arcDown(EYES.L) + arcDown(EYES.R) + mouthPatch + smallO;
      break;
    case 'oops': {
      const brow = (x1, y1, x2, y2) => `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${B}" stroke-width="10" stroke-linecap="round"/>`;
      body += brow(388, 364, 452, 342) + brow(641, 364, 577, 342) + mouthPatch + wavy;
      break;
    }
    default: break;
  }
  return `<defs><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>${defs.join('')}</defs>${body}`;
}
module.exports = { faceSvg, EYES };
