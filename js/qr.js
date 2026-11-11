/* QR-kode som SVG (bygger på qrcode-generator, MIT — se vendor/). */
import qrcode from '../vendor/qrcode.mjs';

export function qrSvg(text, { dark = '#16131c' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges" role="img" aria-label="QR-kode"><path fill="${dark}" d="${d}"/></svg>`;
}
