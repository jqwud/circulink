// Builds every Pawsa pose from the one approved illustration (char.png).
const sharp = require('sharp');
const fs = require('node:fs');
const { loadChar, splitArm, rotatePiece, W0, H0 } = require('./lib.cjs');
const { faceSvg } = require('./face.cjs');

const CW = 1700, CH = 1420, OX = 338, OY = 200; // canvas; the character's 1024 frame sits at (OX, OY)
const CX = OX + 512;                              // body centre line
const B = '#3E280B';
const WIN = { left: CX - 620, top: OY - 70, size: 1240 }; // the same window for every pose, so poses swap without jumping

const rawPng = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
const svgDoc = (inner, w = CW, h = CH) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`);
const svgPng = (inner, w = CW, h = CH) => sharp(svgDoc(inner, w, h)).png().toBuffer();
const blank = (w = CW, h = CH) => ({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const over = async (base, layers, w = CW, h = CH) => sharp(typeof base === 'object' && base.create ? base : base).composite(layers).png().toBuffer();
const gray = async (buf, w, h, fn) => {
  const r = await fn(sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: 1 } })).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return r.data;
};

// ---------- decorations (not given a white outline) ----------
const sparkle = (x, y, s, fill = '#FACC15') => `<path d="M ${x} ${y - s} Q ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="${fill}" stroke="${B}" stroke-width="${Math.max(4, s * 0.12)}" stroke-linejoin="round"/>`;
const zed = (x, y, s) => `<path d="M ${x} ${y} h ${s} l ${-s} ${s * 1.1} h ${s}" fill="none" stroke="${B}" stroke-width="${s * 0.42}" stroke-linecap="round" stroke-linejoin="round"/><path d="M ${x} ${y} h ${s} l ${-s} ${s * 1.1} h ${s}" fill="none" stroke="#B6F03A" stroke-width="${s * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
const drop = (x, y, s) => `<path d="M ${x} ${y - s} C ${x + s * 0.9} ${y - s * 0.1} ${x + s * 0.8} ${y + s * 0.9} ${x} ${y + s * 0.9} C ${x - s * 0.8} ${y + s * 0.9} ${x - s * 0.9} ${y - s * 0.1} ${x} ${y - s} Z" fill="#9AD7F5" stroke="${B}" stroke-width="7" stroke-linejoin="round"/><path d="M ${x - s * 0.28} ${y + s * 0.1} Q ${x - s * 0.3} ${y + s * 0.5} ${x - s * 0.05} ${y + s * 0.6}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`;

// ---------- aura: soft sun glow and lime wisps ----------
function auraSvg(cx, cy, scale = 1) {
  let wisps = '';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const ang = (i * 360) / n + (i % 2 ? 6 : -4);
    const len = (i % 3 === 0 ? 300 : i % 3 === 1 ? 230 : 180) * scale;
    const r = (400 + (i % 2) * 30) * scale;
    const wd = (i % 3 === 0 ? 54 : 42) * scale;
    wisps += `<g transform="translate(${cx} ${cy}) rotate(${ang}) translate(0 ${-r})">
      <path d="M 0 0 C ${wd} ${-len * 0.25} ${wd * 0.8} ${-len * 0.7} ${wd * 0.1} ${-len} C ${-wd * 0.1} ${-len * 0.62} ${-wd * 1.0} ${-len * 0.3} 0 0 Z" fill="url(#wisp)" opacity="${i % 2 ? 0.8 : 0.95}"/>
      <path d="M 0 -6 C ${wd * 0.35} ${-len * 0.25} ${wd * 0.3} ${-len * 0.6} ${wd * 0.06} ${-len * 0.82} C ${-wd * 0.05} ${-len * 0.55} ${-wd * 0.4} ${-len * 0.3} 0 -6 Z" fill="#FFF7B0" opacity=".7"/></g>`;
  }
  return `<defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFF4A3" stop-opacity=".95"/><stop offset=".5" stop-color="#FFE45E" stop-opacity=".5"/><stop offset="1" stop-color="#FFE45E" stop-opacity="0"/></radialGradient>
    <linearGradient id="wisp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9BE82F"/><stop offset=".6" stop-color="#C4F54D"/><stop offset="1" stop-color="#F4F27A"/></linearGradient>
    <filter id="wb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>
  <circle cx="${cx}" cy="${cy}" r="${560 * scale}" fill="url(#glow)"/><g filter="url(#wb)">${wisps}</g>`;
}

