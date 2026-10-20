const sharp = require('sharp');
const W0 = 1024, H0 = 1024;
const BROWN = [62, 40, 11];
const isDark = (d, i) => d[i] < 125 && d[i + 1] < 85 && d[i + 2] < 65 && d[i + 3] > 200;

async function loadChar() {
  const { data } = await sharp('char.png').raw().toBuffer({ resolveWithObject: true });
  return Buffer.from(data);
}

// Splits the character into: base (without his left arm) and the arm piece (with a fresh outline on the cut side).
function splitArm(char) {
  const base = Buffer.from(char), piece = Buffer.alloc(char.length);
  // 1) where is the left edge of the vest outline on each row?
  const raw = [];
  for (let y = 546; y <= 772; y++) {
    let x = 382; while (x > 300 && !isDark(char, (y * W0 + x) * 4)) x--;
    let run = 0; while (x - run > 300 && isDark(char, (y * W0 + (x - run)) * 4)) run++;
    raw[y] = x - run + 1;
  }
  // 2) reject outliers with a median, then keep the true value only where it agrees
  const edge = [];
  for (let y = 546; y <= 772; y++) {
    const win = []; for (let k = -6; k <= 6; k++) { const v = raw[Math.min(772, Math.max(546, y + k))]; win.push(v); }
    win.sort((a, b) => a - b); const med = win[6];
    edge[y] = Math.abs(raw[y] - med) > 1 ? med : raw[y];
  }
  for (let y = 546; y <= 805; y++) {
    const xL = y <= 772 ? edge[y] : 349;
    for (let x = 200; x < xL; x++) {
      const i = (y * W0 + x) * 4;
      if (char[i + 3] === 0) continue;
      piece[i] = char[i]; piece[i + 1] = char[i + 1]; piece[i + 2] = char[i + 2]; piece[i + 3] = char[i + 3];
      base[i + 3] = 0;
    }
    if (y >= 556 && y <= 772) { // the arm's own outline along the cut edge
      for (let x = xL - 7; x < xL; x++) { const i = (y * W0 + x) * 4; if (piece[i + 3] > 0) { piece[i] = BROWN[0]; piece[i + 1] = BROWN[1]; piece[i + 2] = BROWN[2]; piece[i + 3] = 255; } }
    }
  }
  // repaint the vest edge as one smooth outline so the cut leaves no staircase
  const sm = [];
  for (let y = 546; y <= 772; y++) { let sum = 0, n = 0; for (let k = -8; k <= 8; k++) { const yy = Math.min(772, Math.max(546, y + k)); sum += edge[yy]; n++; } sm[y] = sum / n; }
  for (let y = 556; y <= 770; y++) {
    const x0 = Math.round(sm[y]);
    for (let x = x0; x < x0 + 9; x++) {
      const i = (y * W0 + x) * 4;
      base[i] = BROWN[0]; base[i + 1] = BROWN[1]; base[i + 2] = BROWN[2]; base[i + 3] = 255;
    }
  }
  return { base, piece, edge };
}

// Rotates the arm piece about the shoulder (px,py). theta is clockwise degrees; flip mirrors it first.
async function rotatePiece(piece, theta, px = 362, py = 585, R = 270, tuck = 0) {
  const crop = await sharp(piece, { raw: { width: W0, height: H0, channels: 4 } }).extract({ left: px - R, top: py - R, width: 2 * R, height: 2 * R }).png().toBuffer();
  const rotated = await sharp(crop).rotate(theta, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: rw, height: rh } = rotated.info;
  const a1 = Buffer.alloc(rw * rh); for (let i = 0; i < rw * rh; i++) a1[i] = rotated.data[i * 4 + 3];
  const g = async (buf, fn) => (await fn(sharp(buf, { raw: { width: rw, height: rh, channels: 1 } })).extractChannel(0).raw().toBuffer());
  const aBlur = await g(a1, (i) => i.blur(2.2));
  const aHard = await g(aBlur, (i) => i.threshold(150));
  const aSoft = await g(aHard, (i) => i.blur(0.9));
  const clean = Buffer.from(rotated.data);
  for (let i = 0; i < rw * rh; i++) clean[i * 4 + 3] = aSoft[i];
  const rot = { data: await sharp(clean, { raw: { width: rw, height: rh, channels: 4 } }).png().toBuffer(), info: rotated.info };
  // push the arm's root a little toward the body so it hides behind the vest
  const a0 = Math.atan2(202, -42) + (theta * Math.PI) / 180;
  const dx = -Math.cos(a0) * tuck, dy = -Math.sin(a0) * tuck;
  return { input: rot.data, left: Math.round(px - rot.info.width / 2 + dx), top: Math.round(py - rot.info.height / 2 + dy), w: rot.info.width, h: rot.info.height };
}

module.exports = { W0, H0, BROWN, loadChar, splitArm, rotatePiece };
