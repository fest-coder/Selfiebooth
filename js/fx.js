/* Effekter: konfetti og lyd (syntetiseret — ingen lydfiler at hente). */

const COLORS = ['#ff5fa2', '#ff8a5b', '#ffd68a', '#ecd09a', '#ffffff', '#b79bff'];

export function confetti(canvas, { count = 150 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvas.width = canvas.clientWidth * dpr);
  const h = (canvas.height = canvas.clientHeight * dpr);
  const ctx = canvas.getContext('2d');
  const parts = Array.from({ length: count }, (_, n) => {
    const fromLeft = n % 2 === 0;
    const angle = (fromLeft ? -Math.PI / 3 : (-2 * Math.PI) / 3) + (Math.random() - 0.5) * 0.9;
    const speed = (0.9 + Math.random() * 1.1) * Math.max(w, h) * 0.014;
    return {
      x: fromLeft ? -10 : w + 10,
      y: h * (0.55 + Math.random() * 0.3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: (5 + Math.random() * 8) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI,
      color: COLORS[n % COLORS.length],
      round: n % 5 === 0,
    };
  });
  const started = performance.now();
  const token = (canvas._run = Symbol('run'));

  function frame(now) {
    if (canvas._run !== token) return;
    const t = now - started;
    ctx.clearRect(0, 0, w, h);
    const fade = t > 2600 ? Math.max(0, 1 - (t - 2600) / 900) : 1;
    for (const p of parts) {
      p.vy += 0.16 * dpr;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.tilt += 0.12;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, (-p.size * 0.3 * Math.cos(p.tilt)) / 1, p.size, p.size * 0.6 * Math.cos(p.tilt));
      }
      ctx.restore();
    }
    if (t < 3500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}

/* ---------- Lyd ---------- */

let audio = null;
function ac() {
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

/** Kald i et tryk, så iOS låser lyden op. */
export const unlockAudio = () => void ac();

function tone(freq, dur, { type = 'sine', gain = 0.12, when = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  tick: () => tone(660, 0.16),
  go: () => tone(990, 0.22, { gain: 0.14 }),
  shutter() {
    const a = ac();
    if (!a) return;
    const len = Math.floor(a.sampleRate * 0.09);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = 0.35;
    src.connect(g).connect(a.destination);
    src.start();
  },
  yay() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, n) => tone(f, 0.5, { type: 'triangle', gain: 0.09, when: n * 0.07 }));
  },
};
