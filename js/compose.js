/*
  Billedmotor: filtre, beskæring og de færdige layouts (enkelt, strimmel, collage).
  Filtre regnes som farvematricer, så det gemte billede matcher live-previewet 1:1
  — også i Safari, hvor canvas ikke understøtter ctx.filter.
*/

const PAPER = '#f7f1e6';
const INK = '#16131c';

/* ---------- Filtre ---------- */

export const FILTERS = [
  { id: 'natural', label: 'Naturlig', ops: [] },
  { id: 'glow', label: 'Glød', ops: [['sepia', 0.16], ['saturate', 1.25], ['brightness', 1.06], ['contrast', 1.04]] },
  { id: 'noir', label: 'Noir', ops: [['grayscale', 1], ['contrast', 1.22], ['brightness', 1.04]] },
  { id: 'retro', label: 'Retro', ops: [['sepia', 0.5], ['contrast', 0.94], ['saturate', 1.15], ['brightness', 1.05]] },
];

export const getFilter = (id) => FILTERS.find((f) => f.id === id) || FILTERS[0];

export const cssFilter = (id) => {
  const ops = getFilter(id).ops;
  return ops.length ? ops.map(([fn, v]) => `${fn}(${v})`).join(' ') : 'none';
};

// Hver operation som 3x4-matrix (rækker: r,g,b · kolonner: r,g,b,konstant), jf. CSS Filter Effects.
function opMatrix(fn, v) {
  switch (fn) {
    case 'brightness':
      return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    case 'contrast': {
      const o = 0.5 * (1 - v);
      return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o];
    }
    case 'saturate':
      return [
        0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0,
      ];
    case 'grayscale': {
      const a = 1 - v;
      return [
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a, 0,
      ];
    }
    case 'sepia': {
      const a = 1 - v;
      return [
        0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0,
      ];
    }
    default:
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  }
}

// b efter a
function mul(b, a) {
  const out = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      out[r * 4 + c] = b[r * 4] * a[c] + b[r * 4 + 1] * a[4 + c] + b[r * 4 + 2] * a[8 + c] + (c === 3 ? b[r * 4 + 3] : 0);
    }
  }
  return out;
}

function applyFilter(ctx, w, h, id) {
  const ops = getFilter(id).ops;
  if (!ops.length) return;
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  for (const [fn, v] of ops) m = mul(opMatrix(fn, v), m);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [a, b, c, k1, e, f, g, k2, i, j, k, k3] = m;
  const o1 = k1 * 255;
  const o2 = k2 * 255;
  const o3 = k3 * 255;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p];
    const gr = d[p + 1];
    const bl = d[p + 2];
    d[p] = a * r + b * gr + c * bl + o1;
    d[p + 1] = e * r + f * gr + g * bl + o2;
    d[p + 2] = i * r + j * gr + k * bl + o3;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- Layouts ---------- */

/**
 * Geometri for hver tilstand. `cells` er felterne som kameraet fylder;
 * søgeren på skærmen får samme format som feltet, så det man ser er det man får.
 */
export function layoutFor(mode, portrait) {
  if (mode === 'strip') {
    const W = 1200;
    const m = 64;
    const gap = 36;
    const cw = W - m * 2;
    const ch = Math.round((cw * 3) / 4);
    const footer = 300;
    const H = m + ch * 3 + gap * 2 + footer;
    return {
      W,
      H,
      paper: true,
      footer: { x: 0, y: H - footer, w: W, h: footer },
      cells: [0, 1, 2].map((n) => ({ x: m, y: m + n * (ch + gap), w: cw, h: ch })),
    };
  }
  if (mode === 'collage') {
    const W = portrait ? 1800 : 2400;
    const H = portrait ? 2400 : 1800;
    const m = 56;
    const gap = 28;
    const footer = portrait ? 250 : 220;
    const cw = Math.floor((W - m * 2 - gap) / 2);
    const ch = Math.floor((H - m - gap - footer) / 2);
    return {
      W,
      H,
      paper: true,
      footer: { x: 0, y: H - footer, w: W, h: footer },
      cells: [0, 1, 2, 3].map((n) => ({ x: m + (n % 2) * (cw + gap), y: m + Math.floor(n / 2) * (ch + gap), w: cw, h: ch })),
    };
  }
  const W = portrait ? 1800 : 2400;
  const H = portrait ? 2400 : 1800;
  return { W, H, paper: false, cells: [{ x: 0, y: 0, w: W, h: H }] };
}

export const MODES = [
  { id: 'single', label: 'Foto', shots: 1 },
  { id: 'strip', label: 'Strimmel', shots: 3 },
  { id: 'collage', label: 'Collage', shots: 4 },
];