// ---------- props (they get the white sticker outline) ----------
function formCardSvg(cx, cy, rot = -5, k = 1) {
  const w = 270, h = 350, x = -w / 2, y = -h / 2;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${k})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="#fff" stroke="${B}" stroke-width="8"/>
    <path d="M ${x + 4} ${y + 76} V ${y + 34} Q ${x + 4} ${y + 4} ${x + 34} ${y + 4} H ${x + w - 34} Q ${x + w - 4} ${y + 4} ${x + w - 4} ${y + 34} V ${y + 76} Z" fill="#B6F03A"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="none" stroke="${B}" stroke-width="8"/>
    <path d="M ${x + 4} ${y + 76} H ${x + w - 4}" stroke="${B}" stroke-width="6"/>
    <circle cx="${x + 36}" cy="${y + 40}" r="9" fill="#FACC15" stroke="${B}" stroke-width="4"/><rect x="${x + 58}" y="${y + 32}" width="90" height="16" rx="8" fill="${B}" opacity=".78"/>
    <rect x="${x + 28}" y="${y + 108}" width="${w - 56}" height="46" rx="14" fill="#F1F8DA" stroke="${B}" stroke-width="5"/>
    <rect x="${x + 28}" y="${y + 176}" width="${w - 56}" height="46" rx="14" fill="#F1F8DA" stroke="${B}" stroke-width="5"/>
    <path d="M ${x + 46} ${y + 132} h 70 M ${x + 46} ${y + 200} h 110" stroke="#9AA58A" stroke-width="7" stroke-linecap="round"/>
    <rect x="${x + 28}" y="${y + 262}" width="${w - 56}" height="58" rx="18" fill="#A3E635" stroke="${B}" stroke-width="6"/>
    <path d="M ${x + w / 2 - 22} ${y + 292} l 14 14 l 30 -30" fill="none" stroke="${B}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
function basketSvg(cx, cy) {
  const weave = [0, 1, 2].map((k) => `<path d="M ${cx - 112 + k * 5} ${cy + 8 + k * 30} Q ${cx} ${cy + 34 + k * 30} ${cx + 112 - k * 5} ${cy + 8 + k * 30}" fill="none" stroke="#B5832F" stroke-width="5" opacity=".75"/>`).join('')
    + [-70, -25, 25, 70].map((dx) => `<path d="M ${cx + dx * 1.12} ${cy - 24} L ${cx + dx * 0.9} ${cy + 96}" stroke="#B5832F" stroke-width="5" opacity=".6"/>`).join('');
  return `
    <path d="M ${cx - 34} ${cy - 20} L ${cx - 64} ${cy - 150}" stroke="${B}" stroke-width="30" stroke-linecap="round"/><path d="M ${cx - 34} ${cy - 20} L ${cx - 64} ${cy - 150}" stroke="#CB8F4C" stroke-width="17" stroke-linecap="round"/>
    <rect x="${cx - 112}" y="${cy - 188}" width="92" height="44" rx="12" transform="rotate(-18 ${cx - 66} ${cy - 166})" fill="#AEB8C2" stroke="${B}" stroke-width="7"/>
    <path d="M ${cx + 18} ${cy - 10} L ${cx + 44} ${cy - 150} L ${cx + 132} ${cy - 128} L ${cx + 108} ${cy - 6} Z" fill="#CFF77C" stroke="${B}" stroke-width="7" stroke-linejoin="round"/><path d="M ${cx + 44} ${cy - 150} L ${cx + 108} ${cy - 134}" stroke="${B}" stroke-width="5"/><path d="M ${cx + 56} ${cy - 108} L ${cx + 112} ${cy - 96} M ${cx + 52} ${cy - 84} L ${cx + 100} ${cy - 74}" stroke="#7AA21A" stroke-width="6" stroke-linecap="round"/>
    <path d="M ${cx - 128} ${cy - 22} Q ${cx} ${cy - 50} ${cx + 128} ${cy - 22} L ${cx + 104} ${cy + 100} Q ${cx} ${cy + 124} ${cx - 104} ${cy + 100} Z" fill="#E8BC72" stroke="${B}" stroke-width="8" stroke-linejoin="round"/>
    ${weave}
    <path d="M ${cx - 128} ${cy - 22} Q ${cx} ${cy - 50} ${cx + 128} ${cy - 22}" fill="none" stroke="#C99637" stroke-width="14" stroke-linecap="round"/>
    <path d="M ${cx - 124} ${cy - 22} Q ${cx} ${cy - 48} ${cx + 124} ${cy - 22}" fill="none" stroke="${B}" stroke-width="5" stroke-linecap="round" opacity=".6"/>
    <circle cx="${cx}" cy="${cy + 52}" r="20" fill="#FACC15" stroke="${B}" stroke-width="6"/><circle cx="${cx}" cy="${cy + 52}" r="7" fill="#FFFDF2"/>`;
}

