// Turns the JPG (checkerboard baked in) into a clean transparent PNG with a fresh white sticker outline.
const sharp = require('sharp');
const SRC = require('node:path').join(__dirname, '..', 'source', 'pawsa-base.jpg');
(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const gray = async (buf, fn) => {
    let img = sharp(Buffer.from(buf), { raw: { width: w, height: h, channels: 1 } });
    img = fn(img);
    const r = await img.extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    if (r.info.channels !== 1 || r.data.length !== w * h) throw new Error('bad channels ' + r.info.channels);
    return r.data;
  };
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const neutral = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = px(i);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    neutral[i] = mx - mn < 16 && mn > 150 ? 1 : 0; // white or light grey
  }
  // flood fill the outside (checkerboard + old white outline) from the borders
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (neutral[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(); const x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  // character mask
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = outside[i] ? 0 : 1;
  // drop tiny specks: keep the largest connected blob
  const label = new Int32Array(w * h); let best = 0, bestSize = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    id++; let size = 0; const st = [s]; label[s] = id;
    while (st.length) {
      const i = st.pop(); size++; const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx;
        if (mask[j] && !label[j]) { label[j] = id; st.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  for (let i = 0; i < w * h; i++) mask[i] = label[i] === best ? 1 : 0;
  // fill holes (enclosed neutral islands are character: white shirt etc. already counted since not reached)
  // shave 2px of old-outline halo so no grey fringe stays
  const m1 = await gray(Uint8Array.from(mask, (v) => v * 255), (i) => i.blur(1.4));
  mask = Uint8Array.from(m1, (v) => (v > 200 ? 1 : 0));
  const alpha = Buffer.from(Uint8Array.from(mask, (v) => v * 255));
  // character with feathered edge
  const soft = await gray(alpha, (i) => i.blur(0.8));
  const charRgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { charRgba[i * 4] = data[i * 3]; charRgba[i * 4 + 1] = data[i * 3 + 1]; charRgba[i * 4 + 2] = data[i * 3 + 2]; charRgba[i * 4 + 3] = soft[i]; }
  await sharp(charRgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile('char.png');
  // new sticker ring: dilate by ~16px, round, white
  const ringBlur = await gray(alpha, (i) => i.blur(11));
  const ringHard = await gray(ringBlur, (i) => i.threshold(20));
  const ringA = await gray(ringHard, (i) => i.blur(1.3));
  const white = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { white[i * 4] = 255; white[i * 4 + 1] = 255; white[i * 4 + 2] = 255; white[i * 4 + 3] = ringA[i]; }
  const shadowA = await gray(ringA, (i) => i.blur(7));
  const shadow = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { shadow[i * 4] = 40; shadow[i * 4 + 1] = 30; shadow[i * 4 + 2] = 10; shadow[i * 4 + 3] = Math.round(shadowA[i] * 0.28); }
  const raw = (b) => ({ input: b, raw: { width: w, height: h, channels: 4 } });
  const out = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ ...raw(shadow), top: 8, left: 0 }, raw(white), raw(charRgba)]).png().toBuffer();
  await sharp(out).trim().toFile('base-trim.png');
  await sharp(out).toFile('base-full.png');
  const m = await sharp('base-trim.png').metadata();
  console.log('trimmed size', m.width, m.height);
  // preview on a coloured background
  await sharp({ create: { width: m.width + 40, height: m.height + 40, channels: 4, background: '#CFE8A0' } }).composite([{ input: await sharp('base-trim.png').toBuffer(), top: 20, left: 20 }]).png().toFile('preview-base.png');
})();