export const shotsFor = (mode) => (MODES.find((m) => m.id === mode) || MODES[0]).shots;

/* ---------- Optagelse ---------- */

/** Tag ét felt fra videoen: beskåret til feltets format, spejlvendt og filtreret. */
export function grabCell(video, cell, { mirror, filter }) {
  const canvas = document.createElement('canvas');
  canvas.width = cell.w;
  canvas.height = cell.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const target = cell.w / cell.h;
  let sw = vw;
  let sh = vh;
  if (vw / vh > target) sw = vh * target;
  else sh = vw / target;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(cell.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cell.w, cell.h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyFilter(ctx, cell.w, cell.h, filter);
  return canvas;
}

const logoCache = new Map();
function loadLogo(src) {
  if (!src) return Promise.resolve(null);
  if (logoCache.has(src)) return logoCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  logoCache.set(src, p);
  return p;
}

function fitText(ctx, text, maxWidth, size, font) {
  let s = size;
  do {
    ctx.font = font(s);
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 18);
  return s;
}

function spaced(ctx, text, x, y, spacing, align = 'left') {
  // letter-spacing på canvas uden at være afhængig af ctx.letterSpacing
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
  return total;
}

function drawBrand(ctx, x, y, size, color, logo, align) {
  if (logo) {
    const h = size * 2.4;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ctx.drawImage(logo, lx, y - h / 2, w, h);
    return;
  }
  ctx.font = `600 ${size}px Outfit, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  spaced(ctx, 'MINGLO', x, y, size * 0.34, align);
}

/** Saml de optagne felter til det færdige billede. */
export async function compose(mode, portrait, cellCanvases, settings) {
  const L = layoutFor(mode, portrait);
  const canvas = document.createElement('canvas');
  canvas.width = L.W;
  canvas.height = L.H;
  const ctx = canvas.getContext('2d');
  const logo = await loadLogo(settings.logo);
  const name = (settings.eventName || '').trim();
  const date = (settings.eventDate || '').trim();

  if (L.paper) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, L.W, L.H);
    L.cells.forEach((c, n) => {
      if (cellCanvases[n]) ctx.drawImage(cellCanvases[n], c.x, c.y);
    });

    // Fod: eventnavn i serif, dato og mærke
    const f = L.footer;
    const cx = f.x + f.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = INK;
    const big = mode === 'strip' ? 84 : 96;
    fitText(ctx, name, f.w - 160, big, (s) => `italic 400 ${s}px "Instrument Serif", serif`);
    ctx.fillText(name, cx, f.y + f.h * 0.34);
    if (date) {
      ctx.font = `500 ${mode === 'strip' ? 24 : 28}px Outfit, sans-serif`;
      ctx.fillStyle = 'rgba(22,19,28,0.6)';
      spaced(ctx, date.toUpperCase(), cx, f.y + f.h * 0.6, 6, 'center');
    }
    drawBrand(ctx, cx, f.y + f.h * 0.82, mode === 'strip' ? 20 : 22, 'rgba(22,19,28,0.75)', logo, 'center');
  } else {
    ctx.drawImage(cellCanvases[0], 0, 0);

    // Blød skygge i bunden, så teksten står skarpt på alle motiver
    const gh = L.H * 0.3;
    const g = ctx.createLinearGradient(0, L.H - gh, 0, L.H);
    g.addColorStop(0, 'rgba(8,6,12,0)');
    g.addColorStop(1, 'rgba(8,6,12,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.H - gh, L.W, gh);

    const pad = 90;
    const base = L.H - pad;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    const brandRoom = 380;
    fitText(ctx, name, L.W - pad * 2 - brandRoom, 112, (s) => `italic 400 ${s}px "Instrument Serif", serif`);
    ctx.fillText(name, pad, date ? base - 52 : base);
    if (date) {
      ctx.font = '500 30px Outfit, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      spaced(ctx, date.toUpperCase(), pad + 4, base, 7);
    }
    drawBrand(ctx, L.W - pad, base - 16, 32, 'rgba(255,255,255,0.92)', logo, 'right');
  }
  return canvas;
}

export const toJpeg = (canvas, quality = 0.9) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

export function makeThumb(canvas, long = 560) {
  const scale = long / Math.max(canvas.width, canvas.height);
  const t = document.createElement('canvas');
  t.width = Math.round(canvas.width * scale);
  t.height = Math.round(canvas.height * scale);
  const ctx = t.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, t.width, t.height);
  return toJpeg(t, 0.8);
}