// ---------- one pose ----------
async function renderPose(name, spec, char, parts) {
  const { base, piece } = parts;
  let baseRaw = spec.arm ? base : char;
  let basePng = await rawPng(baseRaw, W0, H0);
  if (spec.face) basePng = await over(basePng, [{ input: await svgPng(faceSvg(char, spec.face), W0, H0) }], W0, H0);
  const layers = [];
  if (spec.arm) {
    const a = await rotatePiece(piece, spec.arm.theta, 362, 585, 270, spec.arm.tuck ?? 14);
    layers.push({ input: a.input, left: a.left + OX, top: a.top + OY });
  }
  layers.push({ input: basePng, left: OX, top: OY });
  let group = await sharp(blank()).composite(layers).png().toBuffer();
  if (spec.mirror) group = await sharp(group).flop().png().toBuffer();
  if (spec.tilt) {
    const a = spec.tilt * Math.PI / 180, d = { x: 0, y: OY + 940 - CH / 2 };
    const rot = await sharp(group).rotate(spec.tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });
    const dx = d.y * Math.sin(a), dy = d.y * (1 - Math.cos(a));
    // the rotated image is a little bigger than the canvas: cut the canvas-sized middle out of it
    const ex = Math.max(0, Math.min(rot.info.width - CW, Math.round(rot.info.width / 2 - CW / 2 - dx)));
    const ey = Math.max(0, Math.min(rot.info.height - CH, Math.round(rot.info.height / 2 - CH / 2 - dy)));
    group = await sharp(rot.data).extract({ left: ex, top: ey, width: CW, height: CH }).png().toBuffer();
  }
  if (spec.lift) group = await sharp(blank()).composite([{ input: await sharp(group).extract({ left: 0, top: spec.lift, width: CW, height: CH - spec.lift }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const props = spec.props ? await svgPng(spec.props) : null;
  const content = props ? await sharp(group).composite([{ input: props }]).png().toBuffer() : group;

  // sticker ring + shadow from the silhouette of everything ringed
  const { data: cd } = await sharp(content).raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(CW * CH); for (let i = 0; i < CW * CH; i++) alpha[i] = cd[i * 4 + 3] > 128 ? 255 : 0;
  const bl = await gray(alpha, CW, CH, (i) => i.blur(11));
  const hard = await gray(bl, CW, CH, (i) => i.threshold(20));
  const ringA = await gray(hard, CW, CH, (i) => i.blur(1.3));
  const shA = await gray(ringA, CW, CH, (i) => i.blur(8));
  const white = Buffer.alloc(CW * CH * 4), shadow = Buffer.alloc(CW * CH * 4);
  for (let i = 0; i < CW * CH; i++) { white[i * 4] = white[i * 4 + 1] = white[i * 4 + 2] = 255; white[i * 4 + 3] = ringA[i]; shadow[i * 4] = 40; shadow[i * 4 + 1] = 30; shadow[i * 4 + 2] = 10; shadow[i * 4 + 3] = Math.round(shA[i] * 0.28); }
  const stack = [];
  if (spec.aura) stack.push({ input: await svgPng(auraSvg(CX, OY + 470, spec.auraScale || 1)) });
  stack.push({ input: await rawPng(shadow, CW, CH), top: 10, left: 0 }, { input: await rawPng(white, CW, CH) }, { input: content });
  if (spec.decor) stack.push({ input: await svgPng(spec.decor) });
  const full = await sharp(blank()).composite(stack).png().toBuffer();
  const win = await sharp(full).extract({ left: WIN.left, top: WIN.top, width: WIN.size, height: WIN.size }).png().toBuffer();
  return sharp(win).resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer();
}

async function renderHead(char) {
  const S = 760, cx = 515, cy = 385, PAD = 30;
  const crop = await sharp(char, { raw: { width: W0, height: H0, channels: 4 } }).extract({ left: cx - S / 2, top: cy - S / 2, width: S, height: S }).png().toBuffer();
  const T = S + PAD * 2;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#F2FCC8"/><stop offset="1" stop-color="#C6F25C"/></radialGradient></defs><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="url(#g)"/></svg>`);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}" fill="#fff"/></svg>`);
  const badge = await sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: bg }, { input: crop }, { input: mask, blend: 'dest-in' }]).png().toBuffer();
  const ring = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter></defs><circle cx="${T / 2}" cy="${T / 2 + 8}" r="${S / 2 + 20}" fill="#281E0A" opacity=".28" filter="url(#s)"/><circle cx="${T / 2}" cy="${T / 2}" r="${S / 2 + 16}" fill="#fff"/><circle cx="${T / 2}" cy="${T / 2}" r="${S / 2 + 1}" fill="none" stroke="#3E280B" stroke-width="7"/></svg>`);
  const out = await sharp({ create: { width: T, height: T, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: ring }, { input: badge, left: PAD, top: PAD }]).png().toBuffer();
  return sharp(out).resize(1024, 1024, { kernel: 'lanczos3' }).png().toBuffer();
}

(async () => {
  const char = await loadChar();
  const parts = splitArm(char);
  const O = (x, y) => [x + OX, y + OY];
  const star = (x, y, s, f) => sparkle(...O(x, y), s, f);
  const poses = {
    happy: {},
    hero: { arm: { theta: 62 }, aura: true, auraScale: 0.8, props: basketSvg(...O(165, 840)), decor: star(930, 250, 40) + star(985, 330, 22, '#B6F03A') + star(110, 330, 28) },
    point: { arm: { theta: 76 }, props: formCardSvg(...O(38, 585), -6, 0.76), decor: star(900, 230, 28) },
    wink: { arm: { theta: 128, tuck: 20 }, face: 'wink', decor: star(705, 335, 34) + star(750, 385, 18, '#B6F03A') },
    oops: { face: 'oops', tilt: 3, decor: drop(...O(775, 470), 38) },
    sleepy: { face: 'sleepy', tilt: -4, decor: zed(...O(830, 250), 46) + zed(...O(890, 165), 34) + zed(...O(935, 95), 24) },
    cheer: { arm: { theta: 128, tuck: 20 }, face: 'cheer', mirror: true, lift: 36, aura: true, auraScale: 0.8, decor: star(110, 300, 46) + star(960, 260, 38, '#B6F03A') + star(60, 520, 24) + star(985, 540, 26) },
  };
  const outDir = process.argv[2] || 'out';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/pawsa-head.png`, await renderHead(char));
  console.log('wrote head');
  const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(poses);
  for (const n of only) {
    const png = await renderPose(n, poses[n], char, parts);
    fs.writeFileSync(`${outDir}/pawsa-${n}.png`, png);
    console.log('wrote', n);
  }
})();
