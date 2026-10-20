const sharp = require('sharp');
const [,, file, x0, y0, x1, y1, scale, out] = process.argv;
(async () => {
  const X0 = +x0, Y0 = +y0, W = +x1 - X0, H = +y1 - Y0, S = +scale;
  const base = await sharp(file).flatten({ background: '#5a6b4a' }).extract({ left: X0, top: Y0, width: W, height: H }).resize(W * S, H * S, { kernel: 'lanczos3' }).toBuffer();
  let lines = '';
  for (let x = Math.ceil(X0 / 20) * 20; x < X0 + W; x += 20) { const sx = (x - X0) * S; const major = x % 100 === 0; lines += `<line x1="${sx}" y1="0" x2="${sx}" y2="${H * S}" stroke="${major ? '#ff00ff' : '#00000044'}" stroke-width="${major ? 1.5 : 0.7}"/>${x % 40 === 0 ? `<text x="${sx + 2}" y="12" font-size="11" fill="#fff" stroke="#000" stroke-width=".4">${x}</text>` : ''}`; }
  for (let y = Math.ceil(Y0 / 20) * 20; y < Y0 + H; y += 20) { const sy = (y - Y0) * S; const major = y % 100 === 0; lines += `<line x1="0" y1="${sy}" x2="${W * S}" y2="${sy}" stroke="${major ? '#ff00ff' : '#00000044'}" stroke-width="${major ? 1.5 : 0.7}"/>${y % 40 === 0 ? `<text x="2" y="${sy - 2}" font-size="11" fill="#fff" stroke="#000" stroke-width=".4">${y}</text>` : ''}`; }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}">${lines}</svg>`);
  await sharp(base).composite([{ input: svg }]).png().toFile(out);
})();
